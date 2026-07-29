import { NextResponse } from 'next/server';
import { SESSION_COOKIE, encodeSession, sessionCookieOptions } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * DEVELOPMENT ONLY. Skips Google sign-in by issuing a session for the seeded demo
 * membership — useful when GOOGLE_CLIENT_ID is not configured yet, or when working
 * offline.
 *
 * Hard-disabled outside development: it hands out a session with no credential check.
 * The real front door is `/` → "Continue with Google".
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  let membership;

  try {
    const { rows } = await db().query<{ user_id: string; company_id: string; name: string }>(
      `SELECT m.user_id, m.company_id, c.name
         FROM company_members m
         JOIN companies c ON c.id = m.company_id
         JOIN meta_credentials mc ON mc.company_id = m.company_id
        ORDER BY mc.updated_at DESC
        LIMIT 1`,
    );

    membership = rows[0];
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Could not reach the database.',
        hint: 'Is the ayn-postgres container running? Then: npm run seed',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }

  if (!membership) {
    return NextResponse.json(
      { error: 'No seeded company with Meta credentials found. Run: npm run seed' },
      { status: 404 },
    );
  }

  const response = NextResponse.redirect(
    new URL('/dashboard', process.env.APP_URL ?? 'http://localhost:3000'),
  );

  response.cookies.set(
    SESSION_COOKIE,
    encodeSession(membership.user_id, membership.company_id),
    sessionCookieOptions(),
  );

  return response;
}
