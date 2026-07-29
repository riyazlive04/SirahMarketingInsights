import 'server-only';

import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { SESSION_COOKIE, decodeSession } from '@/lib/auth';

export interface Session {
  userId: string;
  /** The company whose ad data the user is currently viewing. */
  companyId: string;
  role: string;
}

/**
 * THE AUTH SEAM.
 *
 * Identity comes from Google (see src/app/api/auth/google/callback/route.ts), carried
 * in one HMAC-signed cookie. Two checks run on every call and both must pass:
 *
 *   1. the cookie's signature and expiry — proves the browser did not mint it;
 *   2. a live `company_members` lookup — proves the user still belongs to that
 *      company, so revoking access takes effect on the next request rather than
 *      whenever the cookie happens to expire.
 *
 * To swap in a session library (NextAuth, Lucia, Iron Session), replace the cookie
 * read with its lookup and keep the membership query. Everything downstream — the
 * gateway, the credential store, the pages — only ever sees this interface.
 */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const payload = decodeSession(jar.get(SESSION_COOKIE)?.value);

  if (!payload) return null;

  const { rows } = await db().query<{ role: string }>(
    `SELECT role
       FROM company_members
      WHERE user_id = $1 AND company_id = $2
      LIMIT 1`,
    [payload.uid, payload.cid],
  );

  const membership = rows[0];
  if (!membership) return null;

  return { userId: payload.uid, companyId: payload.cid, role: membership.role };
}

/**
 * Confirms the session user may act on `companyId`. Route handlers must call this
 * with the company id the *client* sent, never trust it directly — otherwise any
 * logged-in user could read any company's spend by changing one field.
 */
export async function authorizeCompany(companyId: string): Promise<Session | null> {
  const session = await getSession();
  if (!session) return null;
  if (session.companyId === companyId) return session;

  const { rows } = await db().query<{ role: string }>(
    `SELECT role
       FROM company_members
      WHERE user_id = $1 AND company_id = $2
      LIMIT 1`,
    [session.userId, companyId],
  );

  const membership = rows[0];
  if (!membership) return null;

  return { userId: session.userId, companyId, role: membership.role };
}
