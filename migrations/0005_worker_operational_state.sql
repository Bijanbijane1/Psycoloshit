-- Migration: 0005_worker_operational_state.sql
-- Project: PsychoMaster (روان‌لینگو) - Phase 6D.1
-- Purpose: Persistent D1 tables for cross-isolate billable AI rate limiting,
--          L2 AI mentor response caching, and aggregated site analytics.

-- 1. Cross-isolate rate limit buckets for billable AI & question-generation endpoints
CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket_key TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL DEFAULT 'ai',
  count INTEGER NOT NULL DEFAULT 1,
  reset_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset
ON api_rate_limits(reset_at);

-- 2. Persistent L2 cache for AI Mentor responses to prevent duplicate billable calls across isolates
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

CREATE INDEX IF NOT EXISTS idx_ai_response_cache_expires
ON ai_response_cache(expires_at);

-- 3. Persistent daily aggregated site analytics (written on discrete /api/analytics/track events)
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

-- 4. Bounded sanitized recent events stream (no raw visitorId or referrer persisted)
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY NOT NULL,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  path TEXT NOT NULL,
  device TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp
ON analytics_events(timestamp DESC);
