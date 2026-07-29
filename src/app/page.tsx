import { redirect } from 'next/navigation';
import { AynWordmark } from '@/components/AynLogo';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { isGoogleConfigured } from '@/lib/google-oauth';
import { getCredentialStatus } from '@/lib/meta-credentials';
import { getSession } from '@/lib/session';

// Reads the session cookie to decide whether to show the landing page at all.
export const dynamic = 'force-dynamic';

/**
 * The front door. Signed-out visitors get the pitch and a Google button; signed-in
 * ones are sent onward — to `/setup` while their ad account is unconnected, to
 * `/dashboard` once it is. Nothing here renders numbers: `/` used to show the PRD's
 * mock dashboard with no "sample data" banner, and fabricated spend presented as real
 * is the exact failure this product exists to prevent.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await getSession().catch(() => null);

  if (session) {
    const credential = await getCredentialStatus(session.companyId, session.userId).catch(
      () => null,
    );

    redirect(credential?.connected && credential.isValid ? '/dashboard' : '/setup');
  }

  const googleReady = isGoogleConfigured();

  return (
    <main className="flex min-h-screen flex-col bg-slate-50">
      <header className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-6 py-6">
        <AynWordmark markClassName="h-9 w-auto" />
        <a
          href="#how-it-works"
          className="text-xs font-medium text-slate-500 transition-colors hover:text-slate-900"
        >
          How it works
        </a>
      </header>

      <div className="mx-auto grid w-full max-w-[1100px] flex-1 items-center gap-12 px-6 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:py-16">
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">
            Meta Ads · Model Context Protocol
          </p>

          <h1 className="mt-3 text-4xl font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">
            Your ad account,
            <br />
            answered in plain English.
          </h1>

          <p className="mt-5 max-w-[52ch] text-sm leading-relaxed text-slate-600">
            Sign in with Google, connect a Meta access token, and see your own live spend,
            ROAS and creative performance — with <strong className="font-semibold text-slate-900">Basira
            AI Copilot</strong> on every screen to answer questions about the numbers in front
            of you.
          </p>

          {error && (
            <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-800">
              {error}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <GoogleSignInButton disabled={!googleReady} />

            <p className="text-[11px] leading-relaxed text-slate-500">
              We read your name and email only.
              <br />
              Your Meta token is encrypted at rest and never leaves the server.
            </p>
          </div>

          {!googleReady && (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
              <p className="font-semibold">Google sign-in is not configured on this deployment.</p>
              <p className="mt-1.5">
                Create an OAuth client at{' '}
                <span className="font-mono text-[11px]">console.cloud.google.com/apis/credentials</span>,
                add <span className="font-mono text-[11px]">{'{APP_URL}'}/api/auth/google/callback</span>{' '}
                as an authorised redirect URI, and set{' '}
                <span className="font-mono text-[11px]">GOOGLE_CLIENT_ID</span> and{' '}
                <span className="font-mono text-[11px]">GOOGLE_CLIENT_SECRET</span> in{' '}
                <span className="font-mono text-[11px]">.env.local</span>.
              </p>
              {process.env.NODE_ENV !== 'production' && (
                <p className="mt-2">
                  In development you can also{' '}
                  <a className="font-semibold underline" href="/api/dev-login">
                    sign in as the seeded demo user
                  </a>
                  .
                </p>
              )}
            </div>
          )}
        </section>

        <section id="how-it-works" className="space-y-3">
          <Step
            index={1}
            title="Sign in with Google"
            body="No password to set. Your first sign-in creates a private workspace that only you can see."
          />
          <Step
            index={2}
            title="Connect your Meta ad account"
            body="Paste an access token with ads_read. It is checked against Meta before it is stored, then sealed with AES-256-GCM — the browser never sees it again."
          />
          <Step
            index={3}
            title="Read your real numbers"
            body="Spend, ROAS, CTR and creative breakdowns pulled live from your own account — through Meta's Ads MCP server, or the Marketing API for accounts MCP has not reached yet."
          />

          <div className="!mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <SparkIcon />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Basira AI Copilot</h3>
                <p className="text-[11px] text-slate-500">On every screen, in the corner</p>
              </div>
            </div>

            <p className="mt-3.5 text-xs leading-relaxed text-slate-600">
              &ldquo;Which campaign burned budget without a conversion this week?&rdquo; — the
              copilot picks the right Meta tool, calls it from the server, and writes the
              answer. Your access token is never sent to the model.
            </p>
          </div>
        </section>
      </div>

      <footer className="mx-auto w-full max-w-[1100px] px-6 py-8 text-[11px] text-slate-400">
        Ayn · Meta Ads MCP Dashboard — read-only reporting. No budget writes.
      </footer>
    </main>
  );
}

function Step({ index, title, body }: { index: number; title: string; body: string }) {
  return (
    <div className="flex gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
        {index}
      </span>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">{body}</p>
      </div>
    </div>
  );
}

function SparkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  );
}
