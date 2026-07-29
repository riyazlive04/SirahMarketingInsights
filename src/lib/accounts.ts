import 'server-only';

import { McpError } from '@/lib/mcp';
import { GraphApiError, listGraphAdAccounts } from '@/lib/meta-graph';
import { getMetaCredential } from '@/lib/meta-credentials';
import { listAdAccounts } from '@/lib/meta-metrics';

export interface SelectableAccount {
  id: string;
  name: string;
  currency: string;
  mcpEnabled: boolean;
}

export interface AccountListResult {
  accounts: SelectableAccount[];
  error?: string;
  /** True when the failure is a dead/rejected token, so the UI can say what to do. */
  tokenExpired?: boolean;
}

/**
 * Lists the ad accounts this company's token can see, so the user can pick one
 * instead of the app guessing. Prefers MCP (it reports `is_ads_mcp_enabled`) and
 * falls back to the Marketing API, which reaches accounts MCP has not rolled out to.
 */
export async function listSelectableAccounts(
  companyId: string,
  userId: string,
): Promise<AccountListResult> {
  let credential;

  try {
    credential = await getMetaCredential(companyId, userId);
  } catch (error) {
    return { accounts: [], error: `Credential store unavailable: ${describe(error)}` };
  }

  if (!credential) {
    return {
      accounts: [],
      error:
        'No valid Meta credential is connected. If the token expired it was flagged ' +
        'automatically — add a fresh META_ACCESS_TOKEN to .env.local and run `npm run seed`.',
      tokenExpired: true,
    };
  }

  const token = credential.accessToken;

  try {
    const viaMcp = await listAdAccounts(token);
    if (viaMcp.length) {
      return {
        accounts: viaMcp.map((a) => ({
          id: a.id,
          name: a.name || a.businessName || a.id,
          currency: a.currency,
          mcpEnabled: a.mcpEnabled,
        })),
      };
    }
  } catch (error) {
    if (isTokenProblem(error)) return { accounts: [], error: tokenMessage(error), tokenExpired: true };
    // Otherwise fall through — the Marketing API may still work.
  }

  try {
    const viaGraph = await listGraphAdAccounts(token);

    return {
      accounts: viaGraph.map((a) => ({ ...a, mcpEnabled: false })),
    };
  } catch (error) {
    return {
      accounts: [],
      error: isTokenProblem(error) ? tokenMessage(error) : `Could not list ad accounts: ${describe(error)}`,
      tokenExpired: isTokenProblem(error),
    };
  }
}

function isTokenProblem(error: unknown): boolean {
  return (
    (error instanceof GraphApiError && (error.code === 190 || error.code === 102)) ||
    (error instanceof McpError && (error.status === 401 || error.status === 403))
  );
}

function tokenMessage(error: unknown): string {
  return (
    `The Meta access token is no longer valid (${describe(error)}). ` +
    'Graph API Explorer tokens last only 1–2 hours. Run `npm run token:exchange` for a ' +
    '60-day token, or use a System User token that never expires, then `npm run seed`.'
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
