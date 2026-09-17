ALTER TABLE users
ADD COLUMN IF NOT EXISTS sensitive_auth_expires_at timestamp;