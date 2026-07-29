'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Connects — or reconnects — a Meta token without leaving the app. Shown on the setup
 * page during onboarding, and inline on the dashboard whenever the stored credential is
 * missing or has been flagged invalid, which is what happens when a short-lived token
 * expires.
 *
 * The token is validated server-side before storage, so a bad paste fails loudly here
 * rather than surfacing later as an empty dashboard.
 */
export function ConnectMetaForm({
  /** `amber` sits inside the warning banner; `plain` inside a normal card. */
  tone = 'amber',
  /** Where to go once a token is accepted. Omit to just re-render in place. */
  redirectTo,
  submitLabel = 'Connect',
}: {
  tone?: 'amber' | 'plain';
  redirectTo?: string;
  submitLabel?: string;
} = {}) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'ok'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token.trim() || state === 'saving') return;

    setState('saving');
    setMessage(null);

    try {
      const res = await fetch('/api/connect-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token.trim() }),
      });

      const body = await res.json();

      if (!res.ok) {
        setState('idle');
        setMessage(body.error ?? `Request failed (${res.status}).`);
        return;
      }

      setState('ok');
      setToken('');
      setMessage(
        `Connected — ${body.accountCount} ad account${body.accountCount === 1 ? '' : 's'} reachable. ` +
          (redirectTo ? 'Loading your data…' : 'Reloading…'),
      );

      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (error) {
      setState('idle');
      setMessage(error instanceof Error ? error.message : 'Request failed.');
    }
  };

  const amber = tone === 'amber';

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Paste a Meta access token (EAAG…)"
          autoComplete="off"
          spellCheck={false}
          className={`min-w-[260px] flex-1 rounded-lg border bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 ${
            amber
              ? 'border-amber-300 focus:ring-amber-400/40'
              : 'border-slate-200 focus:border-blue-500 focus:ring-blue-500/20'
          }`}
        />
        <button
          type="submit"
          disabled={state === 'saving' || !token.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {state === 'saving' ? 'Checking…' : submitLabel}
        </button>
      </div>

      {message && (
        <p className={`text-xs ${state === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>
          {message}
        </p>
      )}

      <p
        className={`text-[11px] leading-relaxed ${amber ? 'text-amber-800/80' : 'text-slate-500'}`}
      >
        It is verified against Meta before being stored, then encrypted at rest and never
        returned to the browser. Graph API Explorer tokens last 1–2 hours; for something
        durable use a System User token (Business Settings → Users → System Users), which
        does not expire.
      </p>
    </form>
  );
}
