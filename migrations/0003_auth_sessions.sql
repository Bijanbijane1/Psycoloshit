-- Migration: 0003_auth_sessions.sql
-- Project: PsychoMaster (روان‌لینگو)
-- Purpose: Add sessions table for opaque hashed tokens and authentication columns to users table.

-- 1. Create sessions table for opaque hashed tokens
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user_id, expires_at);

-- 2. Add authentication fields to users table (backward-compatible)
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN google_id TEXT;
ALTER TABLE users ADD COLUMN picture TEXT;

-- 3. Unique index on verified Google sub (google_id) & lookup index on email
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id
ON users(google_id)
WHERE google_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_email
ON users(email)
WHERE email IS NOT NULL;
