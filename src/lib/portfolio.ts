import 'server-only';

import { McpError } from '@/lib/mcp';
import { getMetaCredential, markCredentialInvalid } from '@/lib/meta-credentials';
import { getGraphInsights } from '@/lib/meta-graph';
import {
  type AdAccount,
  type EntityRow,
  currencyOf,
  getAdEntities,
  listAdAccounts,
  parseMetaDate,
} from '@/lib/meta-metrics';
import {
  type KpiTile,
  type PortfolioPoint,
  type PortfolioResult,
  type PortfolioSeries,
  SAMPLE_PORTFOLIO,
  SERIES_COLORS,
} from '@/lib/portfolio-shape';

export type { PortfolioResult };
export { SAMPLE_PORTFOLIO };

/** How far back the timeline looks. */
const DATE_PRESET = process.env.META_MCP_DATE_PRESET ?? 'last_30d';
const MAX_DAYS = 60;

/** Fields fetched per day. ROAS is deliberately absent — see the notice logic below. */
const DAILY_FIELDS = ['amount_spent', 'impressions', 'clicks', 'ctr', 'cpc', 'lead'] as const;
const TOTAL_FIELDS = [
  'amount_spent',
  'impressions',
  'clicks',
  'ctr',
  'cpc',
  'lead',
  'cost_per_lead',
] as const;

/**
 * Builds the dashboard payload from live Meta data. Never throws at the page
 * boundary — a dashboard that renders with an explicit "sample data" notice beats
 * a 500.
 */
export async function fetchPortfolioMetrics(
  companyId: string,
  userId: string,
  /** Restrict to one ad account; omit to chart every account with spend. */
  adAccountId?: string,
): Promise<PortfolioResult> {
  let credential;

  try {
    credential = await getMetaCredential(companyId, userId);
  } catch (error) {
    return sample(`Credential store unavailable: ${describe(error)}`);
  }

  if (!credential) {
    // `is_valid` is set to false automatically when Meta rejects the stored token,
    // so the usual cause here is expiry rather than a missing connection.
    return sample(
      'No valid Meta credential is connected. If the token was working earlier it has ' +
        'expired and was flagged automatically — Graph API Explorer tokens last 1–2 hours. ' +
        'Run `npm run token:exchange` for a 60-day token (or use a System User token), ' +
        'then `npm run seed`.',
    );
  }

  const token = credential.accessToken;

  try {
    const accounts = await listAdAccounts(token);
    const usable = accounts.filter(
      (a) => a.queryable && (!adAccountId || a.id === adAccountId),
    );

    if (!usable.length) {
      return sample(
        adAccountId
          ? `Ad account ${adAccountId} is not available on this token.`
          : 'No queryable ad accounts are available on this token.',
      );
    }

    // One aggregate row and one daily series per account, all concurrently.
    const perAccount = await Promise.all(
      usable.map(async (account) => ({
        account,
        totals: await safeRows(token, account, TOTAL_FIELDS, undefined),
        daily: await safeRows(token, account, DAILY_FIELDS, '1'),
      })),
    );

    // Accounts with zero recorded spend would draw a flat line at zero and push the
    // real accounts down the palette, so they are dropped from the charts.
    const funded = perAccount.filter(
      (entry) => (entry.totals[0]?.metrics.amount_spent ?? 0) > 0,
    );

    if (!funded.length) {
      return sample(
        `${usable.length} MCP-enabled account(s) found, but none have recorded spend.`,
      );
    }

    const series: PortfolioSeries[] = funded.map((entry, index) => ({
      key: `s${index}`,
      label: entry.account.name || entry.account.id,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
    }));

    const spend = pivot(funded, series, 'amount_spent');
    const leads = pivot(funded, series, 'lead');

    const currency =
      currencyOf(funded[0].totals[0]?.raw.amount_spent) ?? funded[0].account.currency ?? '';

    return {
      spend,
      leads,
      series,
      kpis: buildKpis(funded, currency, funded.length),
      currency,
      source: 'live',
      notice: [rolloutNotice(accounts, funded), roasNotice(funded)]
        .filter(Boolean)
        .join(' '),
    };
  } catch (error) {
    // 401/403 means the stored token was revoked or expired — flag it so the UI can
    // prompt for re-auth instead of failing the same way on every load.
    if (error instanceof McpError && (error.status === 401 || error.status === 403)) {
      await markCredentialInvalid(companyId).catch(() => {});
      return sample('The stored Meta token was rejected. Reconnect the ad account.');
    }

    return sample(`Could not reach Meta MCP: ${describe(error)}`);
  }
}

interface AccountData {
  account: AdAccount;
  totals: EntityRow[];
  daily: EntityRow[];
}

/**
 * Fetches one account's rows, preferring MCP and falling back to the Marketing API
 * for accounts Meta has not enabled yet. A single bad account must not blank the
 * whole dashboard, so failures collapse to an empty series.
 */
async function safeRows(
  token: string,
  account: AdAccount,
  fields: readonly string[],
  timeIncrement: string | undefined,
): Promise<EntityRow[]> {
  if (account.mcpEnabled) {
    try {
      const rows = await getAdEntities(token, {
        adAccountId: account.id,
        fields,
        level: 'ad_account',
        datePreset: DATE_PRESET,
        timeIncrement,
        limit: timeIncrement ? 400 : undefined,
      });

      if (rows.length) return rows;
    } catch {
      // Fall through to the Graph API rather than dropping the account.
    }
  }

  try {
    return await getGraphInsights(token, {
      adAccountId: account.id,
      datePreset: DATE_PRESET,
      timeIncrement,
      level: 'account',
      limit: timeIncrement ? 400 : undefined,
    });
  } catch {
    return [];
  }
}

