/**
 * Cloudflare Worker-Compatible Two-Tier Rate Limiter (Isolate Memory + D1 Persistence)
 * Project: PsychoMaster (روان‌لینگو) - Phase 6D.1
 *
 * Architecture:
 * - Tier 1 (In-Memory Isolate Filter): Fast, zero-D1-cost protection for all /api/* routes.
 *   Blocks active floods on the same isolate before touching D1.
 * - Tier 2 (D1-Backed Persistent Quota in `api_rate_limits`): Cross-isolate enforcement
 *   exclusively for billable AI endpoints (`/api/ai/*` and `/api/quiz/bank/generate`).
 *   Survives isolate restarts, cold starts, and multi-isolate routing without adding heavy
 *   database writes to high-frequency non-AI routes (e.g., `/api/analytics/ping` or `/api/leaderboard`).
 */

import type { D1Database, Env } from './types.ts';
import { extractBearerToken, extractGuestToken, hashSessionToken } from './auth.ts';

interface RateLimitBucket {
  count: number;
  resetTime: number;
}

interface D1RateLimitRow {
  bucket_key: string;
  scope: string;
  count: number;
  reset_at: number;
}

const MAX_TRACKED_KEYS = 5000;
const generalBuckets = new Map<string, RateLimitBucket>();
const aiBuckets = new Map<string, RateLimitBucket>();
const initializedRateLimitDbs = new WeakSet<D1Database>();

export const GENERAL_WINDOW_MS = 60_000;
export const GENERAL_MAX_REQUESTS = 150;
export const AI_WINDOW_MS = 60_000;
export const AI_MAX_REQUESTS = 35;

export const GENERAL_RATE_LIMIT_MESSAGE =
  'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً چند لحظه صبر کنید.';
export const AI_RATE_LIMIT_MESSAGE =
  'تعداد درخواست‌های هوش مصنوعی در این دقیقه به سقف مجاز رسید. لطفاً ۳۰ ثانیه دیگر تلاش فرمایید.';

function pruneExpiredBuckets(store: Map<string, RateLimitBucket>, now: number): void {
  if (store.size < 250) return;
  for (const [k, v] of store.entries()) {
    if (now > v.resetTime) {
      store.delete(k);
    }
  }
  if (store.size > MAX_TRACKED_KEYS) {
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) {
      store.delete(oldestKey);
    }
  }
}

/**
 * Extract canonical client rate-limit key.
 * Security hardening (Phase 6D.1):
 * - When `CF-Connecting-IP` is present, it is authoritative and MUST NOT be concatenated
 *   with client-spoofable headers (`X-Visitor-Id`, `X-Forwarded-For`, `X-RateLimit-Client`),
 *   preventing attackers from rotating visitor headers to mint unlimited buckets.
 */
export function extractClientRateLimitKey(request: Request): {
  key: string;
  hasExplicitClientIdentifier: boolean;
} {
  const cfIp = (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('cf-connecting-ip') ||
    ''
  ).trim();

  if (cfIp) {
    return {
      key: `ip:${cfIp.slice(0, 64)}`,
      hasExplicitClientIdentifier: true,
    };
  }

  const forwardedFor = (
    request.headers.get('X-Forwarded-For') ||
    request.headers.get('x-forwarded-for') ||
    ''
  )
    .split(',')[0]
    ?.trim();

  if (forwardedFor) {
    return {
      key: `xff:${forwardedFor.slice(0, 64)}`,
      hasExplicitClientIdentifier: true,
    };
  }

  const rateLimitClient = (
    request.headers.get('X-RateLimit-Client') ||
    request.headers.get('x-ratelimit-client') ||
    ''
  ).trim();

  if (rateLimitClient) {
    return {
      key: `client:${rateLimitClient.slice(0, 64)}`,
      hasExplicitClientIdentifier: true,
    };
  }

  const visitorId = (
    request.headers.get('X-Visitor-Id') ||
    request.headers.get('x-visitor-id') ||
    ''
  ).trim();

  if (visitorId) {
    return {
      key: `vis:${visitorId.slice(0, 64)}`,
      hasExplicitClientIdentifier: true,
    };
  }

  return {
    key: 'anonymous_local',
    hasExplicitClientIdentifier: false,
  };
}

function checkBucket(
  store: Map<string, RateLimitBucket>,
  key: string,
  windowMs: number,
  maxRequests: number,
  message: string,
  now: number
): { allowed: true } | { allowed: false; retryAfterSeconds: number; message: string } {
  pruneExpiredBuckets(store, now);

  const existing = store.get(key);
  if (!existing || now > existing.resetTime) {
    store.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return { allowed: true };
  }

  if (existing.count >= maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetTime - now) / 1000));
    return {
      allowed: false,
      retryAfterSeconds,
      message,
    };
  }

  existing.count += 1;
  return { allowed: true };
}

