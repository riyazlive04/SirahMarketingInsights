'use client';

import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  type PortfolioPoint,
  type PortfolioResult,
  type PortfolioSeries,
  SAMPLE_PORTFOLIO,
} from '@/lib/portfolio-shape';

interface MarketingDashboardProps {
  data?: PortfolioResult;
}

export const MarketingDashboard: React.FC<MarketingDashboardProps> = ({
  data = SAMPLE_PORTFOLIO,
}) => {
  const { spend, leads, series, kpis, currency, source, notice } = data;
  const isSample = source === 'sample';

  return (
    <div className="w-full space-y-6 p-6 bg-slate-50 min-h-screen">

      {(isSample || notice) && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs ${
            isSample
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-slate-200 bg-white text-slate-600'
          }`}
        >
          {isSample && <span className="font-semibold">Showing sample data. </span>}
          {notice}
        </div>
      )}

      {/* 1. TOP METRIC WIDGETS SUMMARY */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{kpi.label}</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{kpi.value}</h3>
            <span className="text-xs text-slate-400 mt-2 block">{kpi.hint}</span>
          </div>
        ))}
      </div>

      {/* 2. MAIN CHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* DAILY SPEND ACROSS BUSINESSES */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="mb-4">
            <h4 className="text-base font-bold text-slate-900">Daily Spend by Business</h4>
            <p className="text-xs text-slate-500">
              Amount spent per ad account{currency ? `, in ${currency}` : ''}
            </p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  {series.map((s) => (
                    <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={s.color} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} width={64} />
                <Tooltip content={<SeriesTooltip series={series} currency={currency} />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                {series.map((s) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    name={s.label}
                    dataKey={s.key}
                    stroke={s.color}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill={`url(#fill-${s.key})`}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* LEAD VOLUME */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="mb-4">
            <h4 className="text-base font-bold text-slate-900">Leads per Day</h4>
            <p className="text-xs text-slate-500">Results these accounts actually optimise for</p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leads} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#f8fafc' }} content={<SeriesTooltip series={series} />} />
                {series.map((s) => (
                  <Bar
                    key={s.key}
                    name={s.label}
                    dataKey={s.key}
                    stackId="leads"
                    fill={s.color}
                    maxBarSize={40}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
};

interface TooltipEntry {
  dataKey?: string | number;
  value?: number;
}

function SeriesTooltip({
  active,
  label,
  payload,
  series,
  currency,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipEntry[];
  series: PortfolioSeries[];
  currency?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <p className="mb-1.5 text-xs font-medium text-slate-900">{label}</p>
      <ul className="space-y-1">
        {series.map((s) => {
          const entry = payload.find((item) => item.dataKey === s.key);
          if (!entry) return null;

          return (
            <li key={s.key} className="flex items-center gap-2 text-xs">
              <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-slate-600">{s.label}</span>
              <span className="ml-auto font-medium tabular-nums text-slate-900">
                {currency ? `${currency} ` : ''}
                {(entry.value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export type { PortfolioPoint };
