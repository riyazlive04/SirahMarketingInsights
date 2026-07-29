import 'server-only';

import { db } from '@/lib/db';
import { TOKEN_KEY_VERSION, decryptToken, encryptToken } from '@/lib/crypto';

export interface MetaCredentialInput {
  companyId: string;
  metaAppId: string;
  metaBusinessId?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
}

export interface MetaCredential {
  companyId: string;
  metaAppId: string;
  metaBusinessId: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  isValid: boolean;
}

/**
 * Upserts a company's Meta credentials. Plaintext tokens exist only as arguments —
 * everything that crosses the wire to Postgres is already sealed.
 */
export async function saveMetaCredential(input: MetaCredentialInput): Promise<void> {
  await db().query(
    `INSERT INTO meta_credentials (
       company_id, meta_app_id, meta_business_id,
       encrypted_access_token, encrypted_refresh_token,
       key_version, token_expires_at, is_valid, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP)
     ON CONFLICT (company_id) DO UPDATE SET
       meta_app_id = EXCLUDED.meta_app_id,
       meta_business_id = EXCLUDED.meta_business_id,
       encrypted_access_token = EXCLUDED.encrypted_access_token,
       encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
       key_version = EXCLUDED.key_version,
       token_expires_at = EXCLUDED.token_expires_at,
       is_valid = TRUE,
       updated_at = CURRENT_TIMESTAMP`,
    [
      input.companyId,
      input.metaAppId,
      input.metaBusinessId ?? null,
      encryptToken(input.accessToken),
      input.refreshToken ? encryptToken(input.refreshToken) : null,
      TOKEN_KEY_VERSION,
      input.tokenExpiresAt ?? null,
    ],
  );
}

interface CredentialRow {
  meta_app_id: string;
  meta_business_id: string | null;
  encrypted_access_token: Buffer;
  encrypted_refresh_token: Buffer | null;
  token_expires_at: Date | null;
  is_valid: boolean;
}

/**
 * Loads and decrypts a company's credentials, scoped by membership so a caller can
 * never read a company they do not belong to. Returns null when there is no row,
 * the user is not a member, or the credential has been marked invalid.
 */
export async function getMetaCredential(
  companyId: string,
  userId: string,
): Promise<MetaCredential | null> {
  const { rows } = await db().query<CredentialRow>(
    `SELECT c.meta_app_id, c.meta_business_id,
            c.encrypted_access_token, c.encrypted_refresh_token,
            c.token_expires_at, c.is_valid
       FROM meta_credentials c
       JOIN company_members m ON m.company_id = c.company_id
      WHERE c.company_id = $1
        AND m.user_id = $2
        AND c.is_valid
      LIMIT 1`,
    [companyId, userId],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    companyId,
    metaAppId: row.meta_app_id,
    metaBusinessId: row.meta_business_id,
    accessToken: decryptToken(row.encrypted_access_token),
    refreshToken: row.encrypted_refresh_token
      ? decryptToken(row.encrypted_refresh_token)
      : null,
    tokenExpiresAt: row.token_expires_at,
    isValid: row.is_valid,
  };
}

export interface CredentialStatus {
  /** A row exists for this company — it may still have been flagged invalid. */
  connected: boolean;
  isValid: boolean;
  updatedAt: Date | null;
}

/**
 * Whether a company has a Meta token, without decrypting it. Used by the onboarding
 * guard and the setup page, which need to know *that* a credential exists, not what it
 * is — and `getMetaCredential` cannot answer this, since it filters invalid rows away
 * and so cannot distinguish "never connected" from "connected, then expired".
 */
export async function getCredentialStatus(
  companyId: string,
  userId: string,
): Promise<CredentialStatus> {
  const { rows } = await db().query<{ is_valid: boolean; updated_at: Date | null }>(
    `SELECT c.is_valid, c.updated_at
       FROM meta_credentials c
       JOIN company_members m ON m.company_id = c.company_id
      WHERE c.company_id = $1 AND m.user_id = $2
      LIMIT 1`,
    [companyId, userId],
  );

  const row = rows[0];
  if (!row) return { connected: false, isValid: false, updatedAt: null };

  return { connected: true, isValid: row.is_valid, updatedAt: row.updated_at };
}

/** Flags a credential after Meta rejects it, so the UI can prompt for re-auth. */
export async function markCredentialInvalid(companyId: string): Promise<void> {
  await db().query(
    `UPDATE meta_credentials
        SET is_valid = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE company_id = $1`,
    [companyId],
  );
}
