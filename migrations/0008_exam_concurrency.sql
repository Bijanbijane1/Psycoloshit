-- Migration: 0008_exam_concurrency.sql
-- Project: PsychoMaster (روان‌لینگو) - Phase 10B.4
-- Purpose: Add monotonic revision counter to exam_attempt_answers for reliable optimistic concurrency.
-- Compatibility: SQLite 3 / Cloudflare D1

ALTER TABLE exam_attempt_answers ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
