import 'server-only';

import type { EntityRow } from '@/lib/meta-metrics';

/**
 * Marketing API fallback for ad accounts Meta has not enabled for MCP.
 *
 * Meta is rolling the Ads MCP server out per ad account. Accounts still waiting
 * reject every MCP query outright:
 *
 *   "This ad account is not enabled for the Ads MCP. Ads MCP is being gradually
 *    rolled out across ad accounts. Please check back at a later date."
 *
 * ...even when `ads_get_ad_accounts` reports `is_queryable: true`. The classic
 * `/act_<id>/insights` endpoint serves those accounts today using the same token
 * and the same `ads_read` scope, so the dashboard uses MCP where it is enabled and
 * this where it is not. Drop this module once Meta finishes the rollout.
 *
 * Unlike MCP, this endpoint returns plain numeric strings ("9237.27"), not
 * display-formatted ones — so no currency stripping is needed.
 */

const API_VERSION = process.env.META_GRAPH_VERSION ?? 'v23.0';
const GRAPH_BASE = 'https://graph.facebook.com';

export class GraphApiError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GraphApiError';
  }
}

interface GraphAction {
  action_type: string;
  value: string;
}

interface InsightsRow {
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  reach?: string;
  actions?: GraphAction[];
  date_start?: string;
  campaign_name?: string;
  [key: string]: unknown;
}

export interface GraphQuery {
  adAccountId: string;
  datePreset?: string;
  /** '1' for daily rows; omit for a single aggregate row. */
  timeIncrement?: string;
  level?: 'account' | 'campaign' | 'adset' | 'ad';
  limit?: number;
  /** Overrides the default field set. */
  fields?: readonly string[];
}

/** Everything the client report needs, by section. */
export const REPORT_FIELDS = {
  core: ['spend', 'impressions', 'reach', 'frequency', 'clicks', 'ctr', 'cpc', 'cpm'],
  links: ['inline_link_clicks', 'inline_link_click_ctr', 'cost_per_inline_link_click', 'outbound_clicks'],
  video: [
    'video_play_actions',
    'video_p25_watched_actions',
    'video_p50_watched_actions',
    'video_p75_watched_actions',
    'video_p100_watched_actions',
    'video_thruplay_watched_actions',
    'video_avg_time_watched_actions',
  ],
  actions: ['actions'],
} as const;

/** Meta wraps several metrics as `[{ action_type, value }]` even when scalar. */
export function firstActionValue(value: unknown): number | null {
  if (Array.isArray(value)) {
    const total = value.reduce((sum, item) => {
      const parsed = num((item as GraphAction | undefined)?.value);
      return sum + (parsed ?? 0);
    }, 0);

    return value.length ? total : null;
  }

  return num(value);
}

/**
 * Action types that can represent a lead. Meta reports the SAME conversion under
 * several overlapping names, so summing is wrong — a real account shows:
 *
 *     2  lead
 *     2  onsite_conversion.lead_grouped
 *   118  offsite_complete_registration_add_meta_leads
 *   116  complete_registration
 *
 * ...where 118 offsite registrations are the campaign's actual result and the `lead`
 * entry is an unrelated trickle. Nor is a fixed priority safe: which type carries the
 * real volume depends on the campaign's optimisation goal. So take the largest and
 * report which type it came from, rather than pretending "leads" is unambiguous.
 */
const LEAD_ACTION_TYPES = new Set([
  'lead',
  'leadgen_grouped',
  'onsite_conversion.lead',
  'onsite_conversion.lead_grouped',
  'onsite_web_lead',
  'complete_registration',
  'omni_complete_registration',
  'offsite_complete_registration_add_meta_leads',
  'offsite_conversion.fb_pixel_complete_registration',
]);

export interface LeadCount {
  value: number;
  actionType: string;
}

/** The largest lead-ish action on a row, with the action type that produced it. */
export function dominantLead(actions: GraphAction[] | undefined): LeadCount | null {
  if (!actions?.length) return null;

  let best: LeadCount | null = null;

  for (const action of actions) {
    if (!LEAD_ACTION_TYPES.has(action.action_type)) continue;

    const value = num(action.value);
    if (value === null) continue;

    if (!best || value > best.value) best = { value, actionType: action.action_type };
  }

  return best;
}

