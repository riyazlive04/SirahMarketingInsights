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
  /** Meta's own words for why MCP is off on this account, when it says. */
  mcpDisabledReason?: string | null;
}

export interface AccountListResult {
  accounts: SelectableAccount[];
  error?: string;
  /** True when the failure is a dead/rejected token, so the UI can say what to do. */
  tokenExpired?: boolean;
  /**
   * Why MCP is not being used, when it is not. Previously this fell through to the
   * Marketing API in silence, so a dashboard reading "0 via MCP" gave the user no way
   * to find out whether the rollout had not reached them, a scope was missing, or
   * something had simply broken.
   */
  mcpNotice?: string;
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

  let mcpNotice: string | undefined;

  try {
    const viaMcp = await listAdAccounts(token);

    if (viaMcp.length) {
      const disabled = viaMcp.filter((a) => !a.mcpEnabled);

      return {
        accounts: viaMcp.map((a) => ({
          id: a.id,
          name: a.name || a.businessName || a.id,
          currency: a.currency,
          mcpEnabled: a.mcpEnabled,
          mcpDisabledReason: a.disabledReason,
        })),
        // The MCP listing worked, so the token is fine and the scope is present —
        // Meta simply has not switched these accounts on yet.
        mcpNotice: disabled.length
          ? `${disabled.length} of ${viaMcp.length} ad account${viaMcp.length === 1 ? ' is' : 's are'} ` +
            'not yet enabled for Meta\'s Ads MCP server, so they report through the ' +
            'Marketing API instead. The numbers are the same; only the route differs. ' +
            (disabled[0].disabledReason ? `Meta says: “${disabled[0].disabledReason}”` : '')
          : undefined,
      };
    }

    mcpNotice =
      'The MCP server returned no ad accounts, so the Marketing API was used instead.';
  } catch (error) {
    if (isTokenProblem(error)) return { accounts: [], error: tokenMessage(error), tokenExpired: true };

    // Fall through — the Marketing API may still work — but say why, and leave a
    // server-side trace. A silent fallback is why "0 via MCP" used to be a dead end.
    console.warn('[accounts] MCP listing failed, falling back to the Marketing API:', describe(error));

    mcpNotice =
      `Meta's Ads MCP server could not be reached (${describe(error)}), so everything is ` +
      'reporting through the Marketing API. The most common cause is a token without the ' +
      'ads_mcp_management permission.';
  }

  try {
    const viaGraph = await listGraphAdAccounts(token);

    return {
      accounts: viaGraph.map((a) => ({ ...a, mcpEnabled: false })),
      mcpNotice,
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
