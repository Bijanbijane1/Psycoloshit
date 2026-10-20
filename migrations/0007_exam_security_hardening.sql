-- Migration: 0007_exam_security_hardening.sql
-- Project: PsychoMaster (روان‌لینگو) - Phase 10B.2
-- Purpose: Dedicated server-only entrance exam question bank table (exam_question_bank)
--          isolated from the public conceptual question_bank table.
-- Compatibility: SQLite 3 / Cloudflare D1

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
