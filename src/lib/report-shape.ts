/**
 * Shared between the server report builder and the client components, so it must
 * stay free of `server-only` imports.
 *
 * Every metric is `number | null`. Null means "Meta did not report this", which the
 * UI renders as an em dash — never as 0. A zero that is really a missing value is
 * exactly the kind of hidden number this report exists to avoid.
 */

export interface ReportRow {
  /**
   * Stable unique key. Meta allows duplicate campaign/ad *names* — duplicating an ad
   * keeps its name — so `label` is not unique and must never be used as a React key.
   */
  id: string;
  label: string;

  // Spend & delivery
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  frequency: number | null;

  // Engagement
  clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;

  // Link clicks
  linkClicks: number | null;
  linkCtr: number | null;
  costPerLinkClick: number | null;
  outboundClicks: number | null;

  // Video
  videoPlays: number | null;
  video25: number | null;
  video50: number | null;
  video75: number | null;
  video100: number | null;
  thruplays: number | null;
  avgWatchSeconds: number | null;

  // Conversions
  leads: number | null;
  leadActionType: string | null;
  costPerLead: number | null;
}

export interface SectionStatus {
  available: boolean;
  reason?: string;
}

export interface ClientReport {
  account: { id: string; name: string; currency: string; viaMcp: boolean };
  rangeLabel: string;
  /** Date of the most recent row, so the client can see how fresh the report is. */
  dataThrough: string | null;
  totals: ReportRow;
  daily: ReportRow[];
  campaigns: ReportRow[];
  ads: ReportRow[];
  sections: {
    video: SectionStatus;
    links: SectionStatus;
    leads: SectionStatus;
    campaigns: SectionStatus;
    ads: SectionStatus;
    daily: SectionStatus;
  };
}

/** Validated categorical palette — assigned in fixed order, never cycled. */
export const REPORT_COLORS = ['#3b82f6', '#10b981', '#eb6834', '#eda100'];
