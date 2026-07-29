-- Connect-with-Facebook.
--
-- Until now a credential arrived as a pasted string and the app knew nothing about it:
-- not who it belonged to, not what it was allowed to do, not when it died. Tokens
-- obtained through Facebook Login carry all three, so record them — `token_expires_at`
-- has existed since 001 with nothing to populate it.

ALTER TABLE meta_credentials ADD COLUMN IF NOT EXISTS meta_user_id VARCHAR(100);

-- Space-separated, exactly as Meta reports them. Stored so the UI can say *which*
-- permission is missing when a call is refused, rather than "something went wrong".
ALTER TABLE meta_credentials ADD COLUMN IF NOT EXISTS granted_scopes TEXT;

-- 'oauth' | 'paste'. A pasted token cannot be renewed without the user going back to
-- the Graph API Explorer, an OAuth one can be re-consented in a click — so the
-- expiry warning has to say different things depending on how it got here.
ALTER TABLE meta_credentials ADD COLUMN IF NOT EXISTS connection_method VARCHAR(20) NOT NULL DEFAULT 'paste';
