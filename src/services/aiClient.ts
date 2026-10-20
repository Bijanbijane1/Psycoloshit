/**
 * Frontend AI & SSE Streaming Client (Phase 7)
 * Synchronized with Phase 6G Worker AI Contracts (`src/worker/ai.ts`)
 */

import { toEnglishDigits } from '../utils/persianDigits';

export const MAX_AI_REQUEST_BODY_BYTES = 16_384;
export const CLIENT_MAX_UTF8_BYTES = 14_000;
export const MAX_AI_QUESTION_LENGTH = 2000;
export const MAX_AI_CONTEXT_LENGTH = 500;
export const MAX_AI_CHAPTER_ITEMS = 20;
export const MAX_QUIZ_CHAPTER_ID_LENGTH = 64;
export const MAX_QUIZ_CHAPTER_TITLE_LENGTH = 200;

export interface AiMentorRequestInput {
  question: string;
  chapterTitle?: string;
  chapterContext?: string;
  sectionTitle?: string;
  messages?: Array<{ role: string; content: string }>;
}

export interface BoundedAiMentorPayload {
  question: string;
  chapterTitle: string;
  chapterContext: string;
  sectionTitle: string;
  messages?: Array<{ role: string; content: string }>;
}

export interface AdaptivePlanRequestInput {
  stats?: Record<string, unknown>;
  weakChapters?: Array<{ id?: string; title: string; accuracy?: number } | string>;
  weakestChapters?: string[];
  strongestChapters?: string[];
  overallAccuracy?: number;
  completedCount?: number;
  totalChapters?: number;
  userQuestion?: string;
}

export interface BoundedAdaptivePlanPayload {
  stats?: Record<string, unknown>;
  weakChapters?: Array<{ id?: string; title: string; accuracy?: number }>;
  weakestChapters: string[];
  strongestChapters: string[];
  overallAccuracy: number;
  completedCount: number;
  totalChapters: number;
  userQuestion: string;
}

export interface QuizGenerationInput {
  chapterId?: string;
  chapterTitle?: string;
  topic?: string;
  difficulty?: 'easy' | 'medium' | 'hard' | 'basic' | 'intermediate' | 'advanced' | string;
  count?: number | string;
}

export interface SanitizedQuizGenerationPayload {
  chapterId: string;
  chapterTitle: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  count: number;
}

export type ValidationResult<T> =
  | { ok: true; payload: T; json: string; byteLength: number; wasTrimmed?: boolean }
  | { ok: false; error: string; byteLength: number };

const utf8Encoder = new TextEncoder();

/**
 * Computes exact UTF-8 byte length of any string (critical for 2-byte Persian characters).
 */
export function getUtf8ByteLength(text: string): number {
  return utf8Encoder.encode(text || '').length;
}

/**
 * Truncates a string so that its character count does not exceed `maxChars`
 * and its UTF-8 byte count does not exceed `maxBytes`.
 */
export function truncateUtf8Safe(
  text: string,
  maxChars: number,
  maxBytes: number = CLIENT_MAX_UTF8_BYTES
): string {
  const clean = (text || '').trim();
  if (!clean) return '';
  let sliced = clean.length > maxChars ? clean.slice(0, maxChars) : clean;
  while (sliced.length > 0 && getUtf8ByteLength(sliced) > maxBytes) {
    const excessRatio = maxBytes / Math.max(1, getUtf8ByteLength(sliced));
    const targetLen = Math.max(0, Math.floor(sliced.length * Math.min(0.9, excessRatio)) - 8);
    sliced = sliced.slice(0, targetLen);
  }
  return sliced.trim();
}

/**
 * Enforces a strict UTF-8 byte ceiling (default 14,000 bytes, strictly below the 16,384-byte server limit)
 * on any JSON-serializable AI request payload.
 * Progressively trims older chat messages, bulky context arrays, and long text fields.
 */
