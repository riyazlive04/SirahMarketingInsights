'use client';

import React, { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { SelectableAccount } from '@/lib/accounts';

/**
 * Lets the user choose which ad account the report shows, instead of the app
 * guessing. The selection lives in the URL (`?account=<id>`) so a report is
 * shareable and bookmarkable, and the server re-reads it on navigation.
 */
export function AccountPicker({
  accounts,
  selectedId,
}: {
  accounts: SelectableAccount[];
  selectedId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  if (!accounts.length) return null;

  const onChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());

    if (event.target.value) params.set('account', event.target.value);
    else params.delete('account');

    startTransition(() => router.push(`${pathname}?${params}`));
  };

  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="font-medium text-slate-500">Ad account</span>

      <select
        value={selectedId ?? ''}
        onChange={onChange}
        disabled={isPending}
        className="max-w-[280px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60"
      >
        <option value="">Auto (first with spend)</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
            {account.currency ? ` · ${account.currency}` : ''}
            {account.mcpEnabled ? ' · MCP' : ''}
          </option>
        ))}
      </select>

      {isPending && <span className="text-slate-400">loading…</span>}
    </label>
  );
}
