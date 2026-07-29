import 'server-only';

import crypto from 'crypto';

/**
 * Facebook Login for Business — the authorization-code flow that replaces asking a
 * business owner to visit the Graph API Explorer and paste a string.
 *
 * Three calls, in order, because the token Facebook hands back first is nearly useless:
 *
 *   1. code            -> short-lived user token (1–2 hours)
 *   2. fb_exchange_token -> long-lived user token (~60 days)
 *   3. debug_token     -> the granted scopes and the real expiry
 *
 * Step 2 is not optional. Skipping it produces exactly the failure this flow exists to
 * remove: a dashboard that works during the demo and is dead by the morning.
 *
 * Step 3 exists because `expires_in` from step 2 is a duration relative to a clock we
 * do not control, and because a user can untick individual permissions on the consent
 * screen — so what was *requested* tells you nothing about what was *granted*.
 */

const API_VERSION = process.env.META_GRAPH_VERSION ?? 'v23.0';
const GRAPH_BASE = 'https://graph.facebook.com';
const DIALOG_URL = `https://www.facebook.com/${API_VERSION}/dialog/oauth`;

export const META_OAUTH_STATE_COOKIE = 'ayn_meta_state';
export const META_OAUTH_TTL_SECONDS = 10 * 60;

/**
 * The reviewable minimum for read-only reporting:
 *   ads_read            — the insights themselves
 *   business_management — ad accounts owned by a Business rather than the person
 *   pages_show_list     — the Pages they run ads for
 *
 * `ads_mcp_management` is deliberately absent. Meta's Ads MCP server needs it, but
 * requesting a permission the app has not been approved for makes the whole consent
 * screen fail — and without it the app still works, because every account falls back to
 * the Marketing API (see meta-graph.ts). Add it here once App Review clears it:
 *   META_OAUTH_SCOPES=ads_read,business_management,pages_show_list,ads_mcp_management
 */
const DEFAULT_SCOPES = 'ads_read,business_management,pages_show_list';

export class MetaAuthError extends Error {}

export interface MetaConnection {
  accessToken: string;
  /** Facebook user id the token belongs to. */
  metaUserId: string | null;
  /** Space-separated, as granted — not as requested. */
  grantedScopes: string;
  expiresAt: Date | null;
}

/** True when the deployment can offer the button at all. */
export function isMetaOAuthConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

function credentials(): { appId: string; appSecret: string } {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    throw new MetaAuthError(
      'META_APP_ID / META_APP_SECRET are not set. Create an app at ' +
        'developers.facebook.com/apps, add the Facebook Login for Business product, and ' +
        'copy the credentials from Settings → Basic.',
    );
  }

  return { appId, appSecret };
}

export function metaCallbackUrl(requestOrigin: string): string {
  const base = (process.env.APP_URL || requestOrigin).replace(/\/$/, '');
  return `${base}/api/auth/meta/callback`;
}

export function buildMetaAuthorizeUrl(options: { redirectUri: string; state: string }): string {
  const { appId } = credentials();

  const url = new URL(DIALOG_URL);
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', options.state);
  url.searchParams.set('scope', process.env.META_OAUTH_SCOPES || DEFAULT_SCOPES);

  return url.toString();
}

export function randomState(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Runs the whole exchange and returns a token that is actually worth storing.
 * Throws {@link MetaAuthError} with Meta's own wording, which is usually specific
 * enough to act on ("this app is in development mode…").
 */
export async function completeMetaConnection(options: {
  code: string;
  redirectUri: string;
}): Promise<MetaConnection> {
  const { appId, appSecret } = credentials();

  const shortLived = await graphToken(
    new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: options.redirectUri,
      code: options.code,
    }),
  );

  const longLived = await graphToken(
    new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLived.accessToken,
    }),
  );

  const inspected = await inspectToken(longLived.accessToken, `${appId}|${appSecret}`);

  // Prefer debug_token's absolute timestamp; fall back to the relative `expires_in`.
  // A long-lived token can legitimately report expires_at = 0, meaning "never" — a
  // System User token does this — so 0 must become null, not 1970.
  const expiresAt =
    inspected.expiresAt ??
    (longLived.expiresIn ? new Date(Date.now() + longLived.expiresIn * 1000) : null);

  return {
    accessToken: longLived.accessToken,
    metaUserId: inspected.userId,
    grantedScopes: inspected.scopes.join(' '),
    expiresAt,
  };
}

async function graphToken(
  params: URLSearchParams,
): Promise<{ accessToken: string; expiresIn: number | null }> {
  const res = await fetch(`${GRAPH_BASE}/${API_VERSION}/oauth/access_token?${params}`, {
    cache: 'no-store',
  });

  const body = (await res.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string; type?: string; code?: number };
  } | null;

  if (!res.ok || !body?.access_token) {
    throw new MetaAuthError(body?.error?.message ?? `Meta refused the token exchange (${res.status}).`);
  }

  return { accessToken: body.access_token, expiresIn: body.expires_in ?? null };
}

async function inspectToken(
  token: string,
  appToken: string,
): Promise<{ userId: string | null; scopes: string[]; expiresAt: Date | null }> {
  const params = new URLSearchParams({ input_token: token, access_token: appToken });

  const res = await fetch(`${GRAPH_BASE}/${API_VERSION}/debug_token?${params}`, {
    cache: 'no-store',
  });

  const body = (await res.json().catch(() => null)) as {
    data?: { user_id?: string; scopes?: string[]; expires_at?: number; is_valid?: boolean };
  } | null;

  const data = body?.data;

  // Non-fatal: the token itself already worked twice to get here. Losing the metadata
  // costs the UI an expiry warning, not the connection.
  if (!data) return { userId: null, scopes: [], expiresAt: null };

  return {
    userId: data.user_id ?? null,
    scopes: data.scopes ?? [],
    expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null,
  };
}

export interface MetaPage {
  id: string;
  name: string;
  category: string | null;
}

/**
 * The Pages this person administers. Not required to read ad insights — spend lives on
 * the ad account — but it is how a business owner recognises their own account, so the
 * setup screen shows them.
 */
export async function listMetaPages(accessToken: string): Promise<MetaPage[]> {
  const params = new URLSearchParams({
    fields: 'id,name,category',
    limit: '50',
    access_token: accessToken,
  });

  const res = await fetch(`${GRAPH_BASE}/${API_VERSION}/me/accounts?${params}`, {
    cache: 'no-store',
  });

  const body = (await res.json().catch(() => null)) as {
    data?: { id?: string; name?: string; category?: string }[];
    error?: { message?: string };
  } | null;

  // Missing pages_show_list is a degraded view, not a broken one.
  if (!res.ok || body?.error || !body?.data) return [];

  return body.data
    .filter((page): page is { id: string; name?: string; category?: string } => Boolean(page.id))
    .map((page) => ({ id: page.id, name: page.name ?? page.id, category: page.category ?? null }));
}

/** Display name of the connected Facebook user, for the "Connected as …" line. */
export async function getMetaUserName(accessToken: string): Promise<string | null> {
  const params = new URLSearchParams({ fields: 'name', access_token: accessToken });

  const res = await fetch(`${GRAPH_BASE}/${API_VERSION}/me?${params}`, { cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as { name?: string } | null;

  return body?.name ?? null;
}
