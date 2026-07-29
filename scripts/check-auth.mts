/**
 * Checks the sign-in path that HTTP tests cannot reach without a real Google OAuth
 * client: user provisioning, workspace scoping, session cookie signing, and the shape
 * of the authorize URL.
 *
 *   npm run check:auth
 *
 * Needs DATABASE_URL and ENCRYPTION_KEY (or SESSION_SECRET). It writes to the database
 * and deletes what it wrote — point it at a development database, not production.
 */
import crypto from 'crypto';
import { Pool } from 'pg';
import {
  getUserProfile,
  getWorkspace,
  provisionGoogleUser,
  renameWorkspace,
} from '../src/lib/users.js';
import { decodeSession, encodeSession } from '../src/lib/auth.js';
import {
  buildAuthorizeUrl,
  callbackUrl,
  codeChallengeFor,
  randomToken,
} from '../src/lib/google-oauth.js';

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: false },
});

const stamp = Date.now();
const email = `oauth-check-${stamp}@example.com`;
const legacyEmail = `legacy-check-${stamp}@example.com`;

console.log('\nprovisionGoogleUser');

const first = await provisionGoogleUser({
  sub: `sub-${stamp}`,
  email,
  emailVerified: true,
  name: 'Test Marketer',
  picture: 'https://lh3.googleusercontent.com/x',
});

check('creates a user', Boolean(first.userId));
check('creates a workspace', Boolean(first.companyId));

const profile = await getUserProfile(first.userId);
check('stores the Google name', profile?.displayName === 'Test Marketer', String(profile?.displayName));
check('stores the avatar', profile?.avatarUrl === 'https://lh3.googleusercontent.com/x');

const workspace = await getWorkspace(first.companyId, first.userId);
check('workspace named from the profile', workspace?.name === "Test Marketer's Ad Account", String(workspace?.name));
check('creator is an admin', workspace?.role === 'admin', String(workspace?.role));

const { rows: hashRows } = await pool.query<{ password_hash: string | null }>(
  'SELECT password_hash FROM users WHERE id = $1',
  [first.userId],
);
check('password_hash stays NULL', hashRows[0].password_hash === null, String(hashRows[0].password_hash));

const second = await provisionGoogleUser({
  sub: `sub-${stamp}`,
  email,
  emailVerified: true,
  name: 'Renamed Marketer',
  picture: null,
});

check('signing in again reuses the user', second.userId === first.userId);
check('signing in again reuses the workspace', second.companyId === first.companyId);
check('profile updates on re-login', (await getUserProfile(first.userId))?.displayName === 'Renamed Marketer');
check(
  'a null avatar does not wipe the stored one',
  (await getUserProfile(first.userId))?.avatarUrl === 'https://lh3.googleusercontent.com/x',
);

const { rows: countRows } = await pool.query<{ n: string }>(
  'SELECT count(*) n FROM company_members WHERE user_id = $1',
  [first.userId],
);
check('no duplicate workspace', countRows[0].n === '1', countRows[0].n);

// Someone seeded or invited by email should adopt their Google identity rather than
// ending up with two accounts and two sets of numbers.
const {
  rows: [legacy],
} = await pool.query<{ id: string }>(
  `INSERT INTO users (email, password_hash) VALUES ($1, 'legacy') RETURNING id`,
  [legacyEmail],
);

const adopted = await provisionGoogleUser({
  sub: `sub-legacy-${stamp}`,
  email: legacyEmail,
  emailVerified: true,
  name: 'Legacy',
  picture: null,
});

check('an email-matched user is adopted, not duplicated', adopted.userId === legacy.id);

console.log('\nworkspace scoping');
check('a member can rename', await renameWorkspace(first.companyId, first.userId, 'Acme Media'));
check('the name changed', (await getWorkspace(first.companyId, first.userId))?.name === 'Acme Media');
check('a non-member cannot rename', !(await renameWorkspace(first.companyId, legacy.id, 'Stolen')));
check('the name survived the attempt', (await getWorkspace(first.companyId, first.userId))?.name === 'Acme Media');
check('a non-member cannot read the workspace', (await getWorkspace(first.companyId, legacy.id)) === null);

