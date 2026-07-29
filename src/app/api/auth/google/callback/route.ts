import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  GoogleAuthError,
  OAUTH_NEXT_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  callbackUrl,
  exchangeCode,
  fetchGoogleProfile,
} from '@/lib/google-oauth';
import { SESSION_COOKIE, encodeSession, sessionCookieOptions } from '@/lib/auth';
import { getCredentialStatus } from '@/lib/meta-credentials';
import { provisionGoogleUser } from '@/lib/users';

/**
 * Step 2 of sign-in: Google redirects back here with a one-time code.
 *
 * Exchange it, provision the user and their workspace, issue the session cookie, and
 * route them to the next thing they have to do — connecting an ad account if they have
 * not, the dashboard if they have.
 *
 * Failures redirect to `/?error=...` rather than rendering JSON: this URL is reached by
 * a human's browser, not by fetch, and an error blob at an /api path is a dead end.
 */
export async function GET(req: NextRequest) {
  const origin = process.env.APP_URL?.replace(/\/$/, '') || req.nextUrl.origin;
  const url = req.nextUrl;

  const fail = (message: string) =>
    NextResponse.redirect(`${origin}/?error=${encodeURIComponent(message)}`);

  // The user pressed "Cancel" on Google's consent screen.
  const denied = url.searchParams.get('error');
  if (denied) return clearFlowCookies(fail(denied === 'access_denied' ? 'Sign-in was cancelled.' : denied));

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const expectedState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = req.cookies.get(OAUTH_VERIFIER_COOKIE)?.value;

  if (!code || !state || !expectedState || !codeVerifier) {
    return clearFlowCookies(fail('The sign-in link expired. Please try again.'));
  }

  if (!timingSafeEquals(state, expectedState)) {
    // Either a stale tab or a forged callback — both mean: start over.
    return clearFlowCookies(fail('Sign-in could not be verified. Please try again.'));
  }

  let userId: string;
  let companyId: string;

  try {
    const { accessToken } = await exchangeCode({
      code,
      codeVerifier,
      redirectUri: callbackUrl(req.nextUrl.origin),
    });

    const profile = await fetchGoogleProfile(accessToken);

    // An unverified address can be claimed by someone else later, which would hand
    // them this workspace's ad data.
    if (!profile.emailVerified) {
      return clearFlowCookies(fail('That Google account has an unverified email address.'));
    }

    ({ userId, companyId } = await provisionGoogleUser(profile));
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      return clearFlowCookies(fail(error.message));
    }

    console.error('[auth/google] sign-in failed', error);
    return clearFlowCookies(fail('Could not complete sign-in. Please try again.'));
  }

  // A returning user with a working credential goes straight to their numbers; a new
  // one has nothing to look at until an ad account is connected.
  let destination = req.cookies.get(OAUTH_NEXT_COOKIE)?.value || '';

  if (!destination) {
    const credential = await getCredentialStatus(companyId, userId).catch(() => null);
    destination = credential?.connected && credential.isValid ? '/dashboard' : '/setup';
  }

  const response = NextResponse.redirect(`${origin}${destination}`);
  response.cookies.set(SESSION_COOKIE, encodeSession(userId, companyId), sessionCookieOptions());

  return clearFlowCookies(response);
}

/** The state/verifier pair is single-use; leaving it set invites replay. */
function clearFlowCookies(response: NextResponse): NextResponse {
  for (const name of [OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE, OAUTH_NEXT_COOKIE]) {
    response.cookies.set(name, '', { ...sessionCookieOptions(0), maxAge: 0 });
  }

  return response;
}

function timingSafeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
