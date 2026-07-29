import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AccountPicker } from '@/components/AccountPicker';
import { ClientReport } from '@/components/ClientReport';
import { ConnectMetaForm } from '@/components/ConnectMetaForm';
import { TopNav } from '@/components/TopNav';
import { listSelectableAccounts } from '@/lib/accounts';
import { getCredentialStatus } from '@/lib/meta-credentials';
import { buildClientReport } from '@/lib/report';
import { getSession } from '@/lib/session';
import { getUserProfile, getWorkspace } from '@/lib/users';

// Reads cookies and pulls live spend — never prerender or cache it.
export const dynamic = 'force-dynamic';

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const { account } = await searchParams;
  const session = await getSession().catch(() => null);

  if (!session) redirect('/');

  const credential = await getCredentialStatus(session.companyId, session.userId).catch(
    () => null,
  );

  if (!credential?.connected) redirect('/setup');

  // Listed independently of the report so the picker still works when the report
  // itself fails — otherwise a bad account would strand the user with no way out.
  const [profile, workspace, accountList, report] = await Promise.all([
    getUserProfile(session.userId).catch(() => null),
    getWorkspace(session.companyId, session.userId).catch(() => null),
    listSelectableAccounts(session.companyId, session.userId),
    buildClientReport(session.companyId, session.userId, account),
  ]);

  const failed = 'error' in report;

  // Both failures share one root cause — a missing or expired token — so they get one
  // panel with the fix in it, rather than two banners repeating each other.
  const needsCredential =
    (failed && report.needsCredential) || accountList.tokenExpired || false;

  return (
    <div className="relative min-h-screen bg-slate-50">
      <TopNav
        active="report"
        profile={profile}
        workspaceName={workspace?.name ?? 'Your workspace'}
      />

      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3 px-6 pt-6">
        <p className="text-xs text-slate-500">
          {accountList.accounts.length
            ? `${accountList.accounts.length} ad account${accountList.accounts.length === 1 ? '' : 's'} on this token`
            : 'No ad accounts available'}
        </p>

        <Suspense fallback={null}>
          <AccountPicker accounts={accountList.accounts} selectedId={account} />
        </Suspense>
      </div>

      {needsCredential ? (
        <div className="mx-auto w-full max-w-[1400px] px-6 py-4">
          <Notice
            title="Reconnect your Meta account"
            body={
              (failed ? report.error : accountList.error) ??
              'No valid Meta credential is connected.'
            }
          >
            <ConnectMetaForm />
          </Notice>
        </div>
      ) : (
        <>
          {accountList.error && !accountList.accounts.length && (
            <div className="mx-auto w-full max-w-[1400px] px-6 pt-4">
              <Notice title="Cannot list ad accounts" body={accountList.error} />
            </div>
          )}

          {failed ? (
            <div className="mx-auto w-full max-w-[1400px] px-6 py-4">
              <Notice title="Could not build the report" body={report.error} />
            </div>
          ) : (
            <ClientReport report={report} />
          )}
        </>
      )}

      {/* The Basira AI Copilot is mounted once in the root layout. */}
    </div>
  );
}

function Notice({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="text-sm font-bold text-amber-900">{title}</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-amber-900">{body}</p>
      {children}
    </div>
  );
}
