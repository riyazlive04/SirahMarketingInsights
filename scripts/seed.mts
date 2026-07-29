/**
 * Seeds (or updates) a demo agency, user, membership and Meta credential so the app
 * can be run end to end locally. Uses the app's own saveMetaCredential, so the row is
 * sealed exactly as production would seal it.
 *
 * Idempotent: re-running rotates the stored token and re-validates the credential
 * rather than creating a second tenant. That is the supported way to swap a
 * placeholder token for a real one:
 *
 *   # add META_ACCESS_TOKEN=... to .env.local, then
 *   npm run seed
 */
import { Pool } from 'pg';
import { saveMetaCredential } from '../src/lib/meta-credentials.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set.');

const COMPANY_NAME = 'Sirah Demo Agency';
const USER_EMAIL = 'demo@sirahdigital.in';

const accessToken = process.env.META_ACCESS_TOKEN;
const isPlaceholder = !accessToken;

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: false },
});

// companies has no natural unique key, so look up by name before inserting.
const existingCompany = await pool.query<{ id: string }>(
  `SELECT id FROM companies WHERE name = $1 LIMIT 1`,
  [COMPANY_NAME],
);

const companyId = existingCompany.rows[0]?.id ?? (
  await pool.query<{ id: string }>(
    `INSERT INTO companies (name) VALUES ($1) RETURNING id`,
    [COMPANY_NAME],
  )
).rows[0].id;

const { rows: [user] } = await pool.query<{ id: string }>(
  // Placeholder hash — there is no sign-in flow yet; see README "Not built".
  `INSERT INTO users (email, password_hash)
   VALUES ($1, 'set-by-your-auth-library')
   ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
   RETURNING id`,
  [USER_EMAIL],
);

await pool.query(
  `INSERT INTO company_members (user_id, company_id, role)
   VALUES ($1, $2, 'admin')
   ON CONFLICT (user_id, company_id) DO NOTHING`,
  [user.id, companyId],
);

await saveMetaCredential({
  companyId,
  metaAppId: process.env.META_APP_ID ?? '000000000000000',
  metaBusinessId: process.env.META_BUSINESS_ID ?? null,
  accessToken: accessToken ?? 'EAAG-demo-token-replace-with-a-real-one',
});

console.log(
  isPlaceholder
    ? 'Seeded with a PLACEHOLDER token — Meta will reject it (403).\n' +
      'Set META_ACCESS_TOKEN in .env.local and re-run to store a real one.\n'
    : `Seeded with a real token (${accessToken.slice(0, 6)}…${accessToken.slice(-4)}, ` +
      `${accessToken.length} chars), encrypted at rest.\n`,
);
// Sign-in is Google's job now; this is only for working without an OAuth client
// configured. The value is HMAC-signed, so it cannot be assembled by hand any more.
const { SESSION_COOKIE, encodeSession } = await import('../src/lib/auth.js');

console.log('Sign in with Google at http://localhost:3000, or for a shortcut in dev:');
console.log('  visit http://localhost:3000/api/dev-login');
console.log('\nOr set this cookie by hand:');
console.log(`  ${SESSION_COOKIE} = ${encodeSession(user.id, companyId)}`);

await pool.end();
