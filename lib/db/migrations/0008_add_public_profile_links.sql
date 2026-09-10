ALTER TABLE business_profiles
ADD COLUMN IF NOT EXISTS public_links jsonb NOT NULL DEFAULT '[]'::jsonb;