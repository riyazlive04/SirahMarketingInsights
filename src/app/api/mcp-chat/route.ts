import { NextRequest, NextResponse } from 'next/server';
import { answerWithMetaTools } from '@/lib/agent';
import {
  McpError,
  callMetaMcpTool,
  listMetaMcpTools,
  mcpResultToText,
} from '@/lib/mcp';
import { getMetaCredential, markCredentialInvalid } from '@/lib/meta-credentials';
import { authorizeCompany } from '@/lib/session';

/**
 * Gateway between the browser and Meta's remote MCP host.
 *
 * The access token is never accepted from the request body — it is decrypted from
 * `meta_credentials` for the company the session user is authorised on. A client
 * that lies about `companyId` gets 403, not someone else's ad spend.
 *
 * ARCHITECTURE NOTE: an MCP server exposes *tools*, not a chat endpoint. It cannot
 * answer "why did my ROAS drop?" — something has to read the question, choose a
 * tool, call it, and write the answer. That something is an LLM, which the PRD's
 * design omits entirely. Until one is wired in, a free-text message returns the real
 * tool catalogue so the UI stays informative; passing an explicit `tool` invokes it.
 */
/**
 * The agent loop is OpenAI → Meta MCP → OpenAI, up to `OPENAI_MAX_TURNS` times, so this
 * is by far the slowest route in the app and the one that will hit a serverless
 * platform's default function timeout first. 60s is the ceiling on Vercel's Hobby plan;
 * raise it if you are on a plan that allows more and the copilot is being cut off.
 */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let activeCompanyId: string | null = null;

  try {
    const { message, companyId, tool, args } = await req.json();

    if (typeof companyId !== 'string' || !companyId) {
      return NextResponse.json(
        { error: 'No active company. Sign in and select a business.' },
        { status: 401 },
      );
    }

    if (!tool && (typeof message !== 'string' || !message.trim())) {
      return NextResponse.json({ error: 'A message is required.' }, { status: 400 });
    }

    const session = await authorizeCompany(companyId);
    if (!session) {
      return NextResponse.json(
        { error: 'You do not have access to this company.' },
        { status: 403 },
      );
    }

    activeCompanyId = session.companyId;

    const credential = await getMetaCredential(session.companyId, session.userId);
    if (!credential) {
      return NextResponse.json(
        { error: 'No valid Meta credential is connected for this company.' },
        { status: 409 },
      );
    }

    if (typeof tool === 'string' && tool) {
      const result = await callMetaMcpTool(credential.accessToken, tool, args ?? {});
      return NextResponse.json({ data: { text: mcpResultToText(result), raw: result } });
    }

    // Free text needs a model to choose and call tools. Without a key configured,
    // fall back to showing the real catalogue rather than failing opaquely.
    if (!process.env.OPENAI_API_KEY) {
      const tools = await listMetaMcpTools(credential.accessToken);
      const catalogue = tools.length
        ? tools.map((t) => `• ${t.name}${t.description ? ` — ${t.description.slice(0, 120)}` : ''}`).join('\n')
        : '(this account has no MCP tools enabled yet)';

      return NextResponse.json({
        data: {
          text:
            'OPENAI_API_KEY is not set, so there is no model to interpret the question. ' +
            `Meta's MCP server exposes tools rather than free-text chat.\n\n` +
            `Tools available to this ad account:\n${catalogue}`,
          tools,
        },
      });
    }

    const answer = await answerWithMetaTools(credential.accessToken, message);

    return NextResponse.json({
      data: { text: answer.text, toolCalls: answer.toolCalls, raw: answer.raw },
    });
  } catch (error: unknown) {
    if (error instanceof McpError) {
      if (error.status === 401 || error.status === 403) {
        if (activeCompanyId) {
          await markCredentialInvalid(activeCompanyId).catch(() => {});
        }

        return NextResponse.json(
          { error: 'The stored Meta token was rejected. Reconnect the ad account.' },
          { status: 502 },
        );
      }

      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    // Don't leak stack traces or connection strings to the browser.
    console.error('[mcp-chat] gateway error', error);
    return NextResponse.json({ error: 'Gateway error encountered.' }, { status: 500 });
  }
}
