-- Meta Ads MCP Dashboard — initial schema.
--
-- Token confidentiality is enforced in the application layer (see src/lib/crypto.ts):
-- the database only ever sees ciphertext, so a database compromise alone does not
-- yield usable Meta credentials. That property depends on ENCRYPTION_KEY living
-- outside the database (env / secret manager), never in a table or a pg setting.

-- No CREATE EXTENSION here on purpose. The original sketch enabled pgcrypto, but
-- nothing in this schema calls it: gen_random_uuid() has been core since PostgreSQL
-- 13, and the token encryption is app-side AES-256-GCM, not pgcrypto's pgp_sym_*.
-- Requiring it turns any deployment without contrib installed into a hard migration
-- failure for no benefit. On PostgreSQL 12 or older, add this line back:
--   CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. COMPANIES / BUSINESS ENTITIES (Each entrepreneur/agency can have multiple)
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. USERS (Agency employees or business owners)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. USER-COMPANY MAPPING (Handles multi-business access)
CREATE TABLE company_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member', -- 'admin', 'viewer'
    UNIQUE(user_id, company_id)
);

-- 4. SECURE META AUTHENTICATION TOKENS table
CREATE TABLE meta_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
    meta_app_id VARCHAR(100) NOT NULL,
    meta_business_id VARCHAR(100),

    -- Encrypted byte arrays for security at rest.
    -- Layout, written by encryptToken(): version(1) | iv(12) | authTag(16) | ciphertext.
    -- The auth tag is what makes tampering detectable — see src/lib/crypto.ts.
    encrypted_access_token BYTEA NOT NULL,
    encrypted_refresh_token BYTEA,

    -- Identifies which ENCRYPTION_KEY sealed this row so keys can be rotated
    -- without a flag-day re-encryption of every credential.
    key_version SMALLINT NOT NULL DEFAULT 1,

    token_expires_at TIMESTAMP WITH TIME ZONE,
    is_valid BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexing for high performance lookups
CREATE INDEX idx_meta_credentials_company ON meta_credentials(company_id);

-- The membership table is read on every request ("which companies may this user
-- see?") and on every company page ("who is on this company?"). The UNIQUE
-- constraint already indexes (user_id, company_id) and serves the first query;
-- this covers the second.
CREATE INDEX idx_company_members_company ON company_members(company_id);
