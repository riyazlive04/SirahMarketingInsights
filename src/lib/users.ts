import 'server-only';

import { db } from '@/lib/db';
import type { GoogleProfile } from '@/lib/google-oauth';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: string;
}

/**
 * Turns a verified Google profile into a user + workspace, and returns what the
 * session cookie needs. Idempotent: signing in again updates the profile fields and
 * reuses the existing workspace rather than accumulating one per login.
 *
 * Runs in a transaction because a half-provisioned user — a `users` row with no
 * `company_members` row — would pass `getSession()`'s cookie check and then fail its
 * membership check forever, locking the account out with no way to self-serve.
 */
export async function provisionGoogleUser(
  profile: GoogleProfile,
): Promise<{ userId: string; companyId: string }> {
  const client = await db().connect();

  try {
    await client.query('BEGIN');

    // Match on the Google subject first, then fall back to the email so a user seeded
    // (or invited) by email adopts their Google identity instead of getting a duplicate.
    const { rows: existing } = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE google_sub = $1 OR lower(email) = $2 LIMIT 1`,
      [profile.sub, profile.email],
    );

    let userId = existing[0]?.id;

    if (userId) {
      await client.query(
        `UPDATE users
            SET google_sub    = $2,
                email         = $3,
                display_name  = COALESCE($4, display_name),
                avatar_url    = COALESCE($5, avatar_url),
                last_login_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [userId, profile.sub, profile.email, profile.name, profile.picture],
      );
    } else {
      const { rows } = await client.query<{ id: string }>(
        // password_hash stays NULL — identity is Google's, and a placeholder string
        // here would look like a credential that could be authenticated against.
        `INSERT INTO users (email, google_sub, display_name, avatar_url, last_login_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING id`,
        [profile.email, profile.sub, profile.name, profile.picture],
      );

      userId = rows[0].id;
    }

    const { rows: memberships } = await client.query<{ company_id: string }>(
      `SELECT m.company_id
         FROM company_members m
         JOIN companies c ON c.id = m.company_id
        WHERE m.user_id = $1
        ORDER BY c.created_at
        LIMIT 1`,
      [userId],
    );

    let companyId = memberships[0]?.company_id;

    if (!companyId) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO companies (name, created_by) VALUES ($1, $2) RETURNING id`,
        [defaultWorkspaceName(profile), userId],
      );

      companyId = rows[0].id;

      await client.query(
        `INSERT INTO company_members (user_id, company_id, role)
         VALUES ($1, $2, 'admin')
         ON CONFLICT (user_id, company_id) DO NOTHING`,
        [userId, companyId],
      );
    }

    await client.query('COMMIT');

    return { userId, companyId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function defaultWorkspaceName(profile: GoogleProfile): string {
  const base = profile.name?.trim() || profile.email.split('@')[0];
  const label = base.length > 40 ? `${base.slice(0, 40)}…` : base;

  return `${label}'s Ad Account`;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { rows } = await db().query<{
    id: string;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
  }>(
    `SELECT id, email, display_name, avatar_url FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  };
}

/** Every workspace this user belongs to — the basis for the workspace switcher. */
export async function listUserWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const { rows } = await db().query<{ id: string; name: string; role: string }>(
    `SELECT c.id, c.name, m.role
       FROM company_members m
       JOIN companies c ON c.id = m.company_id
      WHERE m.user_id = $1
      ORDER BY c.created_at`,
    [userId],
  );

  return rows;
}

export async function getWorkspace(
  companyId: string,
  userId: string,
): Promise<WorkspaceSummary | null> {
  const { rows } = await db().query<{ id: string; name: string; role: string }>(
    `SELECT c.id, c.name, m.role
       FROM companies c
       JOIN company_members m ON m.company_id = c.id
      WHERE c.id = $1 AND m.user_id = $2
      LIMIT 1`,
    [companyId, userId],
  );

  return rows[0] ?? null;
}

/**
 * Renames a workspace, scoped by membership so the id in a request body can only ever
 * reach a company the caller belongs to. Returns false when it does not.
 */
export async function renameWorkspace(
  companyId: string,
  userId: string,
  name: string,
): Promise<boolean> {
  const { rowCount } = await db().query(
    `UPDATE companies c
        SET name = $3
       FROM company_members m
      WHERE c.id = $1
        AND m.company_id = c.id
        AND m.user_id = $2`,
    [companyId, userId, name],
  );

  return (rowCount ?? 0) > 0;
}
