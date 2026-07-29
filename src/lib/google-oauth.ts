import 'server-only';

import crypto from 'crypto';

/**
 * Google OAuth 2.0 authorization-code flow with PKCE, hand-rolled.
 *
 * No auth library: the whole flow is two HTTPS calls to Google plus a signed cookie
 * (src/lib/auth.ts), and every dependency added here is one more place a Meta access
 * token could leak from. NextAuth/Auth.js remains a drop-in later — it would replace
 * this module and `session.ts`, nothing else.
 *
 * The id_token is deliberately *not* verified locally. Verifying it means fetching and
 * caching Google's JWKS and getting RS256 validation right; instead the profile is read
 * from the userinfo endpoint over TLS directly to Google, which is authenticated by the
 * connection itself. Same guarantee, no crypto to get wrong.
 */

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

/** Short-lived cookies carrying the CSRF state and the PKCE verifier across the redirect. */
export const OAUTH_STATE_COOKIE = 'ayn_oauth_state';
export const OAUTH_VERIFIER_COOKIE = 'ayn_oauth_verifier';
export const OAUTH_NEXT_COOKIE = 'ayn_oauth_next';
export const OAUTH_TTL_SECONDS = 10 * 60;

export interface GoogleProfile {
  /** Stable per-user identifier. The email can be reassigned; this cannot. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

export class GoogleAuthError extends Error {}

/** True when the deployment has Google credentials, so the UI can say so instead of 500ing. */
export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new GoogleAuthError(
      'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set. Create an OAuth client at ' +
        'https://console.cloud.google.com/apis/credentials and add them to .env.local.',
    );
  }

  return { clientId, clientSecret };
}

/**
 * Where Google sends the browser back. APP_URL wins when set — behind a proxy the
 * request origin is the internal one, and a redirect_uri that does not match the
 * registered value to the character is rejected by Google.
 */
export function callbackUrl(requestOrigin: string): string {
  const base = (process.env.APP_URL || requestOrigin).replace(/\/$/, '');
  return `${base}/api/auth/google/callback`;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** S256 PKCE challenge for a verifier from {@link randomToken}. */
export function codeChallengeFor(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function buildAuthorizeUrl(options: {
  redirectUri: string;
  state: string;
  codeVerifier: string;
}): string {
  const { clientId } = credentials();

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', options.state);
  url.searchParams.set('code_challenge', codeChallengeFor(options.codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');
  // Always show the account chooser — people running ads for a client are routinely
  // signed into more than one Google account, and silently picking the first is wrong.
  url.searchParams.set('prompt', 'select_account');

  return url.toString();
}

/** Trades the one-time code for an access token. Throws {@link GoogleAuthError} on refusal. */
export async function exchangeCode(options: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<{ accessToken: string }> {
  const { clientId, clientSecret } = credentials();

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: options.code,
      code_verifier: options.codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: options.redirectUri,
    }),
    cache: 'no-store',
  });

  const body = (await res.json().catch(() => null)) as
    | { access_token?: string; error?: string; error_description?: string }
    | null;

  if (!res.ok || !body?.access_token) {
    throw new GoogleAuthError(
      body?.error_description || body?.error || `Google rejected the code exchange (${res.status}).`,
    );
  }

  return { accessToken: body.access_token };
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new GoogleAuthError(`Could not read the Google profile (${res.status}).`);
  }

  const body = (await res.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };

  if (!body.sub || !body.email) {
    throw new GoogleAuthError('Google returned a profile without a subject id or email.');
  }

  return {
    sub: body.sub,
    email: body.email.toLowerCase(),
    emailVerified: body.email_verified !== false,
    name: body.name ?? null,
    picture: body.picture ?? null,
  };
}