/**
 * Turns per-account daily rows into chart rows keyed by series, keeping only the
 * most recent MAX_DAYS across the union of dates any account reported.
 */
function pivot(
  accounts: AccountData[],
  series: PortfolioSeries[],
  metric: string,
): PortfolioPoint[] {
  const byIso = new Map<string, PortfolioPoint>();

  accounts.forEach((entry, index) => {
    const key = series[index].key;

    for (const row of entry.daily) {
      const date = parseMetaDate(row.dateStart);
      if (!date) continue;

      const point = byIso.get(date.iso) ?? { date: date.label, iso: date.iso };
      point[key] = row.metrics[metric] ?? 0;
      byIso.set(date.iso, point);
    }
  });

  const ordered = [...byIso.values()].sort((a, b) => a.iso.localeCompare(b.iso));

  // Recharts renders a gap for undefined, which would misread as "no spend".
  for (const point of ordered) {
    for (const s of series) point[s.key] ??= 0;
  }

  const window = ordered.slice(-MAX_DAYS);

  // These accounts have sparse history, so `maximum` can span years. Without the
  // year the axis reads "2 Oct, 6 Jun, 7 Jan" and looks like time running backwards.
  const years = new Set(window.map((point) => point.iso.slice(0, 4)));
  if (years.size > 1) {
    for (const point of window) {
      point.date = `${point.date} ’${point.iso.slice(2, 4)}`;
    }
  }

  return window;
}

function buildKpis(
  accounts: AccountData[],
  currency: string,
  accountCount: number,
): KpiTile[] {
  const sum = (metric: string) =>
    accounts.reduce((total, entry) => total + (entry.totals[0]?.metrics[metric] ?? 0), 0);

  const spend = sum('amount_spent');
  const leads = sum('lead');
  const clicks = sum('clicks');
  const impressions = sum('impressions');

  const money = (value: number) =>
    `${currency ? `${currency} ` : ''}${value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return [
    {
      label: 'Total Ad Spend',
      value: money(spend),
      hint: `${accounts.length} funded account${accounts.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Leads',
      // Naming the action type matters: "leads" is not one number on Meta's side,
      // and this figure is whichever conversion the campaigns actually optimise for.
      value: leads.toLocaleString(),
      hint: leads
        ? `${money(spend / leads)} per lead · ${leadSourceLabel(accounts)}`
        : 'no leads recorded',
    },
    {
      label: 'Click-Through Rate',
      value: impressions ? `${((clicks / impressions) * 100).toFixed(2)}%` : '—',
      hint: `${clicks.toLocaleString()} clicks / ${impressions.toLocaleString()} impressions`,
    },
    {
      label: 'Active Accounts',
      value: String(accountCount),
      hint: `${accounts.filter((entry) => entry.account.mcpEnabled).length} via MCP, ` +
        `${accounts.filter((entry) => !entry.account.mcpEnabled).length} via Marketing API`,
    },
  ];
}

/** Names the Meta action type the lead figure came from, when there is one. */
function leadSourceLabel(accounts: AccountData[]): string {
  const types = new Set(
    accounts
      .map((entry) => entry.totals[0]?.raw.lead_action_type)
      .filter((type): type is string => typeof type === 'string'),
  );

  if (types.size === 1) return `via ${[...types][0]}`;
  if (types.size > 1) return `via ${types.size} action types`;

  return 'lead conversions';
}

/**
 * Meta is enabling the Ads MCP server account by account. Accounts still waiting
 * are served by the Marketing API instead, which is worth saying out loud — the
 * numbers are equally live, but they did not come through MCP.
 */
function rolloutNotice(all: AdAccount[], funded: AccountData[]): string {
  const viaGraph = funded.filter((entry) => !entry.account.mcpEnabled);
  if (!viaGraph.length) return '';

  const names = viaGraph.map((entry) => entry.account.name).join(', ');
  const enabled = all.filter((a) => a.mcpEnabled).length;

  return (
    `${names} ${viaGraph.length === 1 ? 'is' : 'are'} not MCP-enabled yet ` +
    `(${enabled} of ${all.length} accounts are), so ${viaGraph.length === 1 ? 'it is' : 'they are'} ` +
    'read via the Marketing API instead.'
  );
}

/**
 * These are lead-generation accounts: `purchase_roas` comes back null and
 * `results` as `{ indicator: 'mixed' }`. Saying so is better than charting a
 * ROAS line that is silently always zero.
 */
function roasNotice(accounts: AccountData[]): string | undefined {
  const anyRoas = accounts.some((entry) => {
    const raw = entry.totals[0]?.raw.purchase_roas;
    return typeof raw === 'string' && !/not available/i.test(raw);
  });

  return anyRoas
    ? undefined
    : 'No purchase ROAS is reported for these accounts — they optimise for leads, ' +
        'so the charts show spend and leads instead.';
}

function sample(notice: string): PortfolioResult {
  return { ...SAMPLE_PORTFOLIO, notice };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
