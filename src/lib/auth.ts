import 'server-only';

import crypto from 'crypto';

/**
 * Stateless, HMAC-signed session cookies.
 *
 * Before this, `getSession()` read two plaintext cookies holding a user id and a
 * company id — anyone who learned a valid pair could impersonate that user. The value
 * is now signed, so the browser cannot mint or edit one, and it carries an expiry so a
 * stolen cookie does not last forever.
 *
 * Signed rather than database-backed on purpose: the session is already re-checked
 * against `company_members` on every call (see session.ts), so a revoked membership
 * stops working immediately without a second table to keep in step. The trade-off is
 * that individual sessions cannot be revoked before `exp` — rotate SESSION_SECRET to
 * invalidate every session at once.
 *
 * Layout: v1.<base64url(payload)>.<base64url(hmac-sha256)>
 */

export const SESSION_COOKIE = 'ayn_session';

/** 30 days. Long enough that a dashboard user is not re-authenticating weekly. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const VERSION = 'v1';

export interface SessionPayload {
  /** users.id */
  uid: string;
  /** companies.id currently being viewed. */
  cid: string;
  /** Unix seconds. */
  exp: number;
}

/**
 * Derived, not used directly: SESSION_SECRET and ENCRYPTION_KEY protect different
 * things, and running a raw key through HKDF-style domain separation means a session
 * signature can never be confused with a token ciphertext key.
 *
 * ENCRYPTION_KEY is the fallback so a working deployment does not break on upgrade,
 * but SESSION_SECRET is what you want set: rotating it logs everyone out, while
 * rotating ENCRYPTION_KEY makes every stored Meta token unrecoverable.
 */
const MIN_SECRET_LENGTH = 32;

function signingKey(): Buffer {
  // Trimmed, and blank counts as unset. A line like `SESSION_SECRET=   # openssl rand
  // -hex 32` is a placeholder somebody meant to fill in; env parsers disagree about
  // whether the trailing comment is part of the value, and the failure mode if one
  // keeps it is silent and total — every session cookie signed with a string an
  // attacker can read in .env.example. Better to ignore it and fall back.
  const fromSession = (process.env.SESSION_SECRET ?? '').trim();
  const fromEncryption = (process.env.ENCRYPTION_KEY ?? '').trim();

  const source = fromSession ? 'SESSION_SECRET' : 'ENCRYPTION_KEY';
  const raw = fromSession || fromEncryption;

  if (!raw) {
    throw new Error('SESSION_SECRET is not set. Generate one with: openssl rand -hex 32');
  }

  // Rejects the other half of the placeholder problem: a parser that *does* hand over
  // `# openssl rand -hex 32` gives a 22-character key. Failing closed beats signing
  // sessions with a guessable string.
  if (raw.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${source} is only ${raw.length} characters; at least ${MIN_SECRET_LENGTH} are ` +
        'required. Generate one with: openssl rand -hex 32',
    );
  }

  return crypto.createHmac('sha256', raw).update('ayn:session:v1').digest();
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(body: string): string {
  return crypto.createHmac('sha256', signingKey()).update(body).digest('base64url');
}

/** Serialises a signed session value. Pair it with {@link sessionCookieOptions}. */
export function encodeSession(userId: string, companyId: string): string {
  const payload: SessionPayload = {
    uid: userId,
    cid: companyId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };

  const body = `${VERSION}.${b64url(JSON.stringify(payload))}`;

  return `${body}.${sign(body)}`;
}

/** Returns the payload only if the signature verifies and the session has not expired. */
export function decodeSession(raw: string | undefined): SessionPayload | null {
  if (!raw) return null;

  const lastDot = raw.lastIndexOf('.');
  if (lastDot < 0) return null;

  const body = raw.slice(0, lastDot);
  const signature = raw.slice(lastDot + 1);

  if (!body.startsWith(`${VERSION}.`)) return null;

  const expected = sign(body);

  // Compare in constant time. Lengths must match first — timingSafeEqual throws on a
  // length mismatch, which would itself be an oracle if it escaped as a 500.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: SessionPayload;

  try {
    payload = JSON.parse(Buffer.from(body.slice(VERSION.length + 1), 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload?.uid !== 'string' || typeof payload?.cid !== 'string') return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;

  return payload;
}

/**
 * Cookie flags. `secure` is conditional because localhost is served over HTTP — a
 * secure cookie there is silently dropped and sign-in appears to do nothing.
 */
export function sessionCookieOptions(maxAge = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    // `lax` still sends the cookie on the top-level GET that Google redirects back to.
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}
