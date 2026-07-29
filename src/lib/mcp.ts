import 'server-only';

import crypto from 'crypto';

/**
 * Client for Meta's remote Ads MCP server.
 *
 * The PRD blueprint posted `{ message, capabilities }` to the host and read back a
 * chat-style answer. That is not what the server is. Probing the live endpoint:
 *
 *   GET  https://mcp.facebook.com/ads
 *   -> 405 {"detail":"MCP endpoints accept POST for JSON-RPC; GET is not supported."}
 *
 *   POST (no auth)
 *   -> 401 WWW-Authenticate: Bearer resource_metadata="...", scope="ads_management
 *      ads_read catalog_management business_management pages_show_list
 *      instagram_basic ads_mcp_management"
 *
 * So it is a Streamable HTTP MCP server speaking JSON-RPC 2.0 (spec 2025-06-18):
 * `initialize`, then a `notifications/initialized` notification, then `tools/list`
 * and `tools/call`. There is no free-text "message" surface at all.
 *
 * 401 means no credential was presented; 403 means the credential was rejected.
 */

export const META_MCP_URL =
  process.env.META_MCP_URL ?? 'https://mcp.facebook.com/ads';

const PROTOCOL_VERSION = '2025-06-18';

const CLIENT_INFO = {
  name: 'ayn-meta-mcp-dashboard',
  version: '1.0.0',
};

export class McpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly rpcCode?: number,
  ) {
    super(message);
    this.name = 'McpError';
  }
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface McpSession {
  sessionId: string | null;
  createdAt: number;
}

/**
 * Sessions are keyed by a hash of the access token, never the token itself, so a
 * heap dump or log of the cache keys does not expose credentials. Cached because
 * re-running the handshake on every request would triple the round-trips.
 */
const SESSION_TTL_MS = 10 * 60 * 1000;
const globalForMcp = globalThis as unknown as { __mcpSessions?: Map<string, McpSession> };

function sessionStore(): Map<string, McpSession> {
  globalForMcp.__mcpSessions ??= new Map();
  return globalForMcp.__mcpSessions;
}

function sessionKey(accessToken: string): string {
  return crypto.createHash('sha256').update(accessToken).digest('hex');
}

/** One raw JSON-RPC POST. Handles both response encodings the spec allows. */
async function rpc(
  accessToken: string,
  body: unknown,
  sessionId: string | null,
  expectResponse: boolean,
): Promise<{ response: JsonRpcResponse | null; sessionId: string | null; status: number }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    // The spec requires the client to advertise both; the server picks one.
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': PROTOCOL_VERSION,
  };

  if (sessionId) headers['Mcp-Session-Id'] = sessionId;

  const res = await fetch(META_MCP_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const returnedSession = res.headers.get('mcp-session-id') ?? sessionId;

  if (!res.ok) {
    // 404 on a session-carrying request means the session expired; the caller
    // re-initializes rather than failing the user's request.
    const detail = await res.text().catch(() => '');
    throw new McpError(
      `Meta MCP responded ${res.status} ${res.statusText}${detail ? `: ${detail.slice(0, 300)}` : ''}`,
      res.status,
    );
  }

  if (!expectResponse) {
    return { response: null, sessionId: returnedSession, status: res.status };
  }

  const contentType = res.headers.get('content-type') ?? '';
  const raw = await res.text();

  const parsed = contentType.includes('text/event-stream')
    ? parseSseForResponse(raw)
    : (JSON.parse(raw) as JsonRpcResponse);

  if (!parsed) {
    throw new McpError('Meta MCP returned no JSON-RPC response.', res.status);
  }

  if (parsed.error) {
    throw new McpError(
      `Meta MCP error ${parsed.error.code}: ${parsed.error.message}`,
      res.status,
      parsed.error.code,
    );
  }

  return { response: parsed, sessionId: returnedSession, status: res.status };
}

/** Pulls the first JSON-RPC message carrying a result/error out of an SSE body. */
function parseSseForResponse(raw: string): JsonRpcResponse | null {
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;

    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;

    try {
      const message = JSON.parse(payload) as JsonRpcResponse;
      if (message.result !== undefined || message.error !== undefined) return message;
    } catch {
      // Partial or non-JSON event — keep scanning.
    }
  }

  return null;
}

/** Runs the handshake and caches the resulting session. */
async function initialize(accessToken: string): Promise<McpSession> {
  const init = await rpc(
    accessToken,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: CLIENT_INFO,
      },
    },
    null,
    true,
  );

  // The spec requires this notification before any other request. It is a
  // notification, so there is no response body (expect 202).
  await rpc(
    accessToken,
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    init.sessionId,
    false,
  );

  const session: McpSession = { sessionId: init.sessionId, createdAt: Date.now() };
  sessionStore().set(sessionKey(accessToken), session);

  return session;
}

async function currentSession(accessToken: string): Promise<McpSession> {
  const cached = sessionStore().get(sessionKey(accessToken));

  if (cached && Date.now() - cached.createdAt < SESSION_TTL_MS) return cached;

  return initialize(accessToken);
}

/** Issues a request, transparently re-initializing once if the session lapsed. */
async function withSession(
  accessToken: string,
  method: string,
  params: unknown,
): Promise<unknown> {
  const attempt = async (session: McpSession) => {
    const { response } = await rpc(
      accessToken,
      { jsonrpc: '2.0', id: 2, method, params },
      session.sessionId,
      true,
    );
    return response?.result;
  };

  try {
    return await attempt(await currentSession(accessToken));
  } catch (error) {
    const expired =
      error instanceof McpError && (error.status === 404 || error.status === 400);

    if (!expired) throw error;

    sessionStore().delete(sessionKey(accessToken));
    return attempt(await initialize(accessToken));
  }
}

/** The server's actual tool catalogue. Meta's docs are unreliable; ask the server. */
export async function listMetaMcpTools(accessToken: string): Promise<McpTool[]> {
  const result = (await withSession(accessToken, 'tools/list', {})) as
    | { tools?: McpTool[] }
    | undefined;

  return result?.tools ?? [];
}

export async function callMetaMcpTool(
  accessToken: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  return withSession(accessToken, 'tools/call', { name, arguments: args });
}

/**
 * Flattens an MCP `tools/call` result into text. Content blocks are
 * `{ type: 'text', text }`; structured payloads may arrive as `structuredContent`.
 */
export function mcpResultToText(result: unknown): string {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return String(result ?? '');

  const record = result as Record<string, unknown>;

  if (Array.isArray(record.content)) {
    const text = record.content
      .filter((block): block is { type: string; text: string } =>
        Boolean(block) &&
        typeof block === 'object' &&
        (block as { type?: unknown }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string',
      )
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (text) return text;
  }

  if (record.structuredContent) return JSON.stringify(record.structuredContent, null, 2);

  return JSON.stringify(result, null, 2);
}
