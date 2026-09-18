-- Durable idempotency keys for scheduled work. This is additive and safe to
-- apply repeatedly; existing production data is neither changed nor removed.
CREATE TABLE IF NOT EXISTS scheduled_job_runs (
  job_name text NOT NULL,
  run_key text NOT NULL,
  claimed_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (job_name, run_key)
);