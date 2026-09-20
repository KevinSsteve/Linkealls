ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "contact_phone" text,
  ADD COLUMN IF NOT EXISTS "contact_purpose" text,
  ADD COLUMN IF NOT EXISTS "contact_consent_status" text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "contact_consented_at" timestamp,
  ADD COLUMN IF NOT EXISTS "contact_captured_at" timestamp,
  ADD COLUMN IF NOT EXISTS "whatsapp_clicked_at" timestamp,
  ADD COLUMN IF NOT EXISTS "whatsapp_click_count" integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "leads_contact_business_idx"
  ON "leads" ("business_id", "contact_consent_status");