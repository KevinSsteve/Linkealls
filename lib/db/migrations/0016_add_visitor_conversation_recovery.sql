ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "visitor_recovery_hash" text,
  ADD COLUMN IF NOT EXISTS "visitor_recovery_family_id" uuid,
  ADD COLUMN IF NOT EXISTS "visitor_recovery_expires_at" timestamp,
  ADD COLUMN IF NOT EXISTS "visitor_recovery_revoked_at" timestamp,
  ADD COLUMN IF NOT EXISTS "traffic_click_key" uuid,
  ADD COLUMN IF NOT EXISTS "traffic_welcome_status" text,
  ADD COLUMN IF NOT EXISTS "traffic_welcome_claimed_at" timestamp,
  ADD COLUMN IF NOT EXISTS "traffic_welcome_claim_token" uuid;

CREATE INDEX IF NOT EXISTS "leads_visitor_recovery_idx"
  ON "leads" ("business_id", "visitor_recovery_hash");

CREATE INDEX IF NOT EXISTS "leads_visitor_recovery_family_idx"
  ON "leads" ("business_id", "visitor_recovery_family_id");

CREATE UNIQUE INDEX IF NOT EXISTS "leads_traffic_click_unique"
  ON "leads" ("business_id", "traffic_click_key");