export function enforceMaxUtf8Bytes<T extends Record<string, any>>(
  payload: T,
  maxBytes: number = CLIENT_MAX_UTF8_BYTES
): { payload: T; json: string; byteLength: number; wasTrimmed: boolean } {
  const clone: Record<string, any> = JSON.parse(JSON.stringify(payload || {}));
  let wasTrimmed = false;

  const measure = () => {
    const json = JSON.stringify(clone);
    return { json, byteLength: utf8Encoder.encode(json).length };
  };

  let current = measure();
  if (current.byteLength <= maxBytes) {
    return { payload: clone as T, ...current, wasTrimmed };
  }

  // Step 1: Trim older chat messages/history from the front (keep most recent messages)
  for (const arrayKey of ['messages', 'history', 'chatHistory']) {
    if (Array.isArray(clone[arrayKey])) {
      while (clone[arrayKey].length > 1 && current.byteLength > maxBytes) {
        clone[arrayKey].shift();
        wasTrimmed = true;
        current = measure();
      }
      if (current.byteLength > maxBytes && clone[arrayKey].length === 1) {
        const item = clone[arrayKey][0];
        if (item && typeof item.content === 'string') {
          item.content = truncateUtf8Safe(item.content, 1000, Math.max(512, Math.floor(maxBytes / 3)));
          wasTrimmed = true;
          current = measure();
        }
      }
    }
  }

  // Step 2: Trim bulky context arrays (weakChapters, weakestChapters, strongestChapters, sections)
  for (const listKey of ['weakChapters', 'weakestChapters', 'strongestChapters', 'sections', 'items']) {
    if (Array.isArray(clone[listKey])) {
      if (clone[listKey].length > MAX_AI_CHAPTER_ITEMS) {
        clone[listKey] = clone[listKey].slice(0, MAX_AI_CHAPTER_ITEMS);
        wasTrimmed = true;
        current = measure();
      }
      while (clone[listKey].length > 2 && current.byteLength > maxBytes) {
        clone[listKey].pop();
        wasTrimmed = true;
        current = measure();
      }
    }
  }

  // Step 3: Trim secondary context strings first
  for (const textKey of ['chapterContext', 'context', 'sectionTitle', 'chapterTitle', 'description']) {
    if (typeof clone[textKey] === 'string' && current.byteLength > maxBytes) {
      clone[textKey] = truncateUtf8Safe(clone[textKey], MAX_AI_CONTEXT_LENGTH, 1024);
      wasTrimmed = true;
      current = measure();
    }
  }

  // Step 4: Trim primary question/prompt if still exceeding maxBytes
  for (const primaryKey of ['question', 'userQuestion', 'prompt', 'text']) {
    if (typeof clone[primaryKey] === 'string' && current.byteLength > maxBytes) {
      const overheadBytes = current.byteLength - getUtf8ByteLength(clone[primaryKey]);
      const availableBytes = Math.max(256, maxBytes - overheadBytes - 128);
      clone[primaryKey] = truncateUtf8Safe(
        clone[primaryKey],
        MAX_AI_QUESTION_LENGTH,
        availableBytes
      );
      wasTrimmed = true;
      current = measure();
    }
  }

  // Step 5: Final emergency pass over any remaining top-level string or array properties
  if (current.byteLength > maxBytes) {
    for (const key of Object.keys(clone)) {
      if (current.byteLength <= maxBytes) break;
      const val = clone[key];
      if (typeof val === 'string' && val.length > 64) {
        const budget = Math.max(128, Math.floor(maxBytes / 4));
        clone[key] = truncateUtf8Safe(val, budget, budget);
        wasTrimmed = true;
        current = measure();
      } else if (Array.isArray(val) && val.length > 0) {
        clone[key] = [];
        wasTrimmed = true;
        current = measure();
      }
    }
  }

  return { payload: clone as T, ...current, wasTrimmed };
}

/**
 * Sanitizes and bounds `/api/quiz/bank/generate` input:
 * - `chapterId` <= 64 chars (ASCII digits normalized)
 * - `chapterTitle` <= 200 chars
 * - `difficulty` in 'easy' | 'medium' | 'hard'
 * - `count` clamped 1..10
 */
