'use client';

import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CONVERSION_SERIES,
  SPEND_SERIES,
  type ConversionPoint,
} from '@/lib/mock-data';

const SERIES = [
  { key: 'prospecting', label: 'Prospecting', color: 'var(--viz-series-1)' },
  { key: 'retargeting', label: 'Retargeting', color: 'var(--viz-series-2)' },
  { key: 'lookalike', label: 'Lookalike 3%', color: 'var(--viz-series-3)' },
] as const;

type SeriesKey = (typeof SERIES)[number]['key'];

const VIEWS = [
  { value: 'conversions', label: 'Conversions', data: CONVERSION_SERIES, format: (n: number) => n.toLocaleString() },
  { value: 'spend', label: 'Spend', data: SPEND_SERIES, format: (n: number) => `$${n.toLocaleString()}` },
] as const;

/**
 * Time-series comparison of conversion (or spend) patterns across active campaigns
 * (PRD §1.3, Feature 1). Overlapping areas rather than stacked: the question is
 * "how do these campaigns compare", not "what do they sum to".
 */
export function CampaignTrendChart() {
  return (
    <Tabs defaultValue="conversions" className="w-full">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Campaign trends</h2>
          <p className="text-xs text-slate-500">Daily totals per active campaign</p>
        </div>
        <TabsList>
          {VIEWS.map((view) => (
            <TabsTrigger key={view.value} value={view.value}>
              {view.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {/* Legend — always present for >= 2 series, so identity is never colour-alone. */}
      <div className="mb-2 flex flex-wrap gap-4">
        {SERIES.map((series) => (
          <span key={series.key} className="flex items-center gap-2 text-xs text-slate-600">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: series.color }}
            />
            {series.label}
          </span>
        ))}
      </div>

      {VIEWS.map((view) => (
        <TabsContent key={view.value} value={view.value} className="mt-0">
          <TrendPlot data={view.data} format={view.format} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function TrendPlot({
  data,
  format,
}: {
  data: readonly ConversionPoint[];
  format: (n: number) => string;
}) {
  const lastIndex = data.length - 1;

  return (
    <div className="h-[400px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={[...data]} margin={{ top: 8, right: 84, bottom: 4, left: 0 }}>
          <defs>
            {SERIES.map((series) => (
              <linearGradient key={series.key} id={`fill-${series.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={series.color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={series.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid vertical={false} stroke="var(--viz-grid)" strokeDasharray="0" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={{ stroke: 'var(--viz-axis)' }}
            tick={{ fill: 'var(--viz-muted)', fontSize: 11 }}
            dy={6}
          />
          <YAxis
            width={56}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--viz-muted)', fontSize: 11 }}
            tickFormatter={(value: number) => format(value)}
          />
          <Tooltip
            cursor={{ stroke: 'var(--viz-axis)', strokeWidth: 1 }}
            content={<TrendTooltip format={format} />}
          />

          {SERIES.map((series) => (
            <Area
              key={series.key}
              type="monotone"
              dataKey={series.key}
              stroke={series.color}
              strokeWidth={2}
              fill={`url(#fill-${series.key})`}
              // 2px surface ring keeps overlapping marks legible where they cross.
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--viz-surface)' }}
              dot={false}
              isAnimationActive={false}
            >
              {/* Direct end-label: the relief for slot 3 sitting under 3:1 on white. */}
              <LabelList
                dataKey={series.key}
                content={(props) => (
                  <EndLabel {...props} lastIndex={lastIndex} label={series.label} color={series.color} />
                )}
              />
            </Area>
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface EndLabelProps {
  x?: string | number;
  y?: string | number;
  index?: number;
  lastIndex: number;
  label: string;
  color: string;
}

function EndLabel({ x, y, index, lastIndex, label, color }: EndLabelProps) {
  if (index !== lastIndex) return null;

  return (
    <text
      x={Number(x) + 8}
      y={Number(y)}
      dy={4}
      fontSize={11}
      fill={color}
      className="font-medium"
    >
      {label}
    </text>
  );
}

interface TooltipPayloadEntry {
  dataKey?: string | number;
  value?: number;
}

function TrendTooltip({
  active,
  label,
  payload,
  format,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadEntry[];
  format: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <p className="mb-1.5 text-xs font-medium text-slate-900">{label}</p>
      <ul className="space-y-1">
        {SERIES.map((series) => {
          const entry = payload.find((item) => item.dataKey === series.key);
          if (!entry) return null;

          return (
            <li key={series.key} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: series.color }}
              />
              <span className="text-slate-600">{series.label}</span>
              <span className="ml-auto font-medium tabular-nums text-slate-900">
                {format(entry.value ?? 0)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export type { SeriesKey };
