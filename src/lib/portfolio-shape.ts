/**
 * Shared between the server fetcher and the client charts, so it must stay free of
 * `server-only` imports — `portfolio.ts` pulls in the credential store and would
 * fail the build if a client component reached it.
 *
 * The series are dynamic rather than the blueprint's fixed BusinessA/BusinessB keys:
 * an agency has however many MCP-enabled ad accounts it has.
 */

/** One chart series — one ad account. */
export interface PortfolioSeries {
  /** Row key holding this account's value. Safe for use as a Recharts dataKey. */
  key: string;
  label: string;
  color: string;
}

/** One day. Series values are keyed by `PortfolioSeries.key`. */
export interface PortfolioPoint {
  date: string;
  iso: string;
  [seriesKey: string]: string | number | null;
}

export interface KpiTile {
  label: string;
  value: string;
  hint: string;
}

export interface PortfolioResult {
  spend: PortfolioPoint[];
  leads: PortfolioPoint[];
  series: PortfolioSeries[];
  kpis: KpiTile[];
  currency: string;
  /** 'sample' means nothing live was reached — the UI must say so rather than imply real numbers. */
  source: 'live' | 'sample';
  notice?: string;
}

/**
 * Validated categorical palette (CVD separation and normal-vision floor checked
 * against a white surface). Assigned in fixed order, never cycled.
 */
export const SERIES_COLORS = ['#3b82f6', '#10b981', '#eb6834', '#eda100'];

const SAMPLE_SERIES: PortfolioSeries[] = [
  { key: 's0', label: 'E-Commerce Shop', color: SERIES_COLORS[0] },
  { key: 's1', label: 'SaaS Startup', color: SERIES_COLORS[1] },
];

const SAMPLE_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SAMPLE_SPEND = [
  [1200, 900], [1500, 1100], [1800, 1250], [1400, 980],
  [2100, 1600], [2500, 1750], [2200, 1500],
];
const SAMPLE_LEADS = [
  [32, 18], [41, 21], [29, 35], [38, 28], [45, 40], [52, 31], [48, 34],
];

function sampleRows(values: number[][]): PortfolioPoint[] {
  return SAMPLE_DAYS.map((date, i) => ({
    date,
    iso: `2026-07-0${i + 1}`,
    s0: values[i][0],
    s1: values[i][1],
  }));
}

/** Placeholder used only when nothing live could be reached. */
export const SAMPLE_PORTFOLIO: PortfolioResult = {
  spend: sampleRows(SAMPLE_SPEND),
  leads: sampleRows(SAMPLE_LEADS),
  series: SAMPLE_SERIES,
  kpis: [
    { label: 'Total Ad Spend', value: '$12,700', hint: 'sample' },
    { label: 'Leads', value: '285', hint: 'sample' },
    { label: 'Cost Per Lead', value: '$44.56', hint: 'sample' },
    { label: 'Active Ad Accounts', value: '2', hint: 'sample' },
  ],
  currency: 'USD',
  source: 'sample',
};
