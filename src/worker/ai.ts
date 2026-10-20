/**
 * Cloudflare Worker AI Mentor, Adaptive Plan, Two-Tier D1 Caching, and Question Generation
 * Project: PsychoMaster (روان‌لینگو) - Phase 6D.1
 *
 * Security & Reliability Hardening:
 * - Two-tier AI Mentor response cache: L1 isolate memory + L2 D1 (`ai_response_cache`)
 *   so repeat questions across Worker isolates or after cold starts never trigger duplicate
 *   billable Gemini API calls.
 * - Strict prompt length and payload caps (`MAX_AI_QUESTION_LENGTH = 1000`) to prevent
 *   unbounded token-consumption attacks.
 * - Cross-origin request validation (`validateRequestOrigin`) on billable POST endpoints.
 */

import { GoogleGenAI } from '@google/genai';
import type { D1Database, Env, WorkerAiClient } from './types.ts';
import { D1QuestionRepository } from './db/questionRepository.ts';
import { validateRequestOrigin } from './auth.ts';

export const MAX_AI_QUESTION_LENGTH = 1000;
export const MAX_AI_CONTEXT_LENGTH = 200;
export const MAX_WEAK_CHAPTERS_COUNT = 20;
export const MAX_AI_REQUEST_BYTES = 16_384; // 16 KB hard payload ceiling on AI & generation endpoints
export const MAX_AI_GENERATED_QUESTIONS = 500; // Upper bound on AI-generated rows in question_bank

interface WorkerCacheEntry {
  response: string;
  timestamp: number;
  hitCount: number;
  source: 'gemini' | 'offline-knowledge';
}

interface D1AiCacheRow {
  cache_key: string;
  question: string;
  context: string;
  response: string;
  source: 'gemini' | 'offline-knowledge';
  hit_count: number;
  expires_at: number;
}

const initializedAiCacheDbs = new WeakSet<D1Database>();

async function ensureAiCacheTable(db: D1Database): Promise<void> {
  if (initializedAiCacheDbs.has(db)) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ai_response_cache (
        cache_key TEXT PRIMARY KEY NOT NULL,
        question TEXT NOT NULL,
        context TEXT NOT NULL DEFAULT '',
        response TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'gemini',
        hit_count INTEGER NOT NULL DEFAULT 1,
        expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    )
    .run();
  initializedAiCacheDbs.add(db);
}

async function parseBoundedJsonBody(
  request: Request,
  maxBytes: number = MAX_AI_REQUEST_BYTES
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string }
> {
  const contentLengthHeader = request.headers.get('Content-Length') || request.headers.get('content-length');
  if (contentLengthHeader) {
    const declaredBytes = Number(contentLengthHeader);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      return {
        ok: false,
        status: 413,
        error: `حجم درخواست بیش از حد مجاز (${maxBytes} بایت) است.`,
      };
    }
  }

  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return {
      ok: false,
      status: 400,
      error: 'ساختار درخواست نامعتبر است.',
    };
  }

  const byteLength = new TextEncoder().encode(rawText).byteLength;
  if (byteLength > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `حجم درخواست بیش از حد مجاز (${maxBytes} بایت) است.`,
    };
  }

  try {
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        status: 400,
        error: 'ساختار درخواست نامعتبر است.',
      };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      status: 400,
      error: 'ساختار درخواست نامعتبر است.',
    };
  }
}

class WorkerAICacheManager {
  private cache = new Map<string, WorkerCacheEntry>();
  private readonly ttlMs: number;
  private totalHits = 0;
  private totalMisses = 0;

  constructor(ttlHours = 24) {
    this.ttlMs = ttlHours * 60 * 60 * 1000;
  }

