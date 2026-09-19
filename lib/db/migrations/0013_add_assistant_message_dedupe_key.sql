ALTER TABLE assistant_messages
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS assistant_messages_dedupe_key_unique
  ON assistant_messages (dedupe_key);