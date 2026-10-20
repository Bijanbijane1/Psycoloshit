-- Migration: 0006_entrance_exams.sql
-- Project: PsychoMaster (روان‌لینگو) - Phase 10B
-- Purpose: Advanced Entrance Exam Simulator tables (exam_blueprints, exam_attempts, exam_attempt_answers)
-- Compatibility: SQLite 3 / Cloudflare D1

-- 1. Exam Blueprints table (defines realistic psychology competitive exam structures)
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

-- 2. Exam Attempts table (tracks per-user timed exam sessions, scoring, and XP idempotency)
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

-- 3. Exam Attempt Answers table (persists per-question selected option, review flag, and time spent)
CREATE TABLE IF NOT EXISTS exam_attempt_answers (
  attempt_id TEXT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  section_id TEXT NOT NULL DEFAULT 'general',
  selected_index INTEGER,
  is_flagged INTEGER NOT NULL DEFAULT 0,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  is_correct INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_attempt_answers_attempt
ON exam_attempt_answers(attempt_id);