export function sanitizeQuizGenerationInput(
  input: QuizGenerationInput
): SanitizedQuizGenerationPayload {
  const rawId = toEnglishDigits(String(input.chapterId || 'ch-1').trim());
  const chapterId = truncateUtf8Safe(rawId, MAX_QUIZ_CHAPTER_ID_LENGTH, 128);

  const rawTitle = String(input.chapterTitle || input.topic || '').trim();
  const chapterTitle = truncateUtf8Safe(rawTitle, MAX_QUIZ_CHAPTER_TITLE_LENGTH, 600);

  const rawTopic = String(input.topic || input.chapterTitle || '').trim();
  const topic = truncateUtf8Safe(rawTopic, MAX_QUIZ_CHAPTER_TITLE_LENGTH, 600);

  const diffMap: Record<string, 'easy' | 'medium' | 'hard'> = {
    easy: 'easy',
    basic: 'easy',
    medium: 'medium',
    intermediate: 'medium',
    hard: 'hard',
    advanced: 'hard',
  };
  const difficulty: 'easy' | 'medium' | 'hard' =
    diffMap[String(input.difficulty || '').toLowerCase()] || 'medium';

  const numericCount = Number(toEnglishDigits(String(input.count ?? 5)));
  const count = Number.isFinite(numericCount)
    ? Math.max(1, Math.min(10, Math.trunc(numericCount)))
    : 5;

  const bounded = enforceMaxUtf8Bytes(
    {
      chapterId,
      chapterTitle,
      topic,
      difficulty,
      count,
    },
    CLIENT_MAX_UTF8_BYTES
  );

  return bounded.payload;
}

/**
 * Validates and bounds an `/api/ai/mentor` or `/api/ai/mentor/stream` request payload
 * to strictly satisfy Phase 6G backend limits (`MAX_AI_QUESTION_LENGTH = 2000`,
 * `MAX_AI_CONTEXT_LENGTH = 500`, `CLIENT_MAX_UTF8_BYTES = 14_000` <= `16_384`).
 */
export function validateAndBoundMentorRequest(
  input: AiMentorRequestInput
): ValidationResult<BoundedAiMentorPayload> {
  const rawQuestion = typeof input.question === 'string' ? input.question.trim() : '';
  if (!rawQuestion) {
    return {
      ok: false,
      error: 'لطفاً متن پرسش خود را وارد نمایید.',
      byteLength: 0,
    };
  }

  if (rawQuestion.length > MAX_AI_QUESTION_LENGTH) {
    return {
      ok: false,
      error: 'متن ارسالی بیش از حد طولانی است. لطفاً پیام کوتاهتری ارسال کنید.',
      byteLength: getUtf8ByteLength(rawQuestion),
    };
  }

  const chapterContext = truncateUtf8Safe(input.chapterContext || '', MAX_AI_CONTEXT_LENGTH, 2048);
  const chapterTitle = truncateUtf8Safe(input.chapterTitle || '', MAX_AI_CONTEXT_LENGTH, 1024);
  const sectionTitle = truncateUtf8Safe(input.sectionTitle || '', MAX_AI_CONTEXT_LENGTH, 1024);

  const initialPayload: BoundedAiMentorPayload = {
    question: rawQuestion,
    chapterTitle,
    chapterContext,
    sectionTitle,
    ...(Array.isArray(input.messages) ? { messages: input.messages } : {}),
  };

  const bounded = enforceMaxUtf8Bytes(initialPayload, CLIENT_MAX_UTF8_BYTES);

  if (bounded.byteLength > MAX_AI_REQUEST_BODY_BYTES) {
    return {
      ok: false,
      error: 'متن ارسالی بیش از حد طولانی است. لطفاً پیام کوتاهتری ارسال کنید.',
      byteLength: bounded.byteLength,
    };
  }

  return {
    ok: true,
    payload: bounded.payload,
    json: bounded.json,
    byteLength: bounded.byteLength,
    wasTrimmed: bounded.wasTrimmed,
  };
}

/**
 * Validates and bounds an `/api/ai/adaptive-plan` request payload
 * to strictly satisfy Phase 6G backend limits (`<= 14,000` UTF-8 bytes).
 */