export async function getGraphInsights(
  accessToken: string,
  query: GraphQuery,
): Promise<EntityRow[]> {
  const params = new URLSearchParams({
    fields: (query.fields ?? [
      'spend',
      'impressions',
      'clicks',
      'ctr',
      'cpc',
      'reach',
      'actions',
      'campaign_name',
    ]).join(','),
    date_preset: query.datePreset ?? 'last_30d',
    access_token: accessToken,
  });

  if (query.timeIncrement) params.set('time_increment', query.timeIncrement);
  if (query.level) params.set('level', query.level);
  if (query.limit) params.set('limit', String(query.limit));

  const url = `${GRAPH_BASE}/${API_VERSION}/act_${query.adAccountId}/insights?${params}`;

  const res = await fetch(url, { cache: 'no-store' });
  const body = (await res.json()) as { data?: InsightsRow[]; error?: { message: string; code: number } };

  if (body.error) {
    throw new GraphApiError(body.error.message, body.error.code, res.status);
  }

  return (body.data ?? []).map((row) => {
    const leads = dominantLead(row.actions);

    return {
      id: query.adAccountId,
      name: row.campaign_name ?? '',
      dateStart: row.date_start ?? null,
      metrics: {
        amount_spent: num(row.spend),
        impressions: num(row.impressions),
        clicks: num(row.clicks),
        ctr: num(row.ctr),
        cpc: num(row.cpc),
        reach: num(row.reach),
        lead: leads?.value ?? null,
      },
      raw: { ...row, lead_action_type: leads?.actionType ?? null },
    };
  });
}

/**
 * Lists ad accounts without going through MCP. Used when the MCP listing fails —
 * otherwise an MCP-side problem would hide accounts that the Marketing API can
 * still read perfectly well.
 */
export async function listGraphAdAccounts(
  accessToken: string,
): Promise<{ id: string; name: string; currency: string }[]> {
  const params = new URLSearchParams({
    fields: 'account_id,name,currency,account_status',
    limit: '50',
    access_token: accessToken,
  });

  const res = await fetch(`${GRAPH_BASE}/${API_VERSION}/me/adaccounts?${params}`, {
    cache: 'no-store',
  });

  const body = (await res.json()) as {
    data?: { account_id?: string; name?: string; currency?: string }[];
    error?: { message: string; code: number };
  };

  if (body.error) throw new GraphApiError(body.error.message, body.error.code, res.status);

  return (body.data ?? []).map((row) => ({
    id: String(row.account_id ?? ''),
    name: row.name ?? String(row.account_id ?? ''),
    currency: row.currency ?? '',
  }));
}

/**
 * The permissions actually granted on a token, straight from Meta.
 *
 * Works for any user or system-user token, including ones minted by somebody else's
 * app — unlike `debug_token`, which requires the app secret of the app that issued it.
 * That makes this the only way to know what a *pasted* token can do, which matters
 * because "why is there no MCP data?" is almost always answered by a missing
 * `ads_mcp_management` here.
 *
 * Returns an empty array rather than throwing: not knowing the scopes is a worse
 * diagnostic, never a reason to reject a token that otherwise works.
 */
export async function listGrantedPermissions(accessToken: string): Promise<string[]> {
  const params = new URLSearchParams({ access_token: accessToken });

  try {
    const res = await fetch(`${GRAPH_BASE}/${API_VERSION}/me/permissions?${params}`, {
      cache: 'no-store',
    });

    const body = (await res.json()) as {
      data?: { permission?: string; status?: string }[];
      error?: unknown;
    };

    if (body.error || !body.data) return [];

    return body.data
      .filter((row) => row.status === 'granted' && row.permission)
      .map((row) => row.permission as string);
  } catch {
    return [];
  }
}

/** Reads account name and currency, which the insights edge does not return. */
export async function getGraphAccount(
  accessToken: string,
  adAccountId: string,
): Promise<{ name: string; currency: string } | null> {
  const params = new URLSearchParams({
    fields: 'name,currency',
    access_token: accessToken,
  });

  const res = await fetch(`${GRAPH_BASE}/${API_VERSION}/act_${adAccountId}?${params}`, {
    cache: 'no-store',
  });

  const body = (await res.json()) as { name?: string; currency?: string; error?: unknown };
  if (body.error || !body.name) return null;

  return { name: body.name, currency: body.currency ?? '' };
}

function num(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

