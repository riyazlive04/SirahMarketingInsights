import React from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KPI_TILES } from '@/lib/mock-data';

/** Visual KPI blocks: Spend, ROAS, CTR, CPC (PRD §1.3, Feature 1). */
export function KpiCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {KPI_TILES.map((tile) => {
        const Icon = tile.trend === 'up' ? TrendingUp : TrendingDown;

        return (
          <Card key={tile.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-slate-500">
                {tile.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-slate-900">{tile.value}</p>
              <p
                className={`mt-1 flex items-center gap-1 text-xs ${
                  tile.trend === 'up' ? 'text-[#006300]' : 'text-[#d03b3b]'
                }`}
              >
                <Icon aria-hidden className="size-3.5" />
                {tile.delta}
                <span className="text-slate-400">vs. prior 25 days</span>
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