export function validateAndBoundAdaptivePlanRequest(
  input: AdaptivePlanRequestInput
): ValidationResult<BoundedAdaptivePlanPayload> {
  const rawUserQuestion = typeof input.userQuestion === 'string' ? input.userQuestion.trim() : '';
  if (rawUserQuestion.length > MAX_AI_CONTEXT_LENGTH) {
    return {
      ok: false,
      error: 'متن ارسالی بیش از حد طولانی است. لطفاً پیام کوتاهتری ارسال کنید.',
      byteLength: getUtf8ByteLength(rawUserQuestion),
    };
  }

  const sanitizeChapterList = (list?: string[]): string[] => {
    if (!Array.isArray(list)) return [];
    return list
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .slice(0, MAX_AI_CHAPTER_ITEMS)
      .map((item) => truncateUtf8Safe(item, MAX_AI_CONTEXT_LENGTH, 512));
  };

  const sanitizeWeakObjects = (
    list?: Array<{ id?: string; title: string; accuracy?: number } | string>
  ): Array<{ id?: string; title: string; accuracy?: number }> => {
    if (!Array.isArray(list)) return [];
    return list
      .slice(0, MAX_AI_CHAPTER_ITEMS)
      .map((item) => {
        if (typeof item === 'string') {
          return { title: truncateUtf8Safe(item, MAX_AI_CONTEXT_LENGTH, 512) };
        }
        if (item && typeof item === 'object' && typeof item.title === 'string') {
          return {
            ...(typeof item.id === 'string'
              ? { id: truncateUtf8Safe(toEnglishDigits(item.id), 64, 128) }
              : {}),
            title: truncateUtf8Safe(item.title, MAX_AI_CONTEXT_LENGTH, 512),
            ...(typeof item.accuracy === 'number'
              ? { accuracy: Math.max(0, Math.min(100, Math.round(item.accuracy))) }
              : {}),
          };
        }
        return null;
      })
      .filter((x): x is { id?: string; title: string; accuracy?: number } => x !== null && x.title.length > 0);
  };

  const initialPayload: BoundedAdaptivePlanPayload = {
    ...(input.stats && typeof input.stats === 'object' ? { stats: input.stats } : {}),
    ...(Array.isArray(input.weakChapters) ? { weakChapters: sanitizeWeakObjects(input.weakChapters) } : {}),
    weakestChapters: sanitizeChapterList(input.weakestChapters),
    strongestChapters: sanitizeChapterList(input.strongestChapters),
    overallAccuracy: Math.max(0, Math.min(100, Math.round(Number(input.overallAccuracy) || 0))),
    completedCount: Math.max(0, Math.min(500, Math.trunc(Number(input.completedCount) || 0))),
    totalChapters: Math.max(1, Math.min(500, Math.trunc(Number(input.totalChapters) || 1))),
    userQuestion: truncateUtf8Safe(rawUserQuestion, MAX_AI_CONTEXT_LENGTH, 1024),
  };

  const bounded = enforceMaxUtf8Bytes(initialPayload, CLIENT_MAX_UTF8_BYTES);

  if (bounded.byteLength > MAX_AI_REQUEST_BODY_BYTES) {
    return {
      ok: false,
      error: 'متن ارسالی بیش از حد طولانی است. لطفاً پیام کوتاهتری ارسال کنید.',
      byteLength: bounded.byteLength,
    };
  }

  return {
    ok: true,
    payload: bounded.payload,
    json: bounded.json,
    byteLength: bounded.byteLength,
    wasTrimmed: bounded.wasTrimmed,
  };
}

/**
 * Translates HTTP status codes (401, 413, 429, 503) from Phase 6G AI endpoints
 * into polite, user-friendly Persian error messages.
 */