  public normalizeKey(question: string, context: string = ''): string {
    const cleanQ = (question || '')
      .trim()
      .toLowerCase()
      .replace(/[ي]/g, 'ی')
      .replace(/[ك]/g, 'ک')
      .replace(/[؟?!\.,،؛;\-_]/g, '')
      .replace(/\s+/g, ' ');

    const cleanC = (context || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return `${cleanC}:::${cleanQ}`;
  }

  private pruneExpired(now: number): void {
    if (this.cache.size < 100) return;
    for (const [k, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(k);
      }
    }
  }

  public get(question: string, context = ''): { response: string; hitCount: number } | null {
    const now = Date.now();
    this.pruneExpired(now);

    const key = this.normalizeKey(question, context);
    const entry = this.cache.get(key);

    if (!entry) {
      this.totalMisses++;
      return null;
    }

    if (now - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.totalMisses++;
      return null;
    }

    entry.hitCount++;
    this.totalHits++;
    return { response: entry.response, hitCount: entry.hitCount };
  }

  /**
   * Deterministic cleanup of expired rows in D1 `ai_response_cache`.
   */
  public async pruneExpiredD1(db: D1Database, now: number = Date.now()): Promise<number> {
    await ensureAiCacheTable(db);
    const res = await db
      .prepare('DELETE FROM ai_response_cache WHERE expires_at <= ?')
      .bind(now)
      .run();
    return Number((res.meta as any)?.changes ?? 0);
  }

  /**
   * Two-tier cache lookup:
   * 1. Fast L1 in-memory check (0 D1 reads when warm on same isolate).
   * 2. L2 D1 lookup in `ai_response_cache` (prevents duplicate billable Gemini calls across isolates/restarts).
   */
  public async getWithD1(
    db: D1Database | undefined,
    question: string,
    context = ''
  ): Promise<{ response: string; hitCount: number } | null> {
    const now = Date.now();
    this.pruneExpired(now);

    const key = this.normalizeKey(question, context);
    const l1Entry = this.cache.get(key);
    if (l1Entry) {
      if (now - l1Entry.timestamp <= this.ttlMs) {
        l1Entry.hitCount++;
        this.totalHits++;
        if (db) {
          ensureAiCacheTable(db)
            .then(() =>
              db
                .prepare(
                  `UPDATE ai_response_cache
                   SET hit_count = ?, updated_at = datetime('now')
                   WHERE cache_key = ?`
                )
                .bind(l1Entry.hitCount, key)
                .run()
            )
            .catch(() => {});
        }
        return { response: l1Entry.response, hitCount: l1Entry.hitCount };
      }
      this.cache.delete(key);
    }

    if (db) {
      try {
        await ensureAiCacheTable(db);
        const d1Row = await db
          .prepare(
            `SELECT cache_key, question, context, response, source, hit_count, expires_at
             FROM ai_response_cache
             WHERE cache_key = ?`
          )
          .bind(key)
          .first<D1AiCacheRow>();

        if (d1Row) {
          if (Number(d1Row.expires_at) > now) {
            const nextHitCount = (Number(d1Row.hit_count) || 1) + 1;
            await db
              .prepare(
                `UPDATE ai_response_cache
                 SET hit_count = ?, updated_at = datetime('now')
                 WHERE cache_key = ?`
              )
              .bind(nextHitCount, key)
              .run();

            this.cache.set(key, {
              response: d1Row.response,
              timestamp: now,
              hitCount: nextHitCount,
              source: d1Row.source === 'offline-knowledge' ? 'offline-knowledge' : 'gemini',
            });
            this.totalHits++;
            return { response: d1Row.response, hitCount: nextHitCount };
          } else {
            // Remove expired row immediately upon lookup
            await db
              .prepare('DELETE FROM ai_response_cache WHERE cache_key = ?')
              .bind(key)
              .run()
              .catch(() => {});
          }
        }
      } catch (err) {
        console.error('D1 AI cache lookup error:', err);
      }
    }

    this.totalMisses++;
    return null;
  }

  public set(
    question: string,
    response: string,
    context = '',
    source: 'gemini' | 'offline-knowledge' = 'gemini'
  ): void {
    if (!question || !response) return;
    const now = Date.now();
    this.pruneExpired(now);
    const key = this.normalizeKey(question, context);
    this.cache.set(key, {
      response,
      timestamp: now,
      hitCount: 1,
      source,
    });
  }

  /**
   * Stores AI response in both L1 isolate memory and L2 D1 `ai_response_cache`.
   */
  public async setWithD1(
    db: D1Database | undefined,
    question: string,
    response: string,
    context = '',
    source: 'gemini' | 'offline-knowledge' = 'gemini'
  ): Promise<void> {
    if (!question || !response) return;
    this.set(question, response, context, source);

    if (!db) return;
    try {
      await ensureAiCacheTable(db);
      const now = Date.now();
      const expiresAt = now + this.ttlMs;
      const key = this.normalizeKey(question, context);

      await db
        .prepare('DELETE FROM ai_response_cache WHERE expires_at <= ?')
        .bind(now)
        .run()
        .catch(() => {});

      await db
        .prepare(
          `INSERT INTO ai_response_cache (
            cache_key, question, context, response, source, hit_count, expires_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
          ON CONFLICT(cache_key) DO UPDATE SET
            response = excluded.response,
            source = excluded.source,
            hit_count = 1,
            expires_at = excluded.expires_at,
            updated_at = datetime('now')`
        )
        .bind(key, question.slice(0, 1000), context.slice(0, 200), response, source, expiresAt)
        .run();
    } catch (err) {
      console.error('D1 AI cache write error:', err);
    }
  }

  public getStats() {
    return {
      cachedEntriesCount: this.cache.size,
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      hitRatio:
        this.totalHits + this.totalMisses > 0
          ? Math.round((this.totalHits / (this.totalHits + this.totalMisses)) * 100)
          : 0,
    };
  }

  /**
   * Clears ONLY L1 in-memory cache while preserving D1 `ai_response_cache` rows
   * (simulating a Worker isolate restart / new isolate).
   */
  public clearMemoryOnly(): void {
    this.cache.clear();
  }

  public clear(): void {
    this.cache.clear();
    this.totalHits = 0;
    this.totalMisses = 0;
  }
}

export const workerAiCache = new WorkerAICacheManager();

export function getMentorSystemInstruction(): string {
  return `شما یک استاد تمام و منتور ارشد روان‌شناسی آکادمیک (PsychoMaster Mentor) هستید. 
به پرسش‌های دانشجویان و داوطلبان درباره مفاهیم روان‌شناسی، مکاتب، سبب‌شناسی اختلالات، نظریه‌های رشد، روش تحقیق و نوروپسیکولوژی پاسخ می‌دهید.
قواعد پاسخگویی:
۱. پاسخ دقیق، مستند به منابع معتبر (مانند اتکینسون و هیلگارد، کاپلان و سادوک، دی‌اس‌ام ۵-TR، شولتز و نظریه‌های شخصیت).
۲. در صورت لزوم، تفاوت ظریف اصطلاحات گیج‌کننده (مانند OCPD در برابر OCD یا دپلاریزاسیون در برابر هایپرپلاریزاسیون) را با مثال‌های شهودی و ملموس تفکیک کن.
۳. ادبیات علمی، صمیمی، انگیزاننده و به زبان فارسی روان.
۴. در پایان، یک نکته کنکوری یا سوال تفکرانگیز کوتاه برای سنجش درک کاربر ارائه بده.`;
}

export function resolveWorkerAiClient(env: Env): WorkerAiClient | null {
  if (env.AI_CLIENT) {
    return env.AI_CLIENT;
  }

  const rawKey = (env.GEMINI_API_KEY || '').trim();
  if (!rawKey || rawKey === 'MY_GEMINI_API_KEY' || rawKey === 'YOUR_GEMINI_API_KEY') {
    return null;
  }

  const sdk = new GoogleGenAI({
    apiKey: rawKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  return {
    async generateText({ model, contents, systemInstruction, responseMimeType }) {
      const response = await sdk.models.generateContent({
        model,
        contents,
        config: {
          ...(systemInstruction ? { systemInstruction } : {}),
          ...(responseMimeType ? { responseMimeType } : {}),
        },
      });
      return response.text || '';
    },
    async *generateTextStream({ model, contents, systemInstruction }) {
      const responseStream = await sdk.models.generateContentStream({
        model,
        contents,
        config: {
          ...(systemInstruction ? { systemInstruction } : {}),
        },
      });
      for await (const chunk of responseStream) {
        yield { text: chunk.text || '' };
      }
    },
  };
}

export function isWorkerAiAvailable(env: Env): boolean {
  return resolveWorkerAiClient(env) !== null;
}

function checkAiEndpointOrigin(request: Request, env: Env): Response | null {
  const url = new URL(request.url);
  const originHeader = request.headers.get('Origin') || request.headers.get('origin');
  const refererHeader = request.headers.get('Referer') || request.headers.get('referer');
  const secFetchSiteHeader =
    request.headers.get('Sec-Fetch-Site') || request.headers.get('sec-fetch-site');

  if (
    !validateRequestOrigin(originHeader, [url.origin, env.APP_URL], {
      refererHeader,
      secFetchSiteHeader,
    })
  ) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Forbidden: Cross-origin AI request rejected' }),
      { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }
  return null;
}

function buildSseResponse(streamBody: ReadableStream<Uint8Array>): Response {
  return new Response(streamBody, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive',
    },
  });
}

function createSingleEventSseStream(payload: Record<string, unknown>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

export async function handleWorkerAiMentor(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Allow': 'POST',
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  const originRejection = checkAiEndpointOrigin(request, env);
  if (originRejection) return originRejection;

  const parsedBody = await parseBoundedJsonBody(request);
  if (!parsedBody.ok) {
    return new Response(
      JSON.stringify({ error: parsedBody.error }),
      { status: parsedBody.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }
  const body = parsedBody.body;

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) {
    return new Response(
      JSON.stringify({ error: 'سوال کاربر الزامی است.' }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }

  if (question.length > MAX_AI_QUESTION_LENGTH) {
    return new Response(
      JSON.stringify({ error: `طول پرسش بیش از حد مجاز (${MAX_AI_QUESTION_LENGTH} کاراکتر) است.` }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }

  const chapterTitle =
    typeof body.chapterTitle === 'string' ? body.chapterTitle.trim().slice(0, MAX_AI_CONTEXT_LENGTH) : '';
  const chapterContext =
    typeof body.chapterContext === 'string' ? body.chapterContext.trim().slice(0, MAX_AI_CONTEXT_LENGTH) : '';
  const sectionTitle =
    typeof body.sectionTitle === 'string' && body.sectionTitle.trim()
      ? body.sectionTitle.trim().slice(0, MAX_AI_CONTEXT_LENGTH)
      : 'عمومی';
  const userLevel =
    typeof body.userLevel === 'string' && body.userLevel.trim()
      ? body.userLevel.trim().slice(0, 64)
      : 'متوسط';
  const context = chapterTitle || chapterContext || 'کلیات روان‌شناسی';

  const cached = await workerAiCache.getWithD1(env.DB, question, context);
  if (cached) {
    return new Response(
      JSON.stringify({
        reply: cached.response,
        source: 'cache',
        hitCount: cached.hitCount,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }

  const aiClient = resolveWorkerAiClient(env);
  if (!aiClient) {
    return new Response(
      JSON.stringify({
        reply: `پاسخ آفلاین پایگاه دانش: درباره "${question}"، مبحث مربوطه در سرفصل "${context}" به دقت در متون آکادمیک و ساده کتابخانه تدوین شده است. پیشنهاد می‌شود بخش نکات کلیدی و مقایسه مفاهیم را در کتابخانه مرور فرمایید.`,
        source: 'offline-fallback',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const prompt = `دانشجو در حال مطالعه سرفصل زیر است:
- بخش: ${sectionTitle}
- مبحث/فصل: ${context}
- سطح علمی کاربر: ${userLevel}

پرسش یا اشکال دانشجو:
"${question}"

لطفاً به جامع‌ترین و شیواترین شکل ممکن پاسخ دهید و اشکال او را برطرف کنید.`;

    const replyText = await aiClient.generateText({
      model: 'gemini-3.8-flash',
      contents: prompt,
      systemInstruction: getMentorSystemInstruction(),
    });

    const reply = replyText || 'پاسخی دریافت نشد.';
    await workerAiCache.setWithD1(env.DB, question, reply, context, 'gemini');

    return new Response(
      JSON.stringify({
        reply,
        source: 'gemini',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('Worker AI mentor error:', err);
    return new Response(
      JSON.stringify({
        error: 'خطا در برقراری ارتباط با منتور هوش مصنوعی',
        fallback: 'سیستم در حال حاضر به پاسخ‌گوی آفلاین سوئیچ کرد. می‌توانید متن ساده کتاب را مطالعه کنید.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }
}

export async function handleWorkerAiMentorStream(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Allow': 'POST',
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  const originRejection = checkAiEndpointOrigin(request, env);
  if (originRejection) return originRejection;

  const parsedBody = await parseBoundedJsonBody(request);
  if (!parsedBody.ok) {
    return new Response(
      JSON.stringify({ error: parsedBody.error }),
      { status: parsedBody.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }
  const body = parsedBody.body;

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) {
    return new Response(
      JSON.stringify({ error: 'سوال کاربر الزامی است.' }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }

  if (question.length > MAX_AI_QUESTION_LENGTH) {
    return new Response(
      JSON.stringify({ error: `طول پرسش بیش از حد مجاز (${MAX_AI_QUESTION_LENGTH} کاراکتر) است.` }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }

  const chapterTitle =
    typeof body.chapterTitle === 'string' ? body.chapterTitle.trim().slice(0, MAX_AI_CONTEXT_LENGTH) : '';
  const chapterContext =
    typeof body.chapterContext === 'string' ? body.chapterContext.trim().slice(0, MAX_AI_CONTEXT_LENGTH) : '';
  const sectionTitle =
    typeof body.sectionTitle === 'string' && body.sectionTitle.trim()
      ? body.sectionTitle.trim().slice(0, MAX_AI_CONTEXT_LENGTH)
      : 'عمومی';
  const userLevel =
    typeof body.userLevel === 'string' && body.userLevel.trim()
      ? body.userLevel.trim().slice(0, 64)
      : 'متوسط';
  const context = chapterTitle || chapterContext || 'کلیات روان‌شناسی آکادمیک';

  const cached = await workerAiCache.getWithD1(env.DB, question, context);
  if (cached) {
    return buildSseResponse(createSingleEventSseStream({ text: cached.response, cached: true }));
  }

  const aiClient = resolveWorkerAiClient(env);
  if (!aiClient) {
    const fallbackText = `پاسخ آفلاین پایگاه دانش: درباره "${question}"، مبحث مربوطه در سرفصل "${context}" به دقت در متون آکادمیک و ساده کتابخانه تدوین شده است. پیشنهاد می‌شود بخش نکات کلیدی و مقایسه مفاهیم را در کتابخانه مرور فرمایید.`;
    return buildSseResponse(createSingleEventSseStream({ text: fallbackText, offline: true }));
  }

  const prompt = `دانشجو در حال مطالعه سرفصل زیر است:
- بخش: ${sectionTitle}
- مبحث/فصل: ${context}
- سطح علمی کاربر: ${userLevel}

پرسش یا اشکال دانشجو:
"${question}"

لطفاً به جامع‌ترین و شیواترین شکل ممکن پاسخ دهید و اشکال او را برطرف کنید.`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let fullText = '';
        if (aiClient.generateTextStream) {
          const responseStream = aiClient.generateTextStream({
            model: 'gemini-3.8-flash',
            contents: prompt,
            systemInstruction: getMentorSystemInstruction(),
          });
          for await (const chunk of responseStream) {
            const text = chunk.text || '';
            if (text) {
              fullText += text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }
        } else {
          const text = await aiClient.generateText({
            model: 'gemini-3.8-flash',
            contents: prompt,
            systemInstruction: getMentorSystemInstruction(),
          });
          fullText = text || '';
          if (fullText) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: fullText })}\n\n`));
          }
        }

        if (fullText) {
          await workerAiCache.setWithD1(env.DB, question, fullText, context, 'gemini');
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        console.error('Worker streaming mentor error:', err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              error: 'خطا در ارتباط زنده با هوش مصنوعی. سیستم به پاسخ آفلاین سوئیچ کرد.',
            })}\n\n`
          )
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return buildSseResponse(stream);
}

export async function handleWorkerAiAdaptivePlan(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Allow': 'POST',
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  const originRejection = checkAiEndpointOrigin(request, env);
  if (originRejection) return originRejection;

  const parsedBody = await parseBoundedJsonBody(request);
  if (!parsedBody.ok) {
    return new Response(
      JSON.stringify({ error: parsedBody.error }),
      { status: parsedBody.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }
  const body = parsedBody.body;

  const stats =
    body.stats && typeof body.stats === 'object'
      ? (body.stats as Record<string, unknown>)
      : {};
  const weakChapters = Array.isArray(body.weakChapters)
    ? body.weakChapters
        .filter((item): item is string => typeof item === 'string')
        .slice(0, MAX_WEAK_CHAPTERS_COUNT)
        .map((c) => c.trim().slice(0, 120))
    : [];

  const aiClient = resolveWorkerAiClient(env);
  if (!aiClient) {
    return new Response(
      JSON.stringify({
        plan: 'برنامه مطالعه پیشنهادی بر اساس الگوهای یادگیری: پیشنهاد می‌شود ۳۰ دقیقه روی فصول با تسلط زیر ۶۰٪ متمرکز شوید، ابتدا متن ساده و سپس سوالات تشریحی بالینی را حل نمایید.',
        levelRecommendation: 'متوسط رو به پیشرفته',
        source: 'offline-fallback',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const overallMastery = Math.max(0, Math.min(100, Number(stats.overallMastery) || 50));
    const correctCount = Math.max(0, Math.min(100000, Math.trunc(Number(stats.correctCount) || 0)));
    const incorrectCount = Math.max(0, Math.min(100000, Math.trunc(Number(stats.incorrectCount) || 0)));

    const prompt = `با توجه به کارنامه تحصیلی زیر از کاربر در سامانه آموزش روان‌شناسی:
- درصد کلی تسلط: ${overallMastery}%
- تعداد پاسخ‌های درست: ${correctCount}
- تعداد پاسخ‌های نادرست: ${incorrectCount}
- فصول نیازمند تقویت: ${JSON.stringify(weakChapters)}

لطفاً در ۳ بخش کوتاه و کاربردی به زبان فارسی تحلیل و راهکار بده:
۱. تحلیل سرعت و دقت یادگیری
۲. سطح دشواری پیشنهادی برای مرحله بعد (آسان، استاندارد، پیشرفته و چرایی آن)
۳. نقشه راه اختصاصی ۳ روز آینده برای تسلط کامل`;

    const planText = await aiClient.generateText({
      model: 'gemini-3.8-flash',
      contents: prompt,
      systemInstruction:
        'شما مشاور تحصیلی تخصصی دکتری روان‌شناسی هستید که برنامه‌های مطالعه تطبیقی تنظیم می‌کنید.',
    });

    return new Response(
      JSON.stringify({
        plan: planText || 'پیشنهاد می‌کنیم فصول دارای خطای پرتکرار را مجدداً با سوییچ به حالت متن ساده مرور فرمایید.',
        source: 'gemini',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('Worker adaptive plan error:', err);
    return new Response(
      JSON.stringify({
        plan: 'پیشنهاد می‌کنیم فصول دارای خطای پرتکرار را مجدداً با سوییچ به حالت متن ساده مرور فرمایید.',
        source: 'offline-fallback',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }
}

export async function handleWorkerQuizBankGenerate(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Allow': 'POST',
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  const originRejection = checkAiEndpointOrigin(request, env);
  if (originRejection) return originRejection;

  if (!env.DB) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Database service is unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }

  const aiClient = resolveWorkerAiClient(env);
  if (!aiClient) {
    return new Response(
      JSON.stringify({ ok: false, error: 'سرویس هوش مصنوعی برای تولید سوال فعال نیست.' }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }

  const parsedBody = await parseBoundedJsonBody(request);
  if (!parsedBody.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: parsedBody.error }),
      { status: parsedBody.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }
  const body = parsedBody.body;

  const rawChapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : '';
  const rawChapterTitle = typeof body.chapterTitle === 'string' ? body.chapterTitle.trim() : '';

  if (rawChapterId.length > 64 || rawChapterTitle.length > MAX_AI_CONTEXT_LENGTH) {
    return new Response(
      JSON.stringify({ ok: false, error: 'طول شناسه یا عنوان فصل بیش از حد مجاز است.' }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }

  const chapterId = rawChapterId || 'general';
  const chapterTitle = rawChapterTitle || 'عمومی';
  const difficulty =
    typeof body.difficulty === 'string' && body.difficulty.trim()
      ? body.difficulty.trim()
      : 'medium';

  if (difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard') {
    return new Response(
      JSON.stringify({ ok: false, error: 'سطح دشواری نامعتبر است (easy, medium, hard).' }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }

  const qRepo = new D1QuestionRepository(env.DB);
  const currentTotal = await qRepo.getTotalCount();
  if (currentTotal >= MAX_AI_GENERATED_QUESTIONS) {
    return new Response(
      JSON.stringify({ ok: false, error: 'ظرفیت بانک سوالات تولیدشده به سقف مجاز رسیده است.' }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const prompt = `برای سرفصل روان‌شناسی "${chapterTitle}" با سطح دشواری "${difficulty}"، یک سوال چهارگزینه‌ای مفهومی کنکوری جدید با این ساختار JSON تولید کن:
{
  "question": "متن سوال با جزئیات دقیق علمی",
  "options": ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
  "correctIndex": 0,
  "explanation": "تحلیل تشریحی درستی این گزینه و رد سایر گزینه‌ها"
}`;

    const rawJson = await aiClient.generateText({
      model: 'gemini-3.8-flash',
      contents: prompt,
      responseMimeType: 'application/json',
    });

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawJson || '{}') as Record<string, unknown>;
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: 'ساختار سوال نامعتبر بود.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
      );
    }

    if (
      typeof parsed.question !== 'string' ||
      !parsed.question.trim() ||
      parsed.question.trim().length > 600 ||
      !Array.isArray(parsed.options) ||
      parsed.options.length !== 4 ||
      !parsed.options.every(
        (opt) => typeof opt === 'string' && opt.trim().length > 0 && opt.trim().length <= 300
      ) ||
      typeof parsed.correctIndex !== 'number' ||
      !Number.isInteger(parsed.correctIndex) ||
      parsed.correctIndex < 0 ||
      parsed.correctIndex > 3 ||
      typeof parsed.explanation !== 'string' ||
      !parsed.explanation.trim() ||
      parsed.explanation.trim().length > 1500
    ) {
      return new Response(
        JSON.stringify({ ok: false, error: 'ساختار سوال نامعتبر بود.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
      );
    }

    const saved = await qRepo.addQuestion({
      chapterId,
      chapterTitle,
      difficulty,
      question: parsed.question,
      options: parsed.options as string[],
      correctIndex: parsed.correctIndex,
      explanation: parsed.explanation,
      source: 'ai-generated',
    });

    return new Response(
      JSON.stringify({ success: true, question: saved }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('Worker question generation error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: 'خطا در تولید سوال تعاملی.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }
}
