'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Renames the workspace — the label the dashboard and the client report carry. The
 * default is derived from the Google profile ("Amira's Ad Account"), which is fine for
 * one person and wrong the moment an agency runs two clients through it.
 */
export function WorkspaceNameForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [state, setState] = useState<'idle' | 'saving' | 'ok'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const dirty = name.trim() !== initialName.trim();

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || !name.trim() || state === 'saving') return;

    setState('saving');
    setMessage(null);

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });

      const body = await res.json();

      if (!res.ok) {
        setState('idle');
        setMessage(body.error ?? `Request failed (${res.status}).`);
        return;
      }

      setState('ok');
      setMessage('Saved.');
      router.refresh();
    } catch (error) {
      setState('idle');
      setMessage(error instanceof Error ? error.message : 'Request failed.');
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <label className="block text-[11px] font-medium text-slate-500" htmlFor="workspace-name">
        Profile name
      </label>

      <div className="flex flex-wrap gap-2">
        <input
          id="workspace-name"
          value={name}
          maxLength={255}
          onChange={(event) => {
            setName(event.target.value);
            setState('idle');
            setMessage(null);
          }}
          className="min-w-[240px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <button
          type="submit"
          disabled={!dirty || !name.trim() || state === 'saving'}
          className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900 disabled:opacity-40"
        >
          {state === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </div>

      {message && (
        <p className={`text-xs ${state === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>
          {message}
        </p>
      )}
    </form>
  );
}
