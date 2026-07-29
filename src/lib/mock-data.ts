/**
 * Simulated campaign data for the V1 dashboard shell (PRD §6, Step 4).
 * Replace with live MCP `reporting_and_insights` pulls once App A has Advanced
 * Access on `ads_read`.
 */

export interface KpiTile {
  label: string;
  value: string;
  delta: string;
  trend: 'up' | 'down';
}

export const KPI_TILES: KpiTile[] = [
  { label: 'Absolute Spend', value: '$48,210', delta: '+12.4%', trend: 'up' },
  { label: 'ROAS', value: '3.82x', delta: '-0.41x', trend: 'down' },
  { label: 'CTR', value: '1.94%', delta: '+0.22pp', trend: 'up' },
  { label: 'CPC', value: '$0.87', delta: '-$0.06', trend: 'up' },
];

export interface ConversionPoint {
  date: string;
  prospecting: number;
  retargeting: number;
  lookalike: number;
}

export const CONVERSION_SERIES: ConversionPoint[] = [
  { date: 'Jul 01', prospecting: 412, retargeting: 288, lookalike: 196 },
  { date: 'Jul 05', prospecting: 468, retargeting: 301, lookalike: 214 },
  { date: 'Jul 09', prospecting: 522, retargeting: 274, lookalike: 245 },
  { date: 'Jul 13', prospecting: 497, retargeting: 331, lookalike: 262 },
  { date: 'Jul 17', prospecting: 585, retargeting: 358, lookalike: 238 },
  { date: 'Jul 21', prospecting: 640, retargeting: 342, lookalike: 291 },
  { date: 'Jul 25', prospecting: 604, retargeting: 397, lookalike: 318 },
];

export const SPEND_SERIES: ConversionPoint[] = [
  { date: 'Jul 01', prospecting: 4120, retargeting: 1880, lookalike: 1260 },
  { date: 'Jul 05', prospecting: 4380, retargeting: 1940, lookalike: 1315 },
  { date: 'Jul 09', prospecting: 4610, retargeting: 1875, lookalike: 1402 },
  { date: 'Jul 13', prospecting: 4495, retargeting: 2110, lookalike: 1488 },
  { date: 'Jul 17', prospecting: 5020, retargeting: 2245, lookalike: 1430 },
  { date: 'Jul 21', prospecting: 5340, retargeting: 2180, lookalike: 1624 },
  { date: 'Jul 25', prospecting: 5185, retargeting: 2402, lookalike: 1731 },
];

export interface CreativeRow {
  name: string;
  format: 'Image' | 'Carousel' | 'Video';
  spend: string;
  impressions: string;
  ctr: string;
  roas: string;
  status: 'Scaling' | 'Stable' | 'Fatiguing';
}

export const CREATIVE_BREAKDOWN: CreativeRow[] = [
  { name: 'Summer Drop — Hero Still', format: 'Image', spend: '$9,410', impressions: '1.42M', ctr: '2.31%', roas: '4.62x', status: 'Scaling' },
  { name: 'Bestsellers 6-Tile', format: 'Carousel', spend: '$7,880', impressions: '1.05M', ctr: '1.88%', roas: '3.94x', status: 'Stable' },
  { name: 'UGC Unboxing 15s', format: 'Video', spend: '$11,240', impressions: '2.11M', ctr: '2.67%', roas: '4.18x', status: 'Scaling' },
  { name: 'Founder Story 30s', format: 'Video', spend: '$6,320', impressions: '0.94M', ctr: '1.12%', roas: '2.41x', status: 'Fatiguing' },
  { name: 'Price Anchor Grid', format: 'Carousel', spend: '$5,910', impressions: '0.87M', ctr: '1.44%', roas: '3.05x', status: 'Stable' },
  { name: 'Lifestyle Flatlay', format: 'Image', spend: '$4,150', impressions: '0.63M', ctr: '0.96%', roas: '2.18x', status: 'Fatiguing' },
];
