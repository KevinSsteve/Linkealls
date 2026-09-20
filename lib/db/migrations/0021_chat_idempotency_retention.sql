CREATE TABLE IF NOT EXISTS "lead_chat_requests" (
  "id" uuid PRIMARY KEY,
  "business_id" integer NOT NULL,
  "lead_id" uuid NOT NULL,
  "memory_revision" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'processing',
  "response" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "lead_chat_request_scope_unique"
  ON "lead_chat_requests" ("business_id", "lead_id", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "lead_chat_request_revision_unique"
  ON "lead_chat_requests" ("business_id", "lead_id", "memory_revision");
CREATE INDEX IF NOT EXISTS "lead_chat_request_retention_idx"
  ON "lead_chat_requests" ("updated_at");