'use client';

import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ClientReport as Report, ReportRow, SectionStatus } from '@/lib/report-shape';
import { REPORT_COLORS } from '@/lib/report-shape';

/**
 * The client-facing report. Nine sections, no hidden numbers: any metric Meta did
 * not report renders as an em dash with an explicit reason, never as a zero that
 * reads like a real measurement.
 */
export function ClientReport({ report }: { report: Report }) {
  const { account, totals, daily, campaigns, ads, sections, rangeLabel, dataThrough } = report;
  const money = (v: number | null) => fmtMoney(v, account.currency);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-6">

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{account.name}</h1>
          <p className="text-xs text-slate-500">
            {rangeLabel}
            {dataThrough ? ` · data through ${dataThrough}` : ''} ·{' '}
            {account.viaMcp ? 'via Meta Ads MCP' : 'via Meta Marketing API'}
          </p>
        </div>
        <p className="text-xs text-slate-400">Account {account.id}</p>
      </header>

      {/* 💰 AMOUNT SPENT + 📈 REACH & IMPRESSIONS */}
      <Section title="Amount Spent" icon="💰">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Total Spent" value={money(totals.spend)} />
          <Stat label="Impressions" value={fmtInt(totals.impressions)} />
          <Stat label="Reach" value={fmtInt(totals.reach)} hint="unique accounts" />
          <Stat
            label="Frequency"
            value={fmtNum(totals.frequency, 2)}
            hint="times each account saw an ad"
          />
        </div>
      </Section>

      {/* 🎯 CTR, CPC & CPM */}
      <Section title="CTR, CPC & CPM" icon="🎯">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="CTR" value={fmtPct(totals.ctr)} hint={`${fmtInt(totals.clicks)} clicks`} />
          <Stat label="CPC" value={money(totals.cpc)} hint="per click (all)" />
          <Stat label="CPM" value={money(totals.cpm)} hint="per 1,000 impressions" />
          <Stat
            label={totals.leadActionType ? 'Cost per Result' : 'Results'}
            value={totals.costPerLead ? money(totals.costPerLead) : fmtInt(totals.leads)}
            hint={totals.leadActionType ?? 'no conversions reported'}
          />
        </div>
      </Section>

      {/* 🔗 LINK CLICKS */}
      <Section title="Link Clicks" icon="🔗" status={sections.links}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Link Clicks" value={fmtInt(totals.linkClicks)} />
          <Stat label="Link CTR" value={fmtPct(totals.linkCtr)} />
          <Stat label="Cost per Link Click" value={money(totals.costPerLinkClick)} />
          <Stat label="Outbound Clicks" value={fmtInt(totals.outboundClicks)} hint="left Meta" />
        </div>
      </Section>

      {/* ▶️ VIDEO PERFORMANCE */}
      <Section title="Video Performance" icon="▶️" status={sections.video}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <Stat label="Plays" value={fmtInt(totals.videoPlays)} />
          <Stat label="25%" value={fmtInt(totals.video25)} />
          <Stat label="50%" value={fmtInt(totals.video50)} />
          <Stat label="75%" value={fmtInt(totals.video75)} />
          <Stat label="100%" value={fmtInt(totals.video100)} />
          <Stat label="ThruPlays" value={fmtInt(totals.thruplays)} hint="15s or complete" />
        </div>
        {totals.videoPlays ? <RetentionBar row={totals} /> : null}
      </Section>

      {/* 📅 DAY-WISE ANALYTICS */}
      <Section title="Day-wise Analytics" icon="📅" status={sections.daily}>
        <div className="grid gap-6 xl:grid-cols-2">
          <Chart title={`Daily spend${account.currency ? ` (${account.currency})` : ''}`}>
            <AreaChart data={daily} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={REPORT_COLORS[0]} stopOpacity={0.22} />
                  <stop offset="95%" stopColor={REPORT_COLORS[0]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} minTickGap={28} />
              <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} width={56} />
              <Tooltip content={<RowTooltip currency={account.currency} keys={['spend', 'clicks', 'ctr']} />} />
              <Area
                type="monotone"
                dataKey="spend"
                stroke={REPORT_COLORS[0]}
                strokeWidth={2}
                fill="url(#spendFill)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
              />
            </AreaChart>
          </Chart>

          <Chart title="Daily clicks">
            <BarChart data={daily} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} minTickGap={28} />
              <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} width={44} allowDecimals={false} />
              <Tooltip cursor={{ fill: '#f8fafc' }} content={<RowTooltip currency={account.currency} keys={['clicks', 'linkClicks', 'spend']} />} />
              <Bar dataKey="clicks" fill={REPORT_COLORS[1]} maxBarSize={26} />
            </BarChart>
          </Chart>
        </div>
      </Section>

      {/* 📌 CAMPAIGN-WISE COMPARISON */}
      <Section title="Campaign-wise Comparison" icon="📌" status={sections.campaigns}>
        <Chart title="Spend by campaign" height={Math.max(160, campaigns.length * 44)}>
          <BarChart data={campaigns} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
            <XAxis type="number" tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} width={190} />
            <Tooltip cursor={{ fill: '#f8fafc' }} content={<RowTooltip currency={account.currency} keys={['spend', 'impressions', 'ctr', 'cpc']} />} />
            <Bar dataKey="spend" maxBarSize={22} radius={[0, 4, 4, 0]}>
              {campaigns.map((row, i) => (
                <Cell key={row.id} fill={REPORT_COLORS[i % REPORT_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </Chart>

        <MetricTable rows={campaigns} currency={account.currency} firstColumn="Campaign" />
      </Section>

      {/* 📊 CAMPAIGN PERFORMANCE + 📋 AD COPY PERFORMANCE */}
      <Section title="Ad Performance" icon="📋" status={sections.ads}>
        <MetricTable rows={ads.slice(0, 25)} currency={account.currency} firstColumn="Ad" />
        {ads.length > 25 && (
          <p className="mt-2 text-xs text-slate-400">
            Showing the 25 highest-spending ads of {ads.length}.
          </p>
        )}
      </Section>
    </div>
  );
}

const AXIS_TICK = { fill: '#64748b', fontSize: 11 };

function Section({
  title,
  icon,
  status,
  children,
}: {
  title: string;
  icon: string;
  status?: SectionStatus;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
        <span aria-hidden>{icon}</span>
        {title}
      </h2>

      {status && !status.available ? (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-xs text-slate-500">{status.reason}</p>
      ) : (
        children
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200/70 bg-slate-50/50 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function Chart({
  title,
  height = 260,
  children,
}: {
  title: string;
  height?: number;
  children: React.ReactElement;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-600">{title}</p>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Funnel of video retention, which the raw percentage counts do not convey. */
function RetentionBar({ row }: { row: ReportRow }) {
  const plays = row.videoPlays ?? 0;
  const steps: [string, number | null][] = [
    ['25%', row.video25],
    ['50%', row.video50],
    ['75%', row.video75],
    ['100%', row.video100],
  ];

  return (
    <div className="mt-4 space-y-1.5">
      {steps.map(([label, value]) => {
        const pct = plays && value ? (value / plays) * 100 : 0;

        return (
          <div key={label} className="flex items-center gap-3 text-xs">
            <span className="w-9 shrink-0 text-slate-500">{label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: REPORT_COLORS[0] }} />
            </div>
            <span className="w-24 shrink-0 text-right tabular-nums text-slate-600">
              {fmtInt(value)} ({pct.toFixed(0)}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MetricTable({
  rows,
  currency,
  firstColumn,
}: {
  rows: ReportRow[];
  currency: string;
  firstColumn: string;
}) {
  if (!rows.length) return null;

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[820px] text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 pr-3 font-medium">{firstColumn}</th>
            <th className="py-2 pr-3 text-right font-medium">Spend</th>
            <th className="py-2 pr-3 text-right font-medium">Impressions</th>
            <th className="py-2 pr-3 text-right font-medium">Reach</th>
            <th className="py-2 pr-3 text-right font-medium">Clicks</th>
            <th className="py-2 pr-3 text-right font-medium">CTR</th>
            <th className="py-2 pr-3 text-right font-medium">CPC</th>
            <th className="py-2 pr-3 text-right font-medium">CPM</th>
            <th className="py-2 text-right font-medium">Results</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-100 last:border-0">
              <td className="max-w-[280px] truncate py-2 pr-3 font-medium text-slate-900" title={row.label}>
                {row.label}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{fmtMoney(row.spend, currency)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{fmtInt(row.impressions)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{fmtInt(row.reach)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{fmtInt(row.clicks)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{fmtPct(row.ctr)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{fmtMoney(row.cpc, currency)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{fmtMoney(row.cpm, currency)}</td>
              <td className="py-2 text-right tabular-nums">{fmtInt(row.leads)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface TooltipEntry {
  payload?: ReportRow;
}

function RowTooltip({
  active,
  payload,
  currency,
  keys,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  currency: string;
  keys: (keyof ReportRow)[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const LABELS: Partial<Record<keyof ReportRow, string>> = {
    spend: 'Spend',
    clicks: 'Clicks',
    linkClicks: 'Link clicks',
    ctr: 'CTR',
    cpc: 'CPC',
    impressions: 'Impressions',
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <p className="mb-1.5 text-xs font-medium text-slate-900">{row.label}</p>
      <ul className="space-y-1">
        {keys.map((key) => (
          <li key={String(key)} className="flex gap-6 text-xs">
            <span className="text-slate-600">{LABELS[key] ?? String(key)}</span>
            <span className="ml-auto font-medium tabular-nums text-slate-900">
              {key === 'ctr'
                ? fmtPct(row[key] as number | null)
                : key === 'spend' || key === 'cpc'
                  ? fmtMoney(row[key] as number | null, currency)
                  : fmtInt(row[key] as number | null)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Formatters. Null renders as an em dash — never 0, which would read as measured. */

function fmtMoney(value: number | null, currency: string): string {
  if (value === null) return '—';
  return `${currency ? `${currency} ` : ''}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtInt(value: number | null): string {
  return value === null ? '—' : Math.round(value).toLocaleString();
}

function fmtNum(value: number | null, digits: number): string {
  return value === null ? '—' : value.toFixed(digits);
}

function fmtPct(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(2)}%`;
}
