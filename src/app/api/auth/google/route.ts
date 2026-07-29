import { NextRequest, NextResponse } from 'next/server';
import {
  GoogleAuthError,
  OAUTH_NEXT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_TTL_SECONDS,
  OAUTH_VERIFIER_COOKIE,
  buildAuthorizeUrl,
  callbackUrl,
  randomToken,
} from '@/lib/google-oauth';
import { sessionCookieOptions } from '@/lib/auth';

/**
 * Step 1 of sign-in: send the browser to Google.
 *
 * The CSRF `state` and the PKCE verifier are parked in httpOnly cookies rather than
 * server memory, so the flow survives a redeploy or a second instance picking up the
 * callback. Both are single-use and expire in ten minutes.
 */
export async function GET(req: NextRequest) {
  const state = randomToken();
  const codeVerifier = randomToken();

  // Where to land afterwards. Only same-app paths are honoured — an absolute URL here
  // would turn sign-in into an open redirect.
  const requested = req.nextUrl.searchParams.get('next');
  const next = requested && requested.startsWith('/') && !requested.startsWith('//') ? requested : '';

  let authorizeUrl: string;

  try {
    authorizeUrl = buildAuthorizeUrl({
      redirectUri: callbackUrl(req.nextUrl.origin),
      state,
      codeVerifier,
    });
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    throw error;
  }

  const response = NextResponse.redirect(authorizeUrl);
  const options = sessionCookieOptions(OAUTH_TTL_SECONDS);

  response.cookies.set(OAUTH_STATE_COOKIE, state, options);
  response.cookies.set(OAUTH_VERIFIER_COOKIE, codeVerifier, options);
  if (next) response.cookies.set(OAUTH_NEXT_COOKIE, next, options);

  return response;
}