export function formatAiHttpErrorMessage(
  status: number,
  serverMessage?: string,
  retryAfterSeconds?: number
): string {
  const toFa = (n: number) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
  if (status === 413) {
    return 'متن ارسالی بیش از حد طولانی است. لطفاً پیام کوتاهتری ارسال کنید.';
  }
  if (status === 429) {
    if (serverMessage && (serverMessage.includes('500') || serverMessage.includes('بانک سوالات'))) {
      return serverMessage;
    }
    const waitSecs = retryAfterSeconds && retryAfterSeconds > 0 ? retryAfterSeconds : 60;
    return `سقف درخواست‌های هوش مصنوعی تکمیل شده است. لطفاً ${toFa(waitSecs)} ثانیه دیگر مجدداً تلاش کنید.`;
  }
  if (status === 503) {
    return 'سرویس هوش مصنوعی ابری در حال حاضر در دسترس نیست؛ توصیه‌های مطالعاتی از پایگاه دانش تخصصی آفلاین نمایش داده می‌شود.';
  }
  if (status === 401) {
    return 'نشست کاربری شما منقضی شده است. پیشرفت محلی شما محفوظ است؛ در صورت تمایل مجدداً وارد شوید.';
  }
  return serverMessage || 'امکان برقراری ارتباط با سرویس هوش مصنوعی وجود ندارد.';
}

export interface SseParsedEvent {
  text?: string;
  cached?: boolean;
  source?: 'gemini' | 'offline-knowledge';
  done?: boolean;
}

/**
 * Stateful SSE parser that buffers partial lines across arbitrary network chunks
 * and safely decodes multi-byte UTF-8 sequences (e.g. 2-byte Persian code points split mid-character)
 * using `new TextDecoder('utf-8')` with `{ stream: true }`.
 */
export async function consumeSseByteStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: SseParsedEvent) => void
): Promise<{ fullText: string; cached: boolean; source: 'gemini' | 'offline-knowledge' }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let lineBuffer = '';
  let fullText = '';
  let cached = false;
  let source: 'gemini' | 'offline-knowledge' = 'gemini';

  const processLine = (rawLine: string): boolean => {
    const trimmed = rawLine.trim();
    if (!trimmed || !trimmed.startsWith('data:')) return false;
    const dataPayload = trimmed.replace(/^data:\s*/, '');
    if (dataPayload === '[DONE]') {
      onEvent({ done: true });
      return true;
    }
    try {
      const parsed = JSON.parse(dataPayload) as Record<string, unknown>;
      if (typeof parsed.cached === 'boolean') {
        cached = parsed.cached;
      }
      if (parsed.source === 'gemini' || parsed.source === 'offline-knowledge') {
        source = parsed.source;
      }
      if (typeof parsed.text === 'string' && parsed.text.length > 0) {
        fullText += parsed.text;
        onEvent({
          text: parsed.text,
          cached,
          source,
        });
      }
    } catch {
      // Ignore malformed partial JSON frame
    }
    return false;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const isDone = processLine(line);
        if (isDone) return { fullText, cached, source };
      }
    }

    // Flush any remaining decoder bytes and trailing buffered line
    lineBuffer += decoder.decode();
    if (lineBuffer.trim()) {
      const remainingLines = lineBuffer.split('\n');
      for (const line of remainingLines) {
        if (processLine(line)) break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { fullText, cached, source };
}

export interface StreamAiMentorResult {
  ok: boolean;
  text: string;
  cached: boolean;
  source: 'gemini' | 'offline-knowledge';
  status?: number;
  error?: string;
  retryAfterSeconds?: number;
  shouldUseLocalFallback?: boolean;
  aborted?: boolean;
}

/**
 * Streams a response from `/api/ai/mentor/stream` with full validation,
 * multi-chunk SSE buffering, AbortController support, and explicit HTTP 400 / 401 / 413 / 429 / 503 error reporting.
 */
export async function streamAiMentorResponse(
  input: AiMentorRequestInput,
  onProgress?: (accumulatedText: string, meta: { cached: boolean; source: 'gemini' | 'offline-knowledge' }) => void,
  signal?: AbortSignal
): Promise<StreamAiMentorResult> {
  const validation = validateAndBoundMentorRequest(input);
  if (!validation.ok) {
    return {
      ok: false,
      text: '',
      cached: false,
      source: 'offline-knowledge',
      status: 413,
      error: validation.error,
      shouldUseLocalFallback: false,
    };
  }

  try {
    const response = await fetch('/api/ai/mentor/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: validation.json,
      signal,
    });

    if (!response.ok) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) || undefined : undefined;
      let serverError = '';
      try {
        const errData = (await response.json()) as { error?: string };
        if (typeof errData?.error === 'string') {
          serverError = errData.error;
        }
      } catch {
        // Ignore non-JSON error body
      }

      const formattedError = formatAiHttpErrorMessage(
        response.status,
        serverError,
        retryAfterSeconds
      );

      if (response.status === 429 || response.status === 413 || response.status === 400) {
        return {
          ok: false,
          text: '',
          cached: false,
          source: 'offline-knowledge',
          status: response.status,
          retryAfterSeconds,
          error: formattedError,
          shouldUseLocalFallback: false,
        };
      }

      return {
        ok: false,
        text: '',
        cached: false,
        source: 'offline-knowledge',
        status: response.status,
        error: formattedError,
        shouldUseLocalFallback: true,
      };
    }

    if (!response.body) {
      return {
        ok: false,
        text: '',
        cached: false,
        source: 'offline-knowledge',
        error: 'پاسخ استریم از سرور دریافت نشد.',
        shouldUseLocalFallback: true,
      };
    }

    let accumulated = '';
    const result = await consumeSseByteStream(response.body, (ev) => {
      if (ev.text) {
        accumulated += ev.text;
        onProgress?.(accumulated, {
          cached: Boolean(ev.cached),
          source: ev.source || 'gemini',
        });
      }
    });

    if (!result.fullText.trim()) {
      return {
        ok: false,
        text: '',
        cached: false,
        source: 'offline-knowledge',
        shouldUseLocalFallback: true,
      };
    }

    return {
      ok: true,
      text: result.fullText,
      cached: result.cached,
      source: result.source,
      status: 200,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        ok: false,
        text: '',
        cached: false,
        source: 'offline-knowledge',
        error: 'تولید پاسخ توسط کاربر متوقف شد.',
        shouldUseLocalFallback: false,
        aborted: true,
      };
    }
    return {
      ok: false,
      text: '',
      cached: false,
      source: 'offline-knowledge',
      shouldUseLocalFallback: true,
    };
  }
}

