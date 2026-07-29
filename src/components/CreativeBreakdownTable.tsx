import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CREATIVE_BREAKDOWN, type CreativeRow } from '@/lib/mock-data';

const STATUS_STYLES: Record<CreativeRow['status'], string> = {
  Scaling: 'bg-[#0ca30c]/10 text-[#006300]',
  Stable: 'bg-slate-100 text-slate-600',
  Fatiguing: 'bg-[#fab219]/15 text-[#8a5a00]',
};

/** Performance metrics cross-referenced against creative format (PRD §1.3, Feature 1). */
export function CreativeBreakdownTable() {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Creative</TableHead>
            <TableHead>Format</TableHead>
            <TableHead className="text-right">Spend</TableHead>
            <TableHead className="text-right">Impressions</TableHead>
            <TableHead className="text-right">CTR</TableHead>
            <TableHead className="text-right">ROAS</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {CREATIVE_BREAKDOWN.map((row) => (
            <TableRow key={row.name}>
              <TableCell className="font-medium text-slate-900">{row.name}</TableCell>
              <TableCell className="text-slate-600">{row.format}</TableCell>
              <TableCell className="text-right tabular-nums">{row.spend}</TableCell>
              <TableCell className="text-right tabular-nums">{row.impressions}</TableCell>
              <TableCell className="text-right tabular-nums">{row.ctr}</TableCell>
              <TableCell className="text-right tabular-nums">{row.roas}</TableCell>
              <TableCell>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[row.status]}`}
                >
                  {row.status}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
