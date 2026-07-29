-- Google sign-in.
--
-- 001_init.sql modelled users around a password_hash that nothing ever wrote (see the
-- README's "Not built"). Identity now comes from Google, so the column becomes optional
-- and the Google subject id — the stable, immutable per-user identifier, unlike the
-- email, which a Google Workspace admin can reassign — becomes the join key.

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub    VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name  VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;

-- Every sign-in provisions a workspace for a first-time user, so the "who created
-- this?" question is now answerable and worth recording. Nullable because the seeded
-- demo company predates it.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