export interface StreamMentorCallbacks {
  signal?: AbortSignal;
  onChunk?: (delta: string, accumulated: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (errorMessage: string, status?: number) => void;
}

/**
 * Convenience wrapper around `streamAiMentorResponse` with callback hooks and AbortController safety.
 */
export async function streamMentorResponse(
  input: AiMentorRequestInput,
  callbacks?: StreamMentorCallbacks
): Promise<StreamAiMentorResult> {
  if (callbacks?.signal?.aborted) {
    return {
      ok: false,
      text: '',
      cached: false,
      source: 'offline-knowledge',
      aborted: true,
    };
  }

  let prevText = '';
  const res = await streamAiMentorResponse(
    input,
    (accumulated) => {
      const delta = accumulated.slice(prevText.length);
      prevText = accumulated;
      callbacks?.onChunk?.(delta, accumulated);
    },
    callbacks?.signal
  );

  if (res.aborted || callbacks?.signal?.aborted) {
    return res;
  }

  if (res.ok) {
    callbacks?.onComplete?.(res.text);
  } else {
    callbacks?.onError?.(
      res.error || 'ارتباط با سرویس هوش مصنوعی برقرار نشد.',
      res.status
    );
  }
  return res;
}

/**
 * Standard non-streaming `/api/ai/mentor` request with UTF-8 byte ceiling and 401/413/429/503 mapping.
 */
export async function requestMentorResponse(
  input: AiMentorRequestInput,
  signal?: AbortSignal
): Promise<StreamAiMentorResult> {
  const validation = validateAndBoundMentorRequest(input);
  if (!validation.ok) {
    return {
      ok: false,
      text: validation.error,
      cached: false,
      source: 'offline-knowledge',
      status: 413,
      error: validation.error,
    };
  }

  try {
    const response = await fetch('/api/ai/mentor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: validation.json,
      signal,
    });

    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) || undefined : undefined;
    const data = (await response.json().catch(() => ({}))) as Record<string, any>;

