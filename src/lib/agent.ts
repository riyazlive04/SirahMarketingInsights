import 'server-only';

import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { type McpTool, callMetaMcpTool, listMetaMcpTools, mcpResultToText } from '@/lib/mcp';

/**
 * The missing piece in the PRD's architecture.
 *
 * Meta's MCP host exposes tools, not a chat endpoint, so a free-text question needs a
 * model to pick a tool, call it, read the result, and write the answer. This runs
 * that loop server-side: the Meta access token is used only by our own process to
 * call `tools/call`, and is never sent to OpenAI. Only the tool *schemas* and the
 * tool *results* go to the model.
 */

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';
const MAX_TURNS = Number(process.env.OPENAI_MAX_TURNS ?? 6);

const SYSTEM_PROMPT = [
  'You are a Meta Ads analyst embedded in a marketing dashboard.',
  'Answer using the Meta Ads MCP tools available to you — never invent metrics.',
  'If no tool can supply a number, say so plainly rather than estimating.',
  'Be concise and concrete: lead with the answer, then the figures that support it.',
  'Report currency and percentages exactly as the tools return them.',
].join(' ');

export interface AgentToolCall {
  name: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  resultPreview: string;
}

export interface AgentAnswer {
  text: string;
  toolCalls: AgentToolCall[];
  /** Raw payloads, kept so the chat can render inline dashboard nodes (PRD Feature 2). */
  raw: unknown[];
}

let cachedClient: OpenAI | null = null;

function openai(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set.');
  }

  cachedClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return cachedClient;
}

/** OpenAI restricts function names to [a-zA-Z0-9_-]{1,64}. */
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

function toOpenAiTools(tools: McpTool[]): {
  openAiTools: ChatCompletionTool[];
  bySanitizedName: Map<string, string>;
} {
  const bySanitizedName = new Map<string, string>();

  const openAiTools = tools.map((tool): ChatCompletionTool => {
    const safe = sanitizeName(tool.name);
    bySanitizedName.set(safe, tool.name);

    // MCP `inputSchema` is already JSON Schema, which is what OpenAI wants.
    const parameters =
      tool.inputSchema && typeof tool.inputSchema === 'object'
        ? (tool.inputSchema as Record<string, unknown>)
        : { type: 'object', properties: {} };

    return {
      type: 'function',
      function: {
        name: safe,
        description: tool.description?.slice(0, 1024),
        parameters,
      },
    };
  });

  return { openAiTools, bySanitizedName };
}

/**
 * Answers `question` for one company by letting the model drive Meta's MCP tools.
 * `accessToken` never leaves this process.
 */
export async function answerWithMetaTools(
  accessToken: string,
  question: string,
): Promise<AgentAnswer> {
  const tools = await listMetaMcpTools(accessToken);

  if (!tools.length) {
    return {
      text:
        'This ad account has no Meta MCP tools enabled yet, so there is nothing to ' +
        'query. Check that the "Create & manage ads with ads MCP server" use case is ' +
        'active for the app and that the token carries ads_mcp_management + ads_read.',
      toolCalls: [],
      raw: [],
    };
  }

  const { openAiTools, bySanitizedName } = toOpenAiTools(tools);

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: question },
  ];

  const executed: AgentToolCall[] = [];
  const raw: unknown[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const completion = await openai().chat.completions.create({
      model: MODEL,
      messages,
      tools: openAiTools,
    });

    const choice = completion.choices[0]?.message;
    if (!choice) break;

    if (!choice.tool_calls?.length) {
      return { text: choice.content ?? '(no answer)', toolCalls: executed, raw };
    }

    messages.push(choice);

    for (const call of choice.tool_calls) {
      if (call.type !== 'function') continue;

      const realName = bySanitizedName.get(call.function.name) ?? call.function.name;

      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        // Model emitted malformed JSON — report it back so it can retry.
      }

      try {
        const result = await callMetaMcpTool(accessToken, realName, args);
        const text = mcpResultToText(result);

        raw.push(result);
        executed.push({ name: realName, arguments: args, ok: true, resultPreview: text.slice(0, 200) });

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          // Cap the payload so one huge report cannot blow the context window.
          content: text.slice(0, 12_000),
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'unknown error';

        executed.push({ name: realName, arguments: args, ok: false, resultPreview: detail });

        // Feed the failure back rather than aborting — the model can pick another tool.
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: `Tool call failed: ${detail}`,
        });
      }
    }
  }

  return {
    text: `Stopped after ${MAX_TURNS} tool-calling turns without a final answer. Try a narrower question.`,
    toolCalls: executed,
    raw,
  };
}
