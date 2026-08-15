-- Real ad campaigns via Zernio: payment in Kz, creative generation, publication
-- and metrics sync. Additive-only; idempotent (safe on environments where the
-- dev push already applied part of it).

ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "duration_days" integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS "payment_status" text NOT NULL DEFAULT 'nao_pago',
  ADD COLUMN IF NOT EXISTS "payment_merchant_transaction_id" text,
  ADD COLUMN IF NOT EXISTS "payment_method" text,
  ADD COLUMN IF NOT EXISTS "paid_at" timestamp,
  ADD COLUMN IF NOT EXISTS "fx_rate_aoa_per_usd" numeric(14,4),
  ADD COLUMN IF NOT EXISTS "budget_usd" numeric(14,2),
  ADD COLUMN IF NOT EXISTS "creative_status" text NOT NULL DEFAULT 'nenhum',
  ADD COLUMN IF NOT EXISTS "creative_json" jsonb,
  ADD COLUMN IF NOT EXISTS "creative_error" text,
  ADD COLUMN IF NOT EXISTS "publish_status" text NOT NULL DEFAULT 'nao_publicada',
  ADD COLUMN IF NOT EXISTS "publish_error" text,
  ADD COLUMN IF NOT EXISTS "zernio_ad_id" text,
  ADD COLUMN IF NOT EXISTS "zernio_campaign_id" text,
  ADD COLUMN IF NOT EXISTS "zernio_ad_set_id" text,
  ADD COLUMN IF NOT EXISTS "published_simulated" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "synced_spend_usd" numeric(14,2),
  ADD COLUMN IF NOT EXISTS "synced_impressions" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "synced_clicks" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_sync_at" timestamp,
  ADD COLUMN IF NOT EXISTS "published_at" timestamp;

DO $$ BEGIN
  ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_payment_merchant_transaction_id_unique"
    UNIQUE ("payment_merchant_transaction_id");
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

ALTER TABLE "wallet_ledger"
  ADD COLUMN IF NOT EXISTS "campaign_id" uuid;

-- One debit per campaign (idempotent wallet payment).
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_ledger_campaign_debit_uq"
  ON "wallet_ledger" ("campaign_id")
  WHERE "campaign_id" IS NOT NULL;

-- Immutable record of each Multicaixa charge attempt per campaign, so delayed
-- webhooks can always be matched even after the campaign row was retried.
CREATE TABLE IF NOT EXISTS "campaign_payment_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_id" uuid NOT NULL,
  "merchant_transaction_id" text NOT NULL UNIQUE,
  "status" text NOT NULL DEFAULT 'pendente',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Constraint that drizzle push kept prompting about (already in schema).
DO $$ BEGIN
  ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_merchant_transaction_id_unique"
    UNIQUE ("merchant_transaction_id");
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;
