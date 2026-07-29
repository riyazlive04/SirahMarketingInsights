import { redirect } from 'next/navigation';
import { ConnectMetaForm } from '@/components/ConnectMetaForm';
import { TopNav } from '@/components/TopNav';
import { WorkspaceNameForm } from '@/components/WorkspaceNameForm';
import { listSelectableAccounts, type AccountListResult } from '@/lib/accounts';
import { getCredentialStatus } from '@/lib/meta-credentials';
import { getSession } from '@/lib/session';
import { getUserProfile, getWorkspace } from '@/lib/users';

// Reads cookies and calls Meta — never prerender or cache it.
export const dynamic = 'force-dynamic';

/**
 * The profile screen: who you are, what your workspace is called, and which Meta ad
 * account it reads. This is where a new user lands straight after Google sign-in, and
 * where anyone whose token expired gets sent back to.
 *
 * Everything Meta-facing happens server-side. The token is posted once, from the form
 * below to `/api/connect-meta`, and is never sent back to a browser afterwards.
 */
export default async function SetupPage() {
  const session = await getSession().catch(() => null);
  if (!session) redirect('/');

  const [profile, workspace, credential] = await Promise.all([
    getUserProfile(session.userId).catch(() => null),
    getWorkspace(session.companyId, session.userId).catch(() => null),
    getCredentialStatus(session.companyId, session.userId).catch(() => null),
  ]);

  const workspaceName = workspace?.name ?? 'Your workspace';
  const connected = Boolean(credential?.connected && credential.isValid);

  // Only worth a round-trip to Meta once something is stored. Listed rather than
  // assumed: "the token saved" and "the token reaches ad accounts" are different facts,
  // and only the second one means the dashboard will have anything on it.
  const accountList: AccountListResult = connected
    ? await listSelectableAccounts(session.companyId, session.userId).catch(() => ({
        accounts: [],
        error: 'Could not reach Meta just now.',
      }))
    : { accounts: [] };

  const live = connected && accountList.accounts.length > 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="setup" profile={profile} workspaceName={workspaceName} />

      <main className="mx-auto w-full max-w-[820px] px-6 py-8 pb-28">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Ad account profile</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          Connect the Meta access token this workspace should report on. Ayn reads it
          server-side only — it is encrypted with AES-256-GCM before it touches the
          database and is never returned to the browser.
        </p>

        <Card className="mt-6">
          <CardTitle
            title="Your profile"
            subtitle="From your Google account. Rename the workspace to match the business you are reporting on."
          />

          <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            {profile?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt=""
                width={40}
                height={40}
                referrerPolicy="no-referrer"
                className="h-10 w-10 rounded-full border border-slate-200 object-cover"
              />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
                {(profile?.displayName || profile?.email || '?').charAt(0).toUpperCase()}
              </span>
            )}

            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {profile?.displayName || profile?.email || 'Signed in'}
              </p>
              <p className="truncate text-xs text-slate-500">{profile?.email}</p>
            </div>
          </div>

          <WorkspaceNameForm initialName={workspaceName} />
        </Card>

        <Card className="mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle
              title="Meta ad account"
              subtitle="A user, system-user or Graph API Explorer token with the ads_read scope."
            />
            <StatusPill credential={credential} accountCount={accountList.accounts.length} />
          </div>

          {live ? (
            <>
              <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {accountList.accounts.map((account) => (
                  <li
                    key={account.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-slate-900">
                        {account.name}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-slate-400">
                        {account.id}
                      </span>
                    </span>

                    <span className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500">{account.currency}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          account.mcpEnabled
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                        title={
                          account.mcpEnabled
                            ? 'Meta has enabled the Ads MCP server on this account.'
                            : 'MCP has not rolled out here yet — served via the Marketing API instead.'
                        }
                      >
                        {account.mcpEnabled ? 'MCP' : 'Marketing API'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <a
                  href="/dashboard"
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
                >
                  Go to my dashboard →
                </a>
                <a
                  href="/report"
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  Open the client report
                </a>
              </div>

              <details className="mt-4 text-xs text-slate-500">
                <summary className="cursor-pointer font-medium text-slate-600">
                  Replace this token
                </summary>
                <ConnectMetaForm tone="plain" submitLabel="Replace" />
              </details>
            </>
          ) : (
            <>
              {credential?.connected && !credential.isValid && (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900">
                  The stored token was rejected by Meta — that is what happens when a
                  short-lived Explorer token expires. Paste a fresh one to reconnect.
                </p>
              )}

              {connected && accountList.error && (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900">
                  {accountList.error}
                </p>
              )}

              <ConnectMetaForm tone="plain" redirectTo="/dashboard" />

              <ol className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-[11px] leading-relaxed text-slate-500">
                <li>
                  <strong className="font-semibold text-slate-700">Quick token:</strong> open the{' '}
                  <a
                    className="text-blue-600 hover:underline"
                    href="https://developers.facebook.com/tools/explorer/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Graph API Explorer
                  </a>
                  , pick your app, add the <code className="font-mono">ads_read</code> permission
                  and generate. Lasts 1–2 hours.
                </li>
                <li>
                  <strong className="font-semibold text-slate-700">Permanent token:</strong>{' '}
                  Business Settings → Users → System Users → Add → Generate New Token, with{' '}
                  <code className="font-mono">ads_read</code> and{' '}
                  <code className="font-mono">ads_management</code>. Does not expire.
                </li>
                <li>
                  For the AI copilot to use Meta&rsquo;s Ads MCP server, the token also needs{' '}
                  <code className="font-mono">ads_mcp_management</code>. Without it, accounts
                  still report through the Marketing API.
                </li>
              </ol>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function CardTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 max-w-[62ch] text-xs leading-relaxed text-slate-500">{subtitle}</p>
    </div>
  );
}

function StatusPill({
  credential,
  accountCount,
}: {
  credential: { connected: boolean; isValid: boolean } | null;
  accountCount: number;
}) {
  const [label, tone] = !credential?.connected
    ? ['Not connected', 'bg-slate-100 text-slate-600']
    : !credential.isValid
      ? ['Token rejected', 'bg-red-50 text-red-700']
      : accountCount
        ? [`${accountCount} account${accountCount === 1 ? '' : 's'} live`, 'bg-emerald-50 text-emerald-700']
        : ['Connected, no accounts', 'bg-amber-50 text-amber-800'];

  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{label}</span>
  );
}
