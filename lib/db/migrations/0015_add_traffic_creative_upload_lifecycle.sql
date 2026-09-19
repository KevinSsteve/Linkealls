CREATE TABLE IF NOT EXISTS "traffic_creative_uploads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" integer NOT NULL,
  "business_slug" text NOT NULL,
  "object_path" text NOT NULL UNIQUE,
  "media_mime_type" text NOT NULL,
  "original_name" text NOT NULL,
  "size_bytes" bigint NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "expires_at" timestamp NOT NULL,
  "creative_id" uuid REFERENCES "traffic_creatives"("id"),
  "confirmed_at" timestamp,
  "cleanup_claimed_at" timestamp,
  "cleanup_attempts" integer NOT NULL DEFAULT 0,
  "last_cleanup_error" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "traffic_creative_uploads_cleanup_idx"
  ON "traffic_creative_uploads" ("status", "expires_at");
CREATE INDEX IF NOT EXISTS "traffic_creative_uploads_business_idx"
  ON "traffic_creative_uploads" ("business_id");