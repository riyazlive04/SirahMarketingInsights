import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AccountPicker } from '@/components/AccountPicker';
import { ConnectMetaForm } from '@/components/ConnectMetaForm';
import { MarketingDashboard } from '@/components/MarketingDashboard';
import { TopNav } from '@/components/TopNav';
import { listSelectableAccounts } from '@/lib/accounts';
import { getCredentialStatus } from '@/lib/meta-credentials';
import { fetchPortfolioMetrics } from '@/lib/portfolio';
import { getSession } from '@/lib/session';
import { getUserProfile, getWorkspace } from '@/lib/users';

// Reads cookies and pulls live spend — never prerender or cache it.
export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const { account } = await searchParams;
  const session = await getSession().catch(() => null);

  // Signed out, or signed in with nothing connected: neither state has any real numbers
  // to show, and showing sample ones instead is how a dashboard starts lying.
  if (!session) redirect('/');

  const credential = await getCredentialStatus(session.companyId, session.userId).catch(
    () => null,
  );

  if (!credential?.connected) redirect('/setup');

  // Resolving metrics server-side keeps the decrypted Meta token on the server;
  // only the parsed numbers cross to the client.
  const [profile, workspace, accountList, portfolio] = await Promise.all([
    getUserProfile(session.userId).catch(() => null),
    getWorkspace(session.companyId, session.userId).catch(() => null),
    listSelectableAccounts(session.companyId, session.userId),
    fetchPortfolioMetrics(session.companyId, session.userId, account),
  ]);

  return (
    <div className="relative min-h-screen bg-slate-50">
      <TopNav
        active="dashboard"
        profile={profile}
        workspaceName={workspace?.name ?? 'Your workspace'}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
        <a href="/report" className="text-xs font-medium text-blue-600 hover:underline">
          View full client report →
        </a>

        <Suspense fallback={null}>
          <AccountPicker accounts={accountList.accounts} selectedId={account} />
        </Suspense>
      </div>

      {!accountList.accounts.length && (
        <div className="px-6 pt-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="text-sm font-bold text-amber-900">Reconnect your Meta account</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-amber-900">
              {accountList.error ?? 'No valid Meta credential is connected.'}
            </p>
            <ConnectMetaForm />
          </div>
        </div>
      )}

      <MarketingDashboard data={portfolio} />

      {/* The Basira AI Copilot is mounted once in the root layout, so it floats above
          the Recharts grid here without this page having to place it. */}
    </div>
  );
}
