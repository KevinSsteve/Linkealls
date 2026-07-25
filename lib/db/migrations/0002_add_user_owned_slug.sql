-- Migration: link user accounts to a business they own
-- Applied: 2026-07-25
-- Run with: psql $DATABASE_URL -f lib/db/migrations/0002_add_user_owned_slug.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS owned_slug TEXT;
