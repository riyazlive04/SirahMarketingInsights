/**
 * In-app walkthrough for generating a permanent System User token.
 *
 * This is the path that needs no Meta App Review: the token is issued by the customer's
 * *own* Meta app inside their *own* Business Manager, so it never touches this app's
 * access level. The cost is that a business owner has to follow eight steps in a
 * genuinely confusing UI — which is why it sits behind a disclosure rather than being
 * the front door, and why the one-click Facebook Login button is above it.
 *
 * Deliberately explicit about ads_read only. `ads_management` would let anything
 * holding the token spend money, and a read-only reporting product has no business
 * asking for it.
 */
export function SystemUserTokenGuide() {
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <h3 className="text-xs font-semibold text-slate-900">
        Generate a permanent token (no app review needed)
      </h3>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        You need to be an <strong className="font-semibold">admin</strong> of the Meta
        Business that owns the ad account. Takes about ten minutes, once — the token
        never expires.
      </p>

      <ol className="mt-3 space-y-2.5 text-[11px] leading-relaxed text-slate-600">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-2.5">
            <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[9px] font-bold text-white">
              {index + 1}
            </span>
            <span>
              <strong className="font-semibold text-slate-800">{step.title}</strong>
              {' — '}
              {step.body}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-3 border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-500">
        <strong className="font-semibold text-slate-700">Grant ads_read only.</strong>{' '}
        Ayn never writes to your account — it cannot create, edit or pause a campaign.
        Adding <code className="font-mono">ads_management</code> would give the stored
        token the power to spend money, for no extra reporting.
      </p>
    </div>
  );
}

const STEPS = [
  {
    title: 'Create a Meta app',
    body: (
      <>
        At{' '}
        <a
          className="text-blue-600 hover:underline"
          href="https://developers.facebook.com/apps"
          target="_blank"
          rel="noreferrer"
        >
          developers.facebook.com/apps
        </a>{' '}
        → Create App → choose <em>Other</em> → <em>Business</em>, and link it to your
        Business portfolio.
      </>
    ),
  },
  {
    title: 'Add the Marketing API',
    body: 'On the app dashboard, find Marketing API in the product list and click Set up.',
  },
  {
    title: 'Open Business Settings',
    body: (
      <>
        Go to{' '}
        <a
          className="text-blue-600 hover:underline"
          href="https://business.facebook.com/settings"
          target="_blank"
          rel="noreferrer"
        >
          business.facebook.com/settings
        </a>{' '}
        for the business that owns your ad account.
      </>
    ),
  },
  {
    title: 'Create a System User',
    body: 'Users → System Users → Add. Name it something like "Ayn Reporting" and give it the Employee role.',
  },
  {
    title: 'Assign your ad account to it',
    body: 'With the System User selected, click Assign Assets → Ad Accounts → tick the account you report on → choose View Performance. This step is the one people skip, and without it the token reads nothing.',
  },
  {
    title: 'Assign the app to it',
    body: 'Assign Assets → Apps → tick the app you created in step 1 → Manage app.',
  },
  {
    title: 'Generate the token',
    body: 'Click Generate New Token, pick the same app, and tick ads_read. Leave everything else unticked.',
  },
  {
    title: 'Paste it below',
    body: 'Copy the token immediately — Meta shows it exactly once. Then paste it into the box below and press Connect.',
  },
];
