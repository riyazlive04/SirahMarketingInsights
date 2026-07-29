import 'server-only';

import { callMetaMcpTool } from '@/lib/mcp';

/**
 * Typed access to `ads_get_ad_entities`, the synchronous reporting tool.
 * (`ads_entity_schedule_report` / `ads_entity_get_report` are its async fallback
 * pair and are only meant to be used after this one times out.)
 *
 * Two things the raw tool does that callers should not have to know about:
 *
 *  1. `ad_entities` comes back as a JSON *string*, not an array.
 *  2. Every metric is a display-formatted string — `"₹35,691.51 INR"`,
 *     `"3,106"`, `"2.87%"` — and unavailable metrics arrive as the literal
 *     `"Not available"`, `null`, or a `{ "indicator": "mixed" }` object.
 *
 * Charts need numbers, so everything is coerced here and `null` means "no value",
 * never zero. A zero would silently draw a real datapoint at the baseline.
 */

export interface AdAccount {
  id: string;
  name: string;
  businessName: string;
  currency: string;
  mcpEnabled: boolean;
  queryable: boolean;
  disabledReason: string | null;
}

export interface EntityRow {
  id: string;
  name: string;
  /** Present only when `time_increment` was requested. */
  dateStart: string | null;
  metrics: Record<string, number | null>;
  raw: Record<string, unknown>;
}

/** Metric fields valid at ad_account level for these accounts. */
export const ACCOUNT_METRIC_FIELDS = [
  'amount_spent',
  'impressions',
  'clicks',
  'ctr',
  'cpc',
  'cpm',
  'reach',
  'lead',
  'cost_per_lead',
] as const;

interface EntitiesEnvelope {
  ad_entities?: string | unknown[];
  error_message?: string;
  error_category?: string;
}

/** Lists ad accounts, flagging which ones Meta has actually enabled for MCP. */
export async function listAdAccounts(accessToken: string): Promise<AdAccount[]> {
  const payload = (await callMetaMcpTool(accessToken, 'ads_get_ad_accounts', {
    limit: 50,
  })) as { ad_accounts?: Record<string, unknown>[] } | undefined;

  const unwrapped = unwrapToolResult(payload) as
    | { ad_accounts?: Record<string, unknown>[] }
    | undefined;

  return (unwrapped?.ad_accounts ?? []).map((row) => ({
    id: String(row.ad_account_id ?? ''),
    name: String(row.ad_account_name || row.business_name || row.ad_account_id || ''),
    businessName: String(row.business_name ?? ''),
    currency: String(row.currency ?? ''),
    mcpEnabled: row.is_ads_mcp_enabled === true,
    queryable: row.is_queryable !== false,
    disabledReason: (row.is_ads_mcp_disabled_reason as string | null) ?? null,
  }));
}

export interface EntityQuery {
  adAccountId: string;
  fields: readonly string[];
  level?: 'ad_account' | 'campaign' | 'adset' | 'ad';
  datePreset?: string;
  /** '1' for daily rows, 'monthly', or omitted for a single aggregate row. */
  timeIncrement?: string;
  limit?: number;
}

export async function getAdEntities(
  accessToken: string,
  query: EntityQuery,
): Promise<EntityRow[]> {
  const args: Record<string, unknown> = {
    ad_account_id: query.adAccountId,
    level: query.level ?? 'ad_account',
    fields: ['id', 'name', ...query.fields],
  };

  if (query.datePreset) args.date_preset = query.datePreset;
  if (query.timeIncrement) args.time_increment = query.timeIncrement;
  if (query.limit) args.limit = query.limit;

  const result = unwrapToolResult(
    await callMetaMcpTool(accessToken, 'ads_get_ad_entities', args),
  ) as EntitiesEnvelope | undefined;

  if (result?.error_message) {
    throw new Error(`ads_get_ad_entities: ${result.error_message}`);
  }

  const entities = result?.ad_entities;
  const rows: unknown[] =
    typeof entities === 'string' ? safeJsonArray(entities) : Array.isArray(entities) ? entities : [];

  return rows.filter(isRecord).map((row) => {
    const metrics: Record<string, number | null> = {};
    for (const field of query.fields) metrics[field] = toNumber(row[field]);

    return {
      id: String(row.id ?? ''),
      name: String(row.name ?? ''),
      dateStart: typeof row.date_start === 'string' ? row.date_start : null,
      metrics,
      raw: row,
    };
  });
}

/**
 * MCP tool results are usually `{ content: [{ type: 'text', text: '<json>' }] }`.
 * Unwrap to the payload the tool actually returned.
 */
function unwrapToolResult(result: unknown): unknown {
  if (!isRecord(result)) return result;

  if (Array.isArray(result.content)) {
    for (const block of result.content) {
      if (!isRecord(block) || typeof block.text !== 'string') continue;

      try {
        return JSON.parse(block.text);
      } catch {
        // Not JSON — fall through to the other carriers.
      }
    }
  }

  if (result.structuredContent) return result.structuredContent;

  return result;
}

function safeJsonArray(text: string): unknown[] {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Coerces Meta's display strings to numbers.
 *
 *   "₹35,691.51 INR" -> 35691.51      (the space is U+00A0)
 *   "3,106"          -> 3106
 *   "2.87%"          -> 2.87
 *   "Not available"  -> null
 *   { indicator }    -> null
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed || /^not available$/i.test(trimmed)) return null;

  // Strip currency symbols, ISO codes, percent signs, and thousands separators,
  // keeping only digits, a decimal point and a leading minus.
  const cleaned = trimmed.replace(/,/g, '').replace(/[^0-9.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Reads the ISO currency code out of a formatted amount, e.g. "₹1.00 INR" -> "INR". */
export function currencyOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/\b([A-Z]{3})\b/);
  return match ? match[1] : null;
}

/**
 * Two formats reach this: MCP returns `"August 11, 2024"`, the Marketing API
 * returns `"2026-07-21"`. Charts want a short label and a sortable key.
 */
export function parseMetaDate(value: string | null): { iso: string; label: string } | null {
  if (!value) return null;

  // `new Date("2026-07-21")` is parsed as UTC midnight, so reading it back with the
  // local getters shifts the day for anyone west of UTC. Handle ISO without Date.
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const local = new Date(Number(year), Number(month) - 1, Number(day));

    return {
      iso: `${year}-${month}-${day}`,
      label: local.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  // `new Date("August 11, 2024")` is local midnight, so toISOString() would shift the
  // day backwards for any timezone east of UTC (IST turns it into the 10th). Build the
  // key from local parts — Meta's dates are calendar days, not instants.
  const iso = [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getDate()).padStart(2, '0'),
  ].join('-');

  const label = parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return { iso, label };
}
