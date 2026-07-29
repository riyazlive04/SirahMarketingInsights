import 'server-only';

import {
  GraphApiError,
  REPORT_FIELDS,
  dominantLead,
  firstActionValue,
  getGraphAccount,
  getGraphInsights,
  listGraphAdAccounts,
} from '@/lib/meta-graph';
import { getMetaCredential, markCredentialInvalid } from '@/lib/meta-credentials';
import { listAdAccounts } from '@/lib/meta-metrics';
import { McpError } from '@/lib/mcp';
import type { ClientReport, ReportRow, SectionStatus } from '@/lib/report-shape';

/**
 * Builds the full client-facing report: every number a client is entitled to see,
 * with each section explicitly marked as present, empty, or unavailable. A section
 * that Meta cannot supply says so rather than rendering a convincing zero — that is
 * the difference between a transparent report and a misleading one.
 */

const DATE_PRESET = process.env.META_REPORT_DATE_PRESET ?? 'last_30d';

const ALL_FIELDS = [
  ...REPORT_FIELDS.core,
  ...REPORT_FIELDS.links,
  ...REPORT_FIELDS.video,
  ...REPORT_FIELDS.actions,
];

export async function buildClientReport(
  companyId: string,
  userId: string,
  adAccountId?: string,
): Promise<ClientReport | { error: string; needsCredential?: boolean }> {
  let credential;

  try {
    credential = await getMetaCredential(companyId, userId);
  } catch (error) {
    return { error: `Credential store unavailable: ${describe(error)}` };
  }

  if (!credential) {
    return {
      error:
        'No valid Meta credential is connected. If it was working earlier, the token ' +
        'expired and was flagged automatically — Graph API Explorer tokens last 1–2 hours.',
      needsCredential: true,
    };
  }

  const token = credential.accessToken;

  try {
    // Prefer MCP's listing (it reports which accounts are MCP-enabled), but never
    // let an MCP-side failure hide accounts the Marketing API can still read.
    let accounts: { id: string; name: string; currency: string; mcpEnabled: boolean; queryable: boolean }[];

    try {
      accounts = await listAdAccounts(token);
    } catch {
      accounts = (await listGraphAdAccounts(token)).map((a) => ({
        ...a,
        mcpEnabled: false,
        queryable: true,
      }));
    }

    const withSpend = accounts.filter((a) => a.queryable);

    if (!withSpend.length) return { error: 'No queryable ad accounts on this token.' };

    // Pick the requested account, else the first one reporting spend in range.
    const chosen = adAccountId
      ? withSpend.find((a) => a.id === adAccountId)
      : await firstFunded(token, withSpend.map((a) => a.id));

    const accountId = chosen && typeof chosen === 'object' ? chosen.id : (chosen as string | undefined);
    if (!accountId) return { error: 'None of your ad accounts reported spend in this period.' };

    const meta = await getGraphAccount(token, accountId).catch(() => null);
    const account = withSpend.find((a) => a.id === accountId);

    const [totalsRows, dailyRows, campaignRows, adRows] = await Promise.all([
      getGraphInsights(token, { adAccountId: accountId, datePreset: DATE_PRESET, level: 'account', fields: ALL_FIELDS }),
      getGraphInsights(token, { adAccountId: accountId, datePreset: DATE_PRESET, level: 'account', timeIncrement: '1', limit: 400, fields: ALL_FIELDS }),
      getGraphInsights(token, { adAccountId: accountId, datePreset: DATE_PRESET, level: 'campaign', limit: 100, fields: ['campaign_name', 'campaign_id', ...ALL_FIELDS] }),
      getGraphInsights(token, { adAccountId: accountId, datePreset: DATE_PRESET, level: 'ad', limit: 100, fields: ['ad_name', 'ad_id', 'campaign_name', ...ALL_FIELDS] }),
    ]);

    const totals = toRow(totalsRows[0]?.raw ?? {}, 'Account total');
    const daily = dailyRows.map((row) => toRow(row.raw, String(row.raw.date_start ?? '')));
    // The index fallback guards the case where Meta omits an id — without it two
    // identically-named campaigns would still collide.
    const campaigns = disambiguate(
      campaignRows
        .map((row, i) => toRow(row.raw, String(row.raw.campaign_name ?? 'Unnamed campaign'), `campaign-${i}`))
        .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0)),
    );
    const ads = disambiguate(
      adRows
        .map((row, i) => toRow(row.raw, String(row.raw.ad_name ?? 'Unnamed ad'), `ad-${i}`))
        .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0)),
    );

    return {
      account: {
        id: accountId,
        name: meta?.name ?? account?.name ?? accountId,
        currency: meta?.currency ?? account?.currency ?? '',
        viaMcp: account?.mcpEnabled ?? false,
      },
      rangeLabel: humanRange(DATE_PRESET),
      dataThrough: daily.at(-1)?.label ?? null,
      totals,
      daily,
      campaigns,
      ads,
      sections: {
        video: statusOf(totals.videoPlays, 'No video metrics — these campaigns ran no video creative.'),
        links: statusOf(totals.linkClicks, 'No link-click data reported for this period.'),
        leads: statusOf(totals.leads, 'No lead conversions reported for this period.'),
        campaigns: statusOf(campaigns.length, 'Meta returned no campaign rows for this period.'),
        ads: statusOf(ads.length, 'Meta returned no ad rows for this period.'),
        daily: statusOf(daily.length, 'Meta returned no day-wise rows for this period.'),
      },
    };
  } catch (error) {
    // A dead token surfaces differently depending on which API noticed first:
    // Graph reports code 190, MCP answers 403. Both mean "re-authenticate".
    const badToken =
      (error instanceof GraphApiError && (error.code === 190 || error.code === 102)) ||
      (error instanceof McpError && (error.status === 401 || error.status === 403));

    if (badToken) {
      await markCredentialInvalid(companyId).catch(() => {});

      return {
        needsCredential: true,
        error:
          `The Meta access token is no longer valid (${describe(error)}). ` +
          'Graph API Explorer tokens last only 1–2 hours. Get a 60-day token with ' +
          '`npm run token:exchange`, or generate a System User token (Business Settings → ' +
          'Users → System Users) which never expires. Then re-run `npm run seed`.',
      };
    }

    return { error: `Could not reach Meta: ${describe(error)}` };
  }
}