console.log('\nsession cookie');

const token = encodeSession(first.userId, first.companyId);
const decoded = decodeSession(token);

check('round-trips', decoded?.uid === first.userId && decoded?.cid === first.companyId);
check('carries an expiry in the future', typeof decoded?.exp === 'number' && decoded.exp > Date.now() / 1000);
check(
  'rejects a flipped signature byte',
  decodeSession(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')) === null,
);
check(
  'rejects a payload swapped under a valid signature',
  decodeSession(
    `v1.${Buffer.from('{"uid":"attacker","cid":"victim","exp":9999999999}').toString('base64url')}.${token.split('.')[2]}`,
  ) === null,
);
check('rejects garbage', decodeSession('nonsense') === null);
check('rejects an absent cookie', decodeSession(undefined) === null);

// Signed, not encrypted — the ids are readable by design; forging them is what is
// prevented. Asserted so nobody later mistakes the cookie for a secret store.
check(
  'the payload is readable (signed, not encrypted)',
  Buffer.from(token.split('.')[1], 'base64url').toString().includes(first.userId),
);

const expiredBody = `v1.${Buffer.from(JSON.stringify({ uid: 'a', cid: 'b', exp: 1 })).toString('base64url')}`;
const key = crypto
  .createHmac('sha256', process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY!)
  .update('ayn:session:v1')
  .digest();
const expiredButSigned = `${expiredBody}.${crypto.createHmac('sha256', key).update(expiredBody).digest('base64url')}`;

check('rejects an expired session even with a valid signature', decodeSession(expiredButSigned) === null);

// A placeholder left in .env.local must never become the signing key.
const realSecret = process.env.SESSION_SECRET;

function signingRejects(value: string | undefined): boolean {
  if (value === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = value;

  try {
    encodeSession('a', 'b');
    return false;
  } catch {
    return true;
  } finally {
    if (realSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = realSecret;
  }
}

check('a blank secret falls back to ENCRYPTION_KEY rather than signing with ""', !signingRejects('   '));
check('an unfilled placeholder is refused', signingRejects('# openssl rand -hex 32'));
check('a too-short secret is refused', signingRejects('hunter2'));

console.log('\nGoogle authorize URL');

process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';

const verifier = randomToken();
const authorize = new URL(
  buildAuthorizeUrl({
    redirectUri: 'http://localhost:3000/api/auth/google/callback',
    state: 'state-123',
    codeVerifier: verifier,
  }),
);

check('points at Google', authorize.origin === 'https://accounts.google.com');
check('asks for an authorization code', authorize.searchParams.get('response_type') === 'code');
check('requests openid email profile only', authorize.searchParams.get('scope') === 'openid email profile');
check('carries the CSRF state', authorize.searchParams.get('state') === 'state-123');
check('uses PKCE S256', authorize.searchParams.get('code_challenge_method') === 'S256');
check(
  'sends the challenge and never the verifier',
  authorize.searchParams.get('code_challenge') === codeChallengeFor(verifier) &&
    !authorize.search.includes(verifier),
);
check('forces the account chooser', authorize.searchParams.get('prompt') === 'select_account');

process.env.APP_URL = 'https://ads.example.com';
check(
  'the callback URL honours APP_URL over the request origin',
  callbackUrl('http://internal:3000') === 'https://ads.example.com/api/auth/google/callback',
);
delete process.env.APP_URL;
check(
  'the callback URL falls back to the request origin',
  callbackUrl('http://localhost:3000') === 'http://localhost:3000/api/auth/google/callback',
);

await pool.query('DELETE FROM companies WHERE created_by IN (SELECT id FROM users WHERE email IN ($1, $2))', [
  email,
  legacyEmail,
]);
await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [email, legacyEmail]);
await pool.end();

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