async function ensureRateLimitTable(db: D1Database): Promise<void> {
  if (initializedRateLimitDbs.has(db)) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS api_rate_limits (
        bucket_key TEXT PRIMARY KEY NOT NULL,
        scope TEXT NOT NULL DEFAULT 'ai',
        count INTEGER NOT NULL DEFAULT 1,
        reset_at INTEGER NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    .run();
  initializedRateLimitDbs.add(db);
}

async function checkAndIncrementD1Bucket(
  db: D1Database,
  bucketKey: string,
  scope: string,
  windowMs: number,
  maxRequests: number,
  now: number
): Promise<{ allowed: true; count: number; resetAt: number } | { allowed: false; retryAfterSeconds: number; resetAt: number }> {
  await ensureRateLimitTable(db);

  // Lazy cleanup of expired rows (~1 in 20 checks) to keep table compact without extra cron triggers
  if (Math.random() < 0.05) {
    await db
      .prepare('DELETE FROM api_rate_limits WHERE reset_at < ?')
      .bind(now - windowMs)
      .run()
      .catch(() => {});
  }

  const nextWindowResetAt = now + windowMs;

  // Single-statement atomic upsert: either initializes a new/expired window at count=1
  // or atomically increments the active window counter under SQLite's write lock.
  const atomicRow = await db
    .prepare(
      `INSERT INTO api_rate_limits (bucket_key, scope, count, reset_at, updated_at)
       VALUES (?, ?, 1, ?, datetime('now'))
       ON CONFLICT(bucket_key) DO UPDATE SET
         count = CASE WHEN api_rate_limits.reset_at < ? THEN 1 ELSE api_rate_limits.count + 1 END,
         reset_at = CASE WHEN api_rate_limits.reset_at < ? THEN excluded.reset_at ELSE api_rate_limits.reset_at END,
         updated_at = datetime('now')
       RETURNING count, reset_at`
    )
    .bind(bucketKey, scope, nextWindowResetAt, now, now)
    .first<{ count: number; reset_at: number }>();

  let currentCount = Number(atomicRow?.count) || 1;
  let resetAt = Number(atomicRow?.reset_at) || nextWindowResetAt;

  if (!atomicRow) {
    const fallbackRow = await db
      .prepare('SELECT count, reset_at FROM api_rate_limits WHERE bucket_key = ?')
      .bind(bucketKey)
      .first<{ count: number; reset_at: number }>();
    if (fallbackRow) {
      currentCount = Number(fallbackRow.count) || 1;
      resetAt = Number(fallbackRow.reset_at) || nextWindowResetAt;
    }
  }

  if (currentCount > maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
    return { allowed: false, retryAfterSeconds, resetAt };
  }

  return { allowed: true, count: currentCount, resetAt };
}

function buildRateLimitResponse(message: string, retryAfterSeconds: number): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: message,
      retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Retry-After': String(retryAfterSeconds),
      },
    }
  );
}

function buildRateLimitUnavailableResponse(): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      code: 'RATE_LIMIT_UNAVAILABLE',
      error:
        'سرویس محدودکننده نرخ درخواست در دسترس نیست. عملیات هوش مصنوعی به دلایل امنیتی متوقف شد.',
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  );
}

function hasLiveBillableAiConfigured(env?: Env): boolean {
  if (!env) return false;
  if (env.AI_CLIENT) return true;
  const rawKey = (env.GEMINI_API_KEY || '').trim();
  return Boolean(rawKey && rawKey !== 'MY_GEMINI_API_KEY' && rawKey !== 'YOUR_GEMINI_API_KEY');
}

