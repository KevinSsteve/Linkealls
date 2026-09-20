CREATE TABLE IF NOT EXISTS "profile_change_proposals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" integer NOT NULL,
  "field_path" text NOT NULL,
  "proposed_value" jsonb NOT NULL,
  "base_value" jsonb NOT NULL,
  "base_version" timestamptz NOT NULL,
  "reason" text NOT NULL,
  "source" text NOT NULL DEFAULT 'owner_assistant',
  "source_ref" text,
  "preview" text,
  "status" text NOT NULL DEFAULT 'proposed',
  "model" text,
  "author" text NOT NULL DEFAULT 'assistant',
  "reviewed_at" timestamptz,
  "applied_at" timestamptz,
  "applied_version" timestamptz,
  "application_result" jsonb,
  "idempotency_key" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "profile_change_proposals_business_idx" ON "profile_change_proposals" ("business_id","status");
CREATE UNIQUE INDEX IF NOT EXISTS "profile_change_proposals_idempotency_idx" ON "profile_change_proposals" ("business_id","idempotency_key");
CREATE TABLE IF NOT EXISTS "resource_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" integer NOT NULL,
  "kind" text NOT NULL,
  "purpose" text NOT NULL,
  "request" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "source" text NOT NULL DEFAULT 'owner_assistant',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "resource_requests_business_idx" ON "resource_requests" ("business_id","status");
CREATE TABLE IF NOT EXISTS "resource_library" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" integer NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "kind" text NOT NULL,
  "purpose" text NOT NULL,
  "visibility" text NOT NULL DEFAULT 'private',
  "status" text NOT NULL DEFAULT 'draft',
  "url" text,
  "object_path" text,
  "content" text,
  "mime_type" text,
  "valid_from" timestamptz,
  "valid_until" timestamptz,
  "approved_at" timestamptz,
  "approved_by" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "resource_library_business_idx" ON "resource_library" ("business_id","status","visibility");
CREATE TABLE IF NOT EXISTS "resource_uploads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" integer NOT NULL,
  "object_path" text NOT NULL,
  "mime_type" text NOT NULL,
  "original_name" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "claimed_resource_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "resource_uploads_object_path_idx" ON "resource_uploads" ("object_path");
CREATE INDEX IF NOT EXISTS "resource_uploads_business_idx" ON "resource_uploads" ("business_id","claimed_resource_id");
CREATE TABLE IF NOT EXISTS "resource_delivery_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" integer NOT NULL,
  "resource_id" uuid NOT NULL,
  "lead_id" uuid NOT NULL,
  "purpose" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "result" text NOT NULL DEFAULT 'delivered',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "resource_delivery_idempotency_idx" ON "resource_delivery_audit" ("business_id","idempotency_key");
CREATE INDEX IF NOT EXISTS "resource_delivery_lead_idx" ON "resource_delivery_audit" ("business_id","lead_id");
CREATE TABLE IF NOT EXISTS "profile_improvement_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" integer NOT NULL,
  "proposal_id" uuid NOT NULL,
  "action" text NOT NULL,
  "before_value" jsonb NOT NULL,
  "after_value" jsonb NOT NULL,
  "model" text,
  "author" text NOT NULL,
  "result" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "profile_improvement_audit_business_idx" ON "profile_improvement_audit" ("business_id","created_at");