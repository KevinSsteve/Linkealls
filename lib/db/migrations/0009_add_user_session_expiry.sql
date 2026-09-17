ALTER TABLE users
ADD COLUMN IF NOT EXISTS session_expires_at timestamp NOT NULL DEFAULT (now() + interval '30 days');