/**
 * Meta allows two campaigns or ads to share a name (duplicating an ad keeps its
 * name). Two identical rows carrying different numbers is precisely the ambiguity a
 * transparency report exists to remove, so repeated labels get a short id suffix.
 * Unique labels are left untouched.
 */
function disambiguate(rows: ReportRow[]): ReportRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.label, (counts.get(row.label) ?? 0) + 1);

  return rows.map((row) =>
    (counts.get(row.label) ?? 0) > 1
      ? { ...row, label: `${row.label} · ${row.id.slice(-6)}` }
      : row,
  );
}

/** Finds the first account with non-zero spend so the report is not blank by default. */
async function firstFunded(token: string, ids: string[]): Promise<string | undefined> {
  for (const id of ids) {
    try {
      const rows = await getGraphInsights(token, {
        adAccountId: id,
        datePreset: DATE_PRESET,
        level: 'account',
        fields: ['spend'],
      });

      if ((Number(rows[0]?.raw.spend) || 0) > 0) return id;
    } catch {
      // Skip accounts this token cannot read.
    }
  }

  return undefined;
}

function toRow(raw: Record<string, unknown>, label: string, fallbackId?: string): ReportRow {
  const leads = dominantLead(raw.actions as never);

  // Prefer Meta's own ids; names collide, dates are unique per daily row.
  const id = String(
    raw.ad_id ?? raw.campaign_id ?? raw.date_start ?? fallbackId ?? label,
  );

  const impressions = numOf(raw.impressions);
  const clicks = numOf(raw.clicks);
  const spend = numOf(raw.spend);
  const linkClicks = numOf(raw.inline_link_clicks);

  return {
    id,
    label,
    spend,
    impressions,
    reach: numOf(raw.reach),
    frequency: numOf(raw.frequency),
    clicks,
    ctr: numOf(raw.ctr),
    cpc: numOf(raw.cpc),
    cpm: numOf(raw.cpm),
    linkClicks,
    linkCtr: numOf(raw.inline_link_click_ctr),
    costPerLinkClick: numOf(raw.cost_per_inline_link_click),
    outboundClicks: firstActionValue(raw.outbound_clicks),
    videoPlays: firstActionValue(raw.video_play_actions),
    video25: firstActionValue(raw.video_p25_watched_actions),
    video50: firstActionValue(raw.video_p50_watched_actions),
    video75: firstActionValue(raw.video_p75_watched_actions),
    video100: firstActionValue(raw.video_p100_watched_actions),
    thruplays: firstActionValue(raw.video_thruplay_watched_actions),
    avgWatchSeconds: firstActionValue(raw.video_avg_time_watched_actions),
    leads: leads?.value ?? null,
    leadActionType: leads?.actionType ?? null,
    costPerLead: leads?.value && spend ? spend / leads.value : null,
  };
}

function statusOf(value: number | null, emptyMessage: string): SectionStatus {
  return value && value > 0 ? { available: true } : { available: false, reason: emptyMessage };
}

function numOf(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function humanRange(preset: string): string {
  const map: Record<string, string> = {
    today: 'Today',
    yesterday: 'Yesterday',
    last_3d: 'Last 3 days',
    last_7d: 'Last 7 days',
    last_14d: 'Last 14 days',
    last_30d: 'Last 30 days',
    last_90d: 'Last 90 days',
    this_month: 'This month',
    last_month: 'Last month',
    maximum: 'All time',
  };

  return map[preset] ?? preset;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
