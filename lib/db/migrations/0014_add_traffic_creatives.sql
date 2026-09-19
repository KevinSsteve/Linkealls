CREATE TABLE IF NOT EXISTS "traffic_creatives" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" integer NOT NULL,
  "description" text NOT NULL,
  "object_path" text NOT NULL,
  "media_mime_type" text NOT NULL,
  "media_type" text NOT NULL,
  "public_slug" text NOT NULL UNIQUE,
  "active" integer NOT NULL DEFAULT 1,
  "visit_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);