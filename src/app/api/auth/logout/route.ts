import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';

/**
 * Signs out by clearing the session cookie.
 *
 * POST only — a GET sign-out can be triggered by any image tag on any page, which is
 * how you end up logged out by a forum signature. The nav posts a plain form, so it
 * works without JavaScript.
 *
 * 303 rather than the default 307: 307 preserves the method, and the browser would
 * re-POST to `/`.
 */
export async function POST(req: NextRequest) {
  const origin = process.env.APP_URL?.replace(/\/$/, '') || req.nextUrl.origin;
  const response = NextResponse.redirect(`${origin}/`, 303);

  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(0), maxAge: 0 });

  return response;
}
