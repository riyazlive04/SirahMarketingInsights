import { AynWordmark } from '@/components/AynLogo';
import type { UserProfile } from '@/lib/users';

export type NavTab = 'dashboard' | 'report' | 'setup';

const TABS: { id: NavTab; href: string; label: string }[] = [
  { id: 'dashboard', href: '/dashboard', label: 'Dashboard' },
  { id: 'report', href: '/report', label: 'Client report' },
  { id: 'setup', href: '/setup', label: 'Ad account' },
];

/**
 * The signed-in chrome: which workspace you are looking at, where else you can go, and
 * who you are signed in as. Rendered by each page rather than a layout so the pages
 * that need a session can redirect before anything paints.
 */
export function TopNav({
  active,
  profile,
  workspaceName,
}: {
  active: NavTab;
  profile: UserProfile | null;
  workspaceName: string;
}) {
  const name = profile?.displayName || profile?.email || 'Signed in';

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
        <a href="/dashboard">
          <AynWordmark subtitle={workspaceName} markClassName="h-7 w-auto" />
        </a>

        <nav className="flex items-center gap-1">
          {TABS.map((tab) => (
            <a
              key={tab.id}
              href={tab.href}
              aria-current={tab.id === active ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                tab.id === active
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-right sm:block">
            <span className="block max-w-[180px] truncate text-xs font-medium text-slate-900">
              {name}
            </span>
            {profile?.displayName && profile.email && (
              <span className="block max-w-[180px] truncate text-[11px] text-slate-500">
                {profile.email}
              </span>
            )}
          </span>

          <Avatar profile={profile} />

          {/* A form, not a link: a GET sign-out can be fired by any third-party image
              tag. The route answers 303 so the browser follows with a GET. */}
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

function Avatar({ profile }: { profile: UserProfile | null }) {
  const initial = (profile?.displayName || profile?.email || '?').trim().charAt(0).toUpperCase();

  if (profile?.avatarUrl) {
    return (
      // Google's avatar host is outside next/image's remotePatterns, and adding it
      // would route every profile picture through this server's optimiser for no gain.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profile.avatarUrl}
        alt=""
        width={32}
        height={32}
        referrerPolicy="no-referrer"
        className="h-8 w-8 rounded-full border border-slate-200 object-cover"
      />
    );
  }

  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
      {initial}
    </span>
  );
}
