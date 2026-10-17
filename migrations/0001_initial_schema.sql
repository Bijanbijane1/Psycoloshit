-- Migration: 0001_initial_schema.sql
-- Project: PsychoMaster (روان‌لینگو)
-- Purpose: Initial Cloudflare D1 schema for persistent users, XP ledger, and question bank.
-- Compatibility: SQLite 3 / Cloudflare D1

-- 1. Users table (mirrors SyncedUserProfile domain model)
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '🦉',
  xp INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 1,
  total_study_minutes INTEGER NOT NULL DEFAULT 0,
  completed_chapters TEXT NOT NULL DEFAULT '[]', -- JSON array of chapter IDs
  completed_stages TEXT NOT NULL DEFAULT '{}',   -- JSON object of stage records
  unlocked_badge_ids TEXT NOT NULL DEFAULT '[]', -- JSON array of badge IDs
  bookmarked_chapters TEXT NOT NULL DEFAULT '[]',-- JSON array of chapter IDs
  last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. XP Ledger table (atomic audit trail for XP gains and anti-abuse validation)
CREATE TABLE IF NOT EXISTS xp_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT 'stage_completion',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Question Bank table (curated & AI-generated academic questions)
CREATE TABLE IF NOT EXISTS question_bank (
  id TEXT PRIMARY KEY NOT NULL,
  chapter_id TEXT NOT NULL,
  chapter_title TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  question TEXT NOT NULL,
  options TEXT NOT NULL,                         -- JSON array of option strings
  correct_index INTEGER NOT NULL,
  explanation TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'academic-curated' CHECK (source IN ('academic-curated', 'ai-generated')),
  times_answered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 4. High-performance indexes
CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_synced ON users(last_synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_xp_ledger_user ON xp_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_bank_chapter ON question_bank(chapter_id, difficulty);
