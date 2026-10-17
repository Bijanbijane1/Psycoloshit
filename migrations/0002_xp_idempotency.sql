-- Migration: 0002_xp_idempotency.sql
-- Project: PsychoMaster (روان‌لینگو)
-- Purpose: Add idempotency_key to xp_ledger and enforce per-user event uniqueness.

-- 1. Add nullable idempotency_key column to xp_ledger
-- Preserves all existing historical ledger rows with NULL values.
ALTER TABLE xp_ledger ADD COLUMN idempotency_key TEXT;

-- 2. Create unique index on (user_id, idempotency_key) for non-null keys
-- Guarantees event-level idempotency per user while keeping historical NULL entries valid.
CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_ledger_user_idempotency
ON xp_ledger(user_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;
