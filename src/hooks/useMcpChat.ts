'use client';

import { useCallback, useState } from 'react';

export interface McpChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Raw MCP payload, kept so the chat can render inline dashboard nodes (PRD §1.3, Feature 2). */
  data?: unknown;
}

interface UseMcpChatOptions {
  /** Gateway route that proxies to the Meta MCP host. */
  api: string;
  /** Extra fields merged into every request body. */
  body?: Record<string, unknown>;
}

/**
 * Drop-in replacement for the Vercel AI SDK's `useChat` that speaks the JSON
 * request/response contract of `src/app/api/mcp-chat/route.ts` (PRD §5.1).
 *
 * The SDK's `useChat` expects the endpoint to return an AI SDK stream protocol
 * response; the blueprint route returns a single `NextResponse.json` body, so the
 * two cannot be wired together as written. This hook exposes the identical surface
 * (`messages` / `input` / `handleInputChange` / `handleSubmit` / `isLoading`) so
 * `AdChatbot` matches the blueprint markup line for line. Swap this import for
 * `@ai-sdk/react` once the gateway route is converted to a streaming response.
 */
export function useMcpChat({ api, body }: UseMcpChatOptions) {
  const [messages, setMessages] = useState<McpChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value),
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      const prompt = input.trim();
      if (!prompt || isLoading) return;

      const userMessage: McpChatMessage = {
        id: `user-${messages.length}`,
        role: 'user',
        content: prompt,
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setIsLoading(true);

      try {
        const res = await fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, message: prompt }),
        });

        const payload = await res.json();

        if (!res.ok) {
          throw new Error(payload?.error ?? `Gateway responded with ${res.status}.`);
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${prev.length}`,
            role: 'assistant',
            content: extractText(payload.data),
            data: payload.data,
          },
        ]);
      } catch (error: unknown) {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${prev.length}`,
            role: 'assistant',
            content:
              error instanceof Error
                ? `Could not reach the Meta MCP host: ${error.message}`
                : 'Could not reach the Meta MCP host.',
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [api, body, input, isLoading, messages.length],
  );

  // `setInput` is not part of the blueprint's surface, but the copilot's suggestion
  // chips need to fill the composer without faking a change event.
  return { messages, input, setInput, handleInputChange, handleSubmit, isLoading };
}

/**
 * Meta's MCP response envelope is not pinned by the PRD, so probe the common text
 * carriers before falling back to the pretty-printed payload.
 */
function extractText(data: unknown): string {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return String(data);

  const record = data as Record<string, unknown>;
  for (const key of ['message', 'text', 'content', 'response', 'output']) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }

  return JSON.stringify(data, null, 2);
}
