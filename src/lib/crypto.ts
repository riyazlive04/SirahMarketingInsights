import 'server-only';

import crypto from 'crypto';

/**
 * Envelope encryption for Meta access/refresh tokens.
 *
 * AES-256-GCM rather than the CBC mode in the original sketch. CBC is unauthenticated:
 * ciphertext can be modified without detection, which in a credentials table means an
 * attacker with write access to the database can flip bits in a token and — depending
 * on how the decrypted value is used — mount a padding-oracle attack to recover
 * plaintext. GCM authenticates, so tampering fails closed at `decipher.final()`.
 *
 * The two functions keep the CBC sketch's signatures, so callers are unaffected.
 * On-the-wire layout: version(1) | iv(12) | authTag(16) | ciphertext.
 */

const KEY_VERSION = 1;
const IV_LENGTH = 12; // 96-bit nonce — the size GCM is defined for.
const AUTH_TAG_LENGTH = 16;
const VERSION_LENGTH = 1;

/**
 * Resolved lazily rather than at module load, so `next build` (which imports this
 * module while collecting page data) does not require the production secret.
 */
function encryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;

  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY is not set. Generate one with: openssl rand -hex 32',
    );
  }

  const key = Buffer.from(raw, 'hex');

  // `Buffer.from` silently truncates at the first non-hex character, so a typo'd
  // key would otherwise produce a short key and a confusing downstream error.
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must be 32 bytes (64 hex characters); got ${key.length} bytes.`,
    );
  }

  return key;
}

/** Seals a token for storage in a BYTEA column. */
export function encryptToken(text: string): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);

  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);

  return Buffer.concat([
    Buffer.from([KEY_VERSION]),
    iv,
    cipher.getAuthTag(),
    ciphertext,
  ]);
}

/** Opens a token sealed by {@link encryptToken}. Throws if the payload was tampered with. */
export function decryptToken(sealed: Buffer): string {
  if (sealed.length < VERSION_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted token payload is truncated.');
  }

  const version = sealed[0];
  if (version !== KEY_VERSION) {
    throw new Error(`Unsupported token key version: ${version}.`);
  }

  const iv = sealed.subarray(VERSION_LENGTH, VERSION_LENGTH + IV_LENGTH);
  const authTag = sealed.subarray(
    VERSION_LENGTH + IV_LENGTH,
    VERSION_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH,
  );
  const ciphertext = sealed.subarray(VERSION_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export const TOKEN_KEY_VERSION = KEY_VERSION;
