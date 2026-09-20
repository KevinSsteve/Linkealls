ALTER TABLE "traffic_creatives"
  ADD COLUMN IF NOT EXISTS "preparation" jsonb,
  ADD COLUMN IF NOT EXISTS "preparation_version" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "preparation_source_hash" text,
  ADD COLUMN IF NOT EXISTS "prepared_at" timestamp;

CREATE INDEX IF NOT EXISTS "traffic_creatives_preparation_idx"
  ON "traffic_creatives" ("business_id", "id", "preparation_version");

-- A phone is stored only in leads.contact_phone after an explicit in-chat
-- request. Remove any legacy or caller-prefilled copies from public history.
UPDATE "leads"
SET "chat_messages" = (
  SELECT COALESCE(jsonb_agg(
    jsonb_set(
      item.message,
      '{text}',
      to_jsonb(regexp_replace(
        item.message->>'text',
        '(\+?244|00244)?[[:space:]().-]*9[1-5]([[:space:]().-]*[0-9]){7}',
        '[telefone omitido — requer autorização]',
        'g'
      ))
    )
    ORDER BY item.ordinality
  ), '[]'::jsonb)
  FROM jsonb_array_elements("leads"."chat_messages") WITH ORDINALITY AS item(message, ordinality)
)
WHERE "chat_messages"::text ~ '(\+?244|00244)?[[:space:]().-]*9[1-5]([[:space:]().-]*[0-9]){7}';