    if (!response.ok) {
      const msg = formatAiHttpErrorMessage(
        response.status,
        typeof data.error === 'string' ? data.error : undefined,
        retryAfterSeconds
      );
      return {
        ok: false,
        text: msg,
        cached: false,
        source: 'offline-knowledge',
        status: response.status,
        retryAfterSeconds,
        error: msg,
      };
    }

    const replyText =
      typeof data.reply === 'string' && data.reply.trim()
        ? data.reply
        : typeof data.text === 'string' && data.text.trim()
        ? data.text
        : 'پاسخ علمی ثبت شد.';

    return {
      ok: true,
      text: replyText,
      cached: Boolean(data.cached),
      source: data.source === 'offline-knowledge' ? 'offline-knowledge' : 'gemini',
      status: 200,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        ok: false,
        text: '',
        cached: false,
        source: 'offline-knowledge',
        aborted: true,
      };
    }
    const fallbackText =
      'دوست خوبم، ارتباط با سرویس آنلاین موقتاً قطع شد، اما طبق اصول روان‌شناسی شناختی، سازمان‌دهی مجدد اطلاعات و بازیابی فعال بهترین راه یادگیری است.';
    return {
      ok: false,
      text: fallbackText,
      cached: false,
      source: 'offline-knowledge',
      error: fallbackText,
    };
  }
}

/**
 * Bounded `/api/ai/adaptive-plan` request with UTF-8 byte ceiling (`<= 14,000` bytes) and 401/413/429/503 mapping.
 */
export async function requestAdaptiveStudyPlan(
  input: AdaptivePlanRequestInput,
  signal?: AbortSignal
): Promise<{ ok: boolean; text: string; status?: number; retryAfterSeconds?: number }> {
  const validation = validateAndBoundAdaptivePlanRequest(input);
  if (!validation.ok) {
    return {
      ok: false,
      text: validation.error,
      status: 413,
    };
  }

  try {
    const response = await fetch('/api/ai/adaptive-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: validation.json,
      signal,
    });

    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) || undefined : undefined;
    const data = (await response.json().catch(() => ({}))) as Record<string, any>;

    if (!response.ok) {
      return {
        ok: false,
        text: formatAiHttpErrorMessage(
          response.status,
          typeof data.error === 'string' ? data.error : undefined,
          retryAfterSeconds
        ),
        status: response.status,
        retryAfterSeconds,
      };
    }

    return {
      ok: true,
      text:
        typeof data.plan === 'string' && data.plan.trim()
          ? data.plan
          : 'برنامه مطالعاتی شخصی‌سازی‌شده با موفقیت آماده شد.',
      status: 200,
    };
  } catch {
    return {
      ok: false,
      text: 'برنامه پیشنهادی Duo: روزانه ۱۵ دقیقه بر روی فصول زیست‌شناسی رفتار و آسیب‌شناسی متمرکز شوید و تست‌های تشریحی را مرور نمایید.',
    };
  }
}

/**
 * Bounded `/api/quiz/bank/generate` request using `sanitizeQuizGenerationInput`.
 */
export async function generateAiQuizQuestions(
  input: QuizGenerationInput,
  signal?: AbortSignal
): Promise<{ ok: boolean; questions: any[]; error?: string; status?: number }> {
  const sanitized = sanitizeQuizGenerationInput(input);
  const bounded = enforceMaxUtf8Bytes(sanitized, CLIENT_MAX_UTF8_BYTES);

  try {
    const response = await fetch('/api/quiz/bank/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: bounded.json,
      signal,
    });

    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) || undefined : undefined;
    const data = (await response.json().catch(() => ({}))) as Record<string, any>;

    if (!response.ok) {
      return {
        ok: false,
        questions: [],
        status: response.status,
        error: formatAiHttpErrorMessage(
          response.status,
          typeof data.error === 'string' ? data.error : undefined,
          retryAfterSeconds
        ),
      };
    }

    const questions = Array.isArray(data.questions)
      ? data.questions
      : data.question
      ? [data.question]
      : [];

    return {
      ok: true,
      questions,
      status: 200,
    };
  } catch {
    return {
      ok: false,
      questions: [],
      error: 'امکان تولید سوال جدید از سرور وجود ندارد؛ از بانک سوالات آفلاین استفاده می‌شود.',
    };
  }
}

