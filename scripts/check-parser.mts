/**
 * Exercises the coercion helpers against the exact shapes Meta's Ads MCP server
 * returns. Every value below was copied from a real ads_get_ad_entities response.
 *
 *   npm run check:parser
 */
import { currencyOf, parseMetaDate, toNumber } from '../src/lib/meta-metrics.js';

let failures = 0;
const ok = (label: string, cond: boolean) => {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
};

// Meta uses a NARROW NO-BREAK SPACE (U+00A0) before the ISO code, not a plain space.
const SPEND = '₹35,691.51 INR';
const CPC = '₹6.99 INR';

console.log('--- toNumber ---');
ok('currency string -> number', toNumber(SPEND) === 35691.51);
ok('small currency string', toNumber(CPC) === 6.99);
ok('thousands separator', toNumber('3,106') === 3106);
ok('plain integer string', toNumber('177734') === 177734);
ok('percent string', toNumber('2.87%') === 2.87);
ok('zero is preserved, not nulled', toNumber('₹0.00 INR') === 0);
ok('"Not available" -> null', toNumber('Not available') === null);
ok('"not available" case-insensitive', toNumber('not available') === null);
ok('{indicator:"mixed"} -> null', toNumber({ indicator: 'mixed' }) === null);
ok('empty object -> null', toNumber({}) === null);
ok('null -> null', toNumber(null) === null);
ok('undefined -> null', toNumber(undefined) === null);
ok('empty string -> null', toNumber('') === null);
ok('number passthrough', toNumber(42) === 42);
ok('NaN -> null', toNumber(Number.NaN) === null);
ok('negative value', toNumber('-12.5') === -12.5);

console.log('\n--- currencyOf ---');
ok('reads ISO code', currencyOf(SPEND) === 'INR');
ok('null for plain number string', currencyOf('3,106') === null);
ok('null for non-string', currencyOf(null) === null);

console.log('\n--- parseMetaDate ---');
const parsed = parseMetaDate('August 11, 2024');
ok('parses Meta long-form date', parsed?.iso === '2024-08-11');
ok('produces a short label', parsed?.label === '11 Aug');
ok('parses a 2026 date', parseMetaDate('January 5, 2026')?.iso === '2026-01-05');
ok('null input -> null', parseMetaDate(null) === null);
ok('garbage -> null', parseMetaDate('not a date') === null);

// ISO keys must sort chronologically — the timeline relies on localeCompare.
const isos = ['August 11, 2024', 'January 5, 2026', 'January 13, 2026']
  .map((d) => parseMetaDate(d)!.iso);
ok(
  'iso keys sort chronologically',
  JSON.stringify([...isos].sort((a, b) => a.localeCompare(b))) === JSON.stringify(isos),
);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
