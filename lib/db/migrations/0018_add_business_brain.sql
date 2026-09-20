CREATE TABLE IF NOT EXISTS "business_knowledge" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" integer NOT NULL,
  "kind" text NOT NULL,
  "key" text NOT NULL,
  "version" integer NOT NULL,
  "status" text DEFAULT 'proposed' NOT NULL,
  "visibility" text DEFAULT 'owner_only' NOT NULL,
  "content" jsonb NOT NULL,
  "provenance" jsonb NOT NULL,
  "confidence" integer DEFAULT 50 NOT NULL,
  "source_lead_id" uuid,
  "valid_from" timestamp DEFAULT now() NOT NULL,
  "valid_until" timestamp,
  "review_at" timestamp,
  "approved_at" timestamp,
  "review_comment" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "business_knowledge_version_unique"
  ON "business_knowledge" ("business_id", "kind", "key", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "business_knowledge_one_approved_unique"
  ON "business_knowledge" ("business_id", "kind", "key")
  WHERE "status" = 'approved';
CREATE INDEX IF NOT EXISTS "business_knowledge_lookup_idx"
  ON "business_knowledge" ("business_id", "status", "kind");
CREATE INDEX IF NOT EXISTS "business_knowledge_lead_idx"
  ON "business_knowledge" ("business_id", "source_lead_id");

CREATE TABLE IF NOT EXISTS "business_ai_evaluations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" integer NOT NULL,
  "channel" text NOT NULL,
  "prompt_version" text NOT NULL,
  "scenario" text NOT NULL,
  "outcome" text NOT NULL,
  "scores" jsonb NOT NULL,
  "latency_ms" integer NOT NULL,
  "cost_micros" integer,
  "input_hash" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "business_ai_evaluations_tenant_idx"
  ON "business_ai_evaluations" ("business_id", "created_at");