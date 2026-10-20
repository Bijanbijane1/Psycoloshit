-- Schema Reference Snapshot: src/worker/db/schema.sql
-- Project: PsychoMaster (روان‌لینگو)
-- Purpose: Current cumulative schema reference snapshot for Cloudflare D1 (psychomaster-db).
-- NOTE: For sequential migrations, refer to the canonical migrations in /migrations/ directory.

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '🦉',
  xp INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 1,
  total_study_minutes INTEGER NOT NULL DEFAULT 0,
  completed_chapters TEXT NOT NULL DEFAULT '[]',
  completed_stages TEXT NOT NULL DEFAULT '{}',
  unlocked_badge_ids TEXT NOT NULL DEFAULT '[]',
  bookmarked_chapters TEXT NOT NULL DEFAULT '[]',
  email TEXT,
  google_id TEXT,
  picture TEXT,
  last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS xp_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT 'stage_completion',
  idempotency_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS question_bank (
  id TEXT PRIMARY KEY NOT NULL,
  chapter_id TEXT NOT NULL,
  chapter_title TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  explanation TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'academic-curated' CHECK (source IN ('academic-curated', 'ai-generated')),
  times_answered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_synced ON users(last_synced_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

-- 5. Single-Use OAuth Nonce Challenges Table (Migration 0004)
CREATE TABLE IF NOT EXISTS auth_nonces (
    nonce_hash TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires
ON auth_nonces(expires_at);

CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_xp_ledger_user ON xp_ledger(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_ledger_user_idempotency ON xp_ledger(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_question_bank_chapter ON question_bank(chapter_id, difficulty);

-- 6. Operational Security & Persistence Tables (Migration 0005)
CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket_key TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL DEFAULT 'ai',
  count INTEGER NOT NULL DEFAULT 1,
  reset_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset ON api_rate_limits(reset_at);

CREATE TABLE IF NOT EXISTS ai_response_cache (
  cache_key TEXT PRIMARY KEY NOT NULL,
  question TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  response TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'gemini',
  hit_count INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_response_cache_expires ON ai_response_cache(expires_at);

CREATE TABLE IF NOT EXISTS analytics_daily (
  date TEXT PRIMARY KEY NOT NULL,
  visits INTEGER NOT NULL DEFAULT 0,
  unique_visitors TEXT NOT NULL DEFAULT '[]',
  page_views TEXT NOT NULL DEFAULT '{}',
  device_counts TEXT NOT NULL DEFAULT '{}',
  browser_counts TEXT NOT NULL DEFAULT '{}',
  hourly_counts TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY NOT NULL,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  path TEXT NOT NULL,
  device TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events(timestamp DESC);

-- 7. Entrance Exam Simulator Tables (Migration 0006)
CREATE TABLE IF NOT EXISTS exam_blueprints (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('diagnostic', 'subject', 'comprehensive', 'timed_drill')),
  duration_minutes INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  negative_marking INTEGER NOT NULL DEFAULT 1,
  negative_weight REAL NOT NULL DEFAULT 0.3333,
  sections_json TEXT NOT NULL DEFAULT '[]',
  is_published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exam_blueprints_published
ON exam_blueprints(is_published, exam_type);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  blueprint_id TEXT NOT NULL REFERENCES exam_blueprints(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'expired', 'abandoned')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  submitted_at TEXT,
  duration_seconds_used INTEGER NOT NULL DEFAULT 0,
  question_ids_json TEXT NOT NULL DEFAULT '[]',
  raw_score_percent REAL,
  weighted_score_percent REAL,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  unanswered_count INTEGER NOT NULL DEFAULT 0,
  section_breakdown_json TEXT NOT NULL DEFAULT '[]',
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_user_status
ON exam_attempts(user_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attempts_idempotency
ON exam_attempts(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS exam_attempt_answers (
  attempt_id TEXT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  section_id TEXT NOT NULL DEFAULT 'general',
  selected_index INTEGER,
  is_flagged INTEGER NOT NULL DEFAULT 0,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  is_correct INTEGER,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_attempt_answers_attempt
ON exam_attempt_answers(attempt_id);

-- 8. Dedicated Server-Only Entrance Exam Question Bank (Migration 0007)
CREATE TABLE IF NOT EXISTS exam_question_bank (
  id TEXT PRIMARY KEY NOT NULL,
  chapter_id TEXT NOT NULL,
  chapter_title TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  correct_index INTEGER NOT NULL CHECK (correct_index >= 0 AND correct_index <= 3),
  explanation TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'academic-curated' CHECK (source IN ('academic-curated', 'ai-generated')),
  times_answered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exam_question_bank_chapter
ON exam_question_bank(chapter_id, difficulty);
