-- Migration: add personalised handle to users table
-- Applied: 2026-07-25
-- Run with: psql $DATABASE_URL -f lib/db/migrations/0001_add_user_handle.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS handle TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_handle_unique ON users (handle);