export async function checkWorkerRateLimit(
  request: Request,
  pathname: string,
  env?: Env
): Promise<Response | null> {
  if (!pathname.startsWith('/api/')) {
    return null;
  }

  const { key, hasExplicitClientIdentifier } = extractClientRateLimitKey(request);
  const enforceStrictGeneral = Boolean(env?.ENFORCE_STRICT_RATE_LIMIT || hasExplicitClientIdentifier);
  const now = Date.now();

  // 1. Tier-1 In-Memory General API Rate Limit (zero D1 write overhead on general requests)
  const generalLimit = enforceStrictGeneral ? GENERAL_MAX_REQUESTS : 5000;
  const generalResult = checkBucket(
    generalBuckets,
    key,
    GENERAL_WINDOW_MS,
    generalLimit,
    GENERAL_RATE_LIMIT_MESSAGE,
    now
  );

  if (!generalResult.allowed) {
    return buildRateLimitResponse(generalResult.message, generalResult.retryAfterSeconds);
  }

  // 2. Billable AI Routes Protection (Tier-1 Isolate Memory + Tier-2 Persistent D1 Quota)
  const isAiRoute =
    pathname.startsWith('/api/ai/') || pathname === '/api/quiz/bank/generate';
  if (isAiRoute) {
    // Always enforce strict AI_MAX_REQUESTS on AI endpoints (never fall back to 1000 req/min)
    const aiLimit = AI_MAX_REQUESTS;

    // Tier-1 fast isolate check (rejects active single-isolate floods before touching D1)
    const aiMemoryResult = checkBucket(
      aiBuckets,
      key,
      AI_WINDOW_MS,
      aiLimit,
      AI_RATE_LIMIT_MESSAGE,
      now
    );

    if (!aiMemoryResult.allowed) {
      return buildRateLimitResponse(aiMemoryResult.message, aiMemoryResult.retryAfterSeconds);
    }

    // Fail closed if billable AI is configured or question generation is requested without D1 rate limiting
    if (!env?.DB) {
      if (hasLiveBillableAiConfigured(env) || pathname === '/api/quiz/bank/generate') {
        return buildRateLimitUnavailableResponse();
      }
      return null;
    }

    // Tier-2 persistent D1 check across isolates and cold starts
    try {
      const d1IpBucketKey = `ai:${key}`;
      const d1Result = await checkAndIncrementD1Bucket(
        env.DB,
        d1IpBucketKey,
        'ai',
        AI_WINDOW_MS,
        aiLimit,
        now
      );

      if (!d1Result.allowed) {
        // Synchronize local isolate memory with D1's blocked state so subsequent flood hits stop at Tier 1
        aiBuckets.set(key, {
          count: aiLimit,
          resetTime: d1Result.resetAt,
        });
        return buildRateLimitResponse(AI_RATE_LIMIT_MESSAGE, d1Result.retryAfterSeconds);
      }

      // Keep local isolate counter aligned with authoritative D1 count across isolates
      aiBuckets.set(key, {
        count: d1Result.count,
        resetTime: d1Result.resetAt,
      });

      // Also enforce per-session/account D1 bucket when a session token is present,
      // preventing an authenticated caller from bypassing AI quotas by rotating proxy IPs.
      const rawToken = extractBearerToken(request) || extractGuestToken(request);
      if (rawToken) {
        const tokenHash = await hashSessionToken(rawToken);
        const sessionBucketKey = `ai:sess:${tokenHash.slice(0, 32)}`;
        const sessionD1Result = await checkAndIncrementD1Bucket(
          env.DB,
          sessionBucketKey,
          'ai_session',
          AI_WINDOW_MS,
          aiLimit,
          now
        );
        if (!sessionD1Result.allowed) {
          return buildRateLimitResponse(AI_RATE_LIMIT_MESSAGE, sessionD1Result.retryAfterSeconds);
        }
      }
    } catch (err) {
      // Never silently disable D1 rate-limit protection for costly AI operations: fail closed with 503.
      console.error('D1 AI rate limit check error (failing closed):', err);
      return buildRateLimitUnavailableResponse();
    }
  }

  return null;
}

/**
 * Deterministic cleanup of expired D1 rate-limit buckets (`reset_at < now`).
 */
export async function pruneExpiredRateLimits(
  db: D1Database,
  now: number = Date.now()
): Promise<number> {
  await ensureRateLimitTable(db);
  const res = await db
    .prepare('DELETE FROM api_rate_limits WHERE reset_at < ?')
    .bind(now)
    .run();
  return Number((res.meta as any)?.changes ?? 0);
}

/**
 * Clears ONLY the isolate in-memory rate-limit maps (simulating a Worker isolate cold start
 * or routing to a fresh edge isolate) while preserving D1 `api_rate_limits` rows.
 */
export function clearWorkerInMemoryRateLimits(): void {
  generalBuckets.clear();
  aiBuckets.clear();
}

/**
 * Clears in-memory buckets and optionally resets D1 `api_rate_limits` rows for test isolation.
 */
export async function resetWorkerRateLimits(db?: D1Database): Promise<void> {
  generalBuckets.clear();
  aiBuckets.clear();
  if (db) {
    try {
      await ensureRateLimitTable(db);
      await db.prepare('DELETE FROM api_rate_limits').run();
    } catch {
      // Ignore if table not yet created
    }
  }
}
