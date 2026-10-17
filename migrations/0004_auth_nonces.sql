-- Migration: 0004_auth_nonces.sql
-- Project: PsychoMaster (روان‌لینگو)
-- Purpose: Add persistent single-use OAuth nonce challenge table to prevent nonce forgery and replay attacks.

CREATE TABLE IF NOT EXISTS auth_nonces (
    nonce_hash TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires
ON auth_nonces(expires_at);
