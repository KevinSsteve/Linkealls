CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket_key varchar(64) PRIMARY KEY,
  reset_at timestamp NOT NULL,
  count integer NOT NULL CHECK (count >= 0)
);

CREATE INDEX IF NOT EXISTS auth_rate_limits_reset_at_idx
  ON auth_rate_limits (reset_at);