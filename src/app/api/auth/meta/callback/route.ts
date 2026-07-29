import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { sessionCookieOptions } from '@/lib/auth';
import { listGraphAdAccounts } from '@/lib/meta-graph';
import { saveMetaCredential } from '@/lib/meta-credentials';
import {
  META_OAUTH_STATE_COOKIE,
  MetaAuthError,
  completeMetaConnection,
  metaCallbackUrl,
} from '@/lib/meta-oauth';
import { getSession } from '@/lib/session';

/**
 * Step 2: Facebook sends the user back with a code. Exchange it for a long-lived
 * token, confirm it actually reaches ad accounts, and store it encrypted.
 *
 * The account check before storing is the same rule the paste flow follows: a stored
 * token that reads nothing is worse than no token, because the dashboard then fails
 * later and further from the cause.
 */
export async function GET(req: NextRequest) {
  const origin = process.env.APP_URL?.replace(/\/$/, '') || req.nextUrl.origin;
  const url = req.nextUrl;

  const fail = (message: string) =>
    clearState(NextResponse.redirect(`${origin}/setup?error=${encodeURIComponent(message)}`));

  const session = await getSession().catch(() => null);
  if (!session) return clearState(NextResponse.redirect(`${origin}/`));

  // The user pressed Cancel, or Meta refused before consent.
  const denied = url.searchParams.get('error');
  if (denied) {
    const description = url.searchParams.get('error_description');
    return fail(
      denied === 'access_denied'
        ? 'You cancelled the Facebook connection. Nothing was changed.'
        : description || denied,
    );
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = req.cookies.get(META_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !expectedState) {
    return fail('The Facebook connection link expired. Please try again.');
  }

  if (!timingSafeEquals(state, expectedState)) {
    return fail('The Facebook connection could not be verified. Please try again.');
  }

  let connection;

  try {
    connection = await completeMetaConnection({
      code,
      redirectUri: metaCallbackUrl(req.nextUrl.origin),
    });
  } catch (error) {
    if (error instanceof MetaAuthError) return fail(error.message);

    console.error('[auth/meta] token exchange failed', error);
    return fail('Could not complete the Facebook connection. Please try again.');
  }

  let accounts;

  try {
    accounts = await listGraphAdAccounts(connection.accessToken);
  } catch (error) {
    return fail(
      `Facebook connected, but no ad data could be read: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }

  if (!accounts.length) {
    // Almost always a permission the user unticked, or an account owned by a Business
    // they are not an admin of — so name what was actually granted.
    return fail(
      'Facebook connected, but this account reaches no ad accounts. Granted permissions: ' +
        `${connection.grantedScopes || 'none'}. Make sure you accepted ads_read and chose the ` +
        'right business on the consent screen.',
    );
  }

  try {
    await saveMetaCredential({
      companyId: session.companyId,
      metaAppId: process.env.META_APP_ID ?? 'facebook-login',
      accessToken: connection.accessToken,
      tokenExpiresAt: connection.expiresAt,
      metaUserId: connection.metaUserId,
      grantedScopes: connection.grantedScopes,
      connectionMethod: 'oauth',
    });
  } catch (error) {
    console.error('[auth/meta] failed to store credential', error);
    return fail('Could not store the connection. Please try again.');
  }

  return clearState(NextResponse.redirect(`${origin}/dashboard`));
}

function clearState(response: NextResponse): NextResponse {
  response.cookies.set(META_OAUTH_STATE_COOKIE, '', {
    ...sessionCookieOptions(0),
    maxAge: 0,
  });

  return response;
}

function timingSafeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
