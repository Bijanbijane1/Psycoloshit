/**
 * Automated Frontend Contract & Synchronization Test Suite
 * Project: PsychoMaster (روان‌لینگو) - Phase 7
 *
 * Verifies:
 * 1. Stage Provenance State Machine (`online-verified` vs `offline-local` Golden Invariant)
 * 2. UTF-8 Byte Bounding Utility (`enforceMaxUtf8Bytes` <= 14,000 bytes & `sanitizeQuizGenerationInput`)
 * 3. Idempotent Reward Submissions, Replay Safety (`alreadyClaimed`), 401 Auto-Bootstrap, & 409 Prerequisite Gap
 * 4. Persian Digit Formatter Isolation (`toPersianDigits`, `toEnglishDigits`, `sanitizeRtlText`)
 * 5. Service Worker (`/public/sw.js`) Strict `/api/*` Bypass & HTML RTL Attributes
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  normalizeStageCompletionRecord,
  mergeCompletedStages,
  loadUserProgress,
  saveUserProgress,
  getDefaultUserProgress,
} from '../src/utils/storage.ts';
import {
  enforceMaxUtf8Bytes,
  sanitizeQuizGenerationInput,
  CLIENT_MAX_UTF8_BYTES,
  MAX_AI_REQUEST_BODY_BYTES,
  streamMentorResponse,
  requestMentorResponse,
  generateAiQuizQuestions,
} from '../src/services/aiClient.ts';
import {
  submitStageOrQuizReward,
  syncProgressToCloud,
  setGuestSessionToken,
  getGuestSessionToken,
} from '../src/utils/cloudSync.ts';
import {
  toPersianDigits,
  toEnglishDigits,
  sanitizeRtlText,
} from '../src/utils/persianDigits.ts';

let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    failedAssertions++;
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedAssertions++;
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    failedAssertions++;
    console.error(`  ❌ FAIL: ${message} (expected: ${JSON.stringify(expected)}, actual: ${JSON.stringify(actual)})`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedAssertions++;
}

// Install minimal browser globals (`localStorage`, `window`, `CustomEvent`) for Node 22 test environment
const memoryStorage = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string): string | null => (memoryStorage.has(key) ? memoryStorage.get(key)! : null),
  setItem: (key: string, value: string): void => {
    memoryStorage.set(key, String(value));
  },
  removeItem: (key: string): void => {
    memoryStorage.delete(key);
  },
  clear: (): void => {
    memoryStorage.clear();
  },
};

(globalThis as any).localStorage = mockLocalStorage;

const eventListeners = new Map<string, Set<(e: any) => void>>();
(globalThis as any).CustomEvent = class CustomEvent<T = any> {
  type: string;
  detail: T;
  constructor(type: string, params?: { detail?: T }) {
    this.type = type;
    this.detail = params?.detail as T;
  }
};
(globalThis as any).window = {
  localStorage: mockLocalStorage,
  dispatchEvent: (event: any) => {
    const set = eventListeners.get(event.type);
    if (set) {
      for (const listener of set) listener(event);
    }
    return true;
  },
  addEventListener: (type: string, listener: (e: any) => void) => {
    if (!eventListeners.has(type)) eventListeners.set(type, new Set());
    eventListeners.get(type)!.add(listener);
  },
  removeEventListener: (type: string, listener: (e: any) => void) => {
    eventListeners.get(type)?.delete(listener);
  },
};

async function runPhase7FrontendContractTests() {
  console.log('================================================================');
  console.log('🚀 Starting Phase 7 Frontend Contract & RTL/PWA Test Suite');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. STAGE PROVENANCE STATE MACHINE & GOLDEN INVARIANT
  // ---------------------------------------------------------------------------
  console.log('🔹 Suite 1: Stage Provenance State Machine (`online-verified` vs `offline-local`)');
  {
    // 1.1 Completing a stage offline creates a record with verified: false, source: 'offline-local'
    const offlineStage1 = normalizeStageCompletionRecord(1, {
      stageNumber: 1,
      completedAt: '2026-10-19T00:00:00.000Z',
      stars: 2,
      score: 8,
      totalQuestions: 10,
      xpEarned: 25,
      verified: false,
      source: 'offline-local',
      stageAnswers: { q1: 0, q2: true },
    });
    assert(offlineStage1 !== null, 'Offline stage 1 record should normalize cleanly');
    assertEqual(offlineStage1!.stageNumber, 1, 'Normalized stageNumber should be 1');
    assertEqual(offlineStage1!.verified, false, 'Offline completion must have verified: false');
    assertEqual(offlineStage1!.source, 'offline-local', 'Offline completion must have source: offline-local');
    assertEqual((offlineStage1!.stageAnswers as any)?.q1, 0, 'stageAnswers should be preserved');

    // 1.2 Subsequent server verification promotes offline-local to online-verified
    const serverVerifiedStage1 = normalizeStageCompletionRecord('stage_1', {
      stageNumber: 1,
      completedAt: '2026-10-19T00:05:00.000Z',
      stars: 2,
      score: 8,
      totalQuestions: 10,
      xpEarned: 25,
      verified: true,
      source: 'online-verified',
    });
    assert(serverVerifiedStage1 !== null, 'Server verified stage_1 key should parse to stage 1');
    assertEqual(serverVerifiedStage1!.verified, true, 'Server record must have verified: true');
    assertEqual(serverVerifiedStage1!.source, 'online-verified', 'Server record must have source: online-verified');

    const promotedMap = mergeCompletedStages(
      { 1: offlineStage1! },
      { 1: serverVerifiedStage1! }
    );
    assertEqual(promotedMap[1].verified, true, 'Merged stage 1 must be promoted to verified: true');
    assertEqual(promotedMap[1].source, 'online-verified', 'Merged stage 1 must have source: online-verified');
    assertEqual((promotedMap[1].stageAnswers as any)?.q1, 0, 'Merged stage 1 must retain local stageAnswers');

    // 1.3 GOLDEN INVARIANT: Merging an unverified local record with a higher score/stars into an online-verified record
    // MUST NEVER downgrade verified: true to false AND MUST NEVER overwrite server-verified score/stars!
    const unverifiedHighLocal = normalizeStageCompletionRecord(1, {
      stageNumber: 1,
      completedAt: '2026-10-19T01:00:00.000Z',
      stars: 3, // Higher unverified stars
      score: 10, // Higher unverified score
      totalQuestions: 10,
      xpEarned: 50,
      verified: false,
      source: 'offline-local',
    })!;

    const mergedExistingVerifiedFirst = mergeCompletedStages(
      { 1: serverVerifiedStage1! },
      { 1: unverifiedHighLocal }
    );
    assertEqual(
      mergedExistingVerifiedFirst[1].verified,
      true,
      'Golden Invariant: online-verified must NEVER downgrade to verified: false'
    );
    assertEqual(
      mergedExistingVerifiedFirst[1].source,
      'online-verified',
      'Golden Invariant: source must remain online-verified'
    );
    assertEqual(
      mergedExistingVerifiedFirst[1].stars,
      2,
      'Golden Invariant: unverified higher stars (3) must NOT overwrite server-verified stars (2)'
    );
    assertEqual(
      mergedExistingVerifiedFirst[1].score,
      8,
      'Golden Invariant: unverified higher score (10) must NOT overwrite server-verified score (8)'
    );
    assertEqual(
      mergedExistingVerifiedFirst[1].xpEarned,
      25,
      'Golden Invariant: unverified higher xpEarned (50) must NOT overwrite server-verified xpEarned (25)'
    );

    // 1.4 Golden Invariant in reverse order (local unverified in map 1, server verified in map 2)
    const mergedIncomingVerifiedSecond = mergeCompletedStages(
      { 1: unverifiedHighLocal },
      { 1: serverVerifiedStage1! }
    );
    assertEqual(
      mergedIncomingVerifiedSecond[1].verified,
      true,
      'Reverse merge: incoming online-verified must promote record to verified: true'
    );
    assertEqual(
      mergedIncomingVerifiedSecond[1].stars,
      2,
      'Reverse merge: incoming server-verified stars (2) must replace unverified local stars (3)'
    );
    assertEqual(
      mergedIncomingVerifiedSecond[1].score,
      8,
      'Reverse merge: incoming server-verified score (8) must replace unverified local score (10)'
    );

    // 1.5 Two online-verified records merge by keeping the highest verified score/stars
    const higherVerifiedStage1 = normalizeStageCompletionRecord(1, {
      stageNumber: 1,
      completedAt: '2026-10-19T02:00:00.000Z',
      stars: 3,
      score: 10,
      totalQuestions: 10,
      xpEarned: 25,
      verified: true,
      source: 'online-verified',
    })!;
    const mergedBothVerified = mergeCompletedStages(
      { 1: serverVerifiedStage1! },
      { 1: higherVerifiedStage1 }
    );
    assertEqual(mergedBothVerified[1].verified, true, 'Both verified -> remains verified');
    assertEqual(mergedBothVerified[1].stars, 3, 'Both verified -> preserves highest verified stars (3)');
    assertEqual(mergedBothVerified[1].score, 10, 'Both verified -> preserves highest verified score (10)');

    // 1.6 LocalStorage persistence & hydration preserves provenance
    mockLocalStorage.clear();
    const defaultProg = getDefaultUserProgress();
    defaultProg.completedStages = {
      1: mergedBothVerified[1],
      2: { ...unverifiedHighLocal, stageNumber: 2 },
    };
    saveUserProgress(defaultProg, 'test_user_1');
    const hydratedProg = loadUserProgress('test_user_1');
    assertEqual(hydratedProg.completedStages?.[1]?.verified, true, 'Hydrated stage 1 remains online-verified');
    assertEqual(hydratedProg.completedStages?.[1]?.source, 'online-verified', 'Hydrated stage 1 source is online-verified');
    assertEqual(hydratedProg.completedStages?.[2]?.verified, false, 'Hydrated stage 2 remains offline-local');
    assertEqual(hydratedProg.completedStages?.[2]?.source, 'offline-local', 'Hydrated stage 2 source is offline-local');
  }
  console.log('  ✅ Suite 1 Passed!\n');

  // ---------------------------------------------------------------------------
  // 2. UTF-8 BYTE CEILING ENFORCEMENT (`enforceMaxUtf8Bytes` <= 14,000 bytes)
  // ---------------------------------------------------------------------------
  console.log('🔹 Suite 2: UTF-8 Byte Bounding Utility (`enforceMaxUtf8Bytes` & AI Input Sanitizer)');
  {
    assertEqual(CLIENT_MAX_UTF8_BYTES, 14_000, 'CLIENT_MAX_UTF8_BYTES must be 14,000 bytes');
    assertEqual(MAX_AI_REQUEST_BODY_BYTES, 16_384, 'MAX_AI_REQUEST_BODY_BYTES must be 16,384 bytes');

    // Generate a massive multi-kilobyte Persian string (> 25,000 UTF-8 bytes)
    const massivePersianParagraph =
      'روان‌شناسی شناختی و عصب‌روان‌شناسی بالینی به بررسی دقیق فرآیندهای عالی ذهن از جمله حافظه فعال، توجه انتخابی، کارکردهای اجرایی قشر پیش‌پیشانی و تنظیم هیجان می‌پردازد. '.repeat(
        140
      );
    const rawBytes = new TextEncoder().encode(massivePersianParagraph).byteLength;
    assert(rawBytes > 20_000, `Raw Persian text must exceed 20,000 UTF-8 bytes (actual: ${rawBytes})`);

    const oversizedPayload = {
      question: 'سوال تخصصی درباره کارکردهای اجرایی و حافظه فعال در اختلالات اضطرابی چیست؟',
      chapterContext: massivePersianParagraph,
      chapterTitle: 'فصل اول: مبانی علوم اعصاب شناختی و روان‌شناسی بالینی',
    };

    const boundedResult = enforceMaxUtf8Bytes(oversizedPayload, CLIENT_MAX_UTF8_BYTES);
    const serialized = JSON.stringify(boundedResult.payload);
    const finalByteLength = new TextEncoder().encode(serialized).byteLength;

    assert(
      finalByteLength <= 14_000,
      `Serialized UTF-8 byte length must be <= 14,000 bytes (actual: ${finalByteLength})`
    );
    assertEqual(
      boundedResult.byteLength,
      finalByteLength,
      'boundedResult.byteLength must match encoded JSON byte length'
    );
    assert(
      boundedResult.wasTrimmed === true,
      'Oversized >20KB Persian payload must report wasTrimmed: true'
    );
    assert(
      !serialized.includes('\uFFFD'),
      'Truncated UTF-8 JSON must NOT contain replacement characters or broken surrogate halves'
    );

    // Verify JSON parses cleanly
    const reparsed = JSON.parse(serialized);
    assertEqual(
      reparsed.question,
      oversizedPayload.question,
      'Primary question field should remain intact when chapterContext is truncated first'
    );

    // Verify sanitizeQuizGenerationInput constraints
    const sanitizedQuizReq = sanitizeQuizGenerationInput({
      topic: 'مبانی روان‌شناسی '.repeat(30), // > 200 chars
      chapterTitle: 'فصل طولانی '.repeat(30), // > 200 chars
      difficulty: 'advanced', // maps to 'hard'
      count: '۲۵' as any, // Persian digits '25' -> clamped to 10
    });
    assert(sanitizedQuizReq.topic.length <= 200, 'topic must be truncated to <= 200 chars');
    assert(
      (sanitizedQuizReq.chapterTitle || '').length <= 200,
      'chapterTitle must be truncated to <= 200 chars'
    );
    assertEqual(sanitizedQuizReq.difficulty, 'hard', 'advanced difficulty must map to hard');
    assertEqual(sanitizedQuizReq.count, 10, 'count "۲۵" must convert to English number and clamp to 10');

    const sanitizedEasyQuizReq = sanitizeQuizGenerationInput({
      topic: 'شرطی‌سازی کلاسیک پاولف',
      difficulty: 'basic',
      count: 0,
    });
    assertEqual(sanitizedEasyQuizReq.difficulty, 'easy', 'basic difficulty must map to easy');
    assertEqual(sanitizedEasyQuizReq.count, 1, 'count 0 must clamp to minimum 1');
  }
  console.log('  ✅ Suite 2 Passed!\n');

  // ---------------------------------------------------------------------------
  // 3. IDEMPOTENCY, REPLAY SAFETY, 401 AUTO-BOOTSTRAP & 409 PREREQUISITE GAP
  // ---------------------------------------------------------------------------
  console.log('🔹 Suite 3: Idempotent Reward Submissions, 401 Auto-Bootstrap & 409 Handling');
  {
    mockLocalStorage.clear();
    const originalFetch = globalThis.fetch;

    try {
      // 3.1 Deterministic / attempt-scoped idempotencyKey reuse on retry & alreadyClaimed handling
      const capturedBodies: any[] = [];
      let callCount = 0;

      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/leaderboard/submit')) {
          callCount++;
          const body = JSON.parse(String(init?.body || '{}'));
          capturedBodies.push(body);
          if (callCount === 1) {
            return new Response(
              JSON.stringify({
                error: 'Network timeout simulated',
              }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return new Response(
            JSON.stringify({
              ok: true,
              xpAwarded: 0,
              alreadyClaimed: true,
              profile: {
                userId: 'user_test',
                displayName: 'کاربر تست',
                avatar: '🦉',
                xp: 900,
                streakDays: 3,
                completedStages: {
                  1: {
                    stageNumber: 1,
                    completedAt: '2026-10-19T00:00:00.000Z',
                    stars: 3,
                    score: 10,
                    totalQuestions: 10,
                    xpEarned: 25,
                    verified: true,
                    source: 'online-verified',
                  },
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('{}', { status: 200 });
      };

      const fixedAttemptKey = 'stage_1_attempt_fixed_key_12345';
      const firstTry = await submitStageOrQuizReward(
        {
          rewardType: 'stage_completion',
          stageNumber: 1,
          stars: 3,
          score: 10,
          totalQuestions: 10,
          idempotencyKey: fixedAttemptKey,
        },
        3
      );
      assertEqual(firstTry.ok, false, 'First try on 503 should return ok: false without throwing');
      assertEqual(firstTry.idempotencyKey, fixedAttemptKey, 'First try must return the attempt idempotencyKey');

      // Retry with the exact same idempotencyKey
      const secondTry = await submitStageOrQuizReward(
        {
          rewardType: 'stage_completion',
          stageNumber: 1,
          stars: 3,
          score: 10,
          totalQuestions: 10,
          idempotencyKey: fixedAttemptKey,
        },
        3
      );
      assertEqual(secondTry.ok, true, 'Retry should succeed');
      assertEqual(secondTry.alreadyClaimed, true, 'Response should expose alreadyClaimed: true');
      assertEqual(capturedBodies.length, 2, 'Two requests should have been sent');
      assertEqual(
        capturedBodies[0].idempotencyKey,
        capturedBodies[1].idempotencyKey,
        'Retry MUST reuse the exact same idempotencyKey'
      );
      assert(
        capturedBodies[0].idempotencyKey.length <= 128,
        'idempotencyKey must be <= 128 characters'
      );

      // 3.2 409 Conflict (PREREQUISITE_NOT_MET) mapping
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            error: 'Sequential stage prerequisite not met: stage 1 must be verified before stage 2.',
            code: 'PREREQUISITE_NOT_MET',
            missingPrerequisiteStage: 1,
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const prereqResult = await submitStageOrQuizReward(
        {
          rewardType: 'stage_completion',
          stageNumber: 2,
          stars: 3,
          score: 10,
          totalQuestions: 10,
        },
        1
      );
      assertEqual(prereqResult.ok, false, '409 Conflict must return ok: false');
      assertEqual(prereqResult.status, 409, 'Status must be 409');
      assertEqual(prereqResult.code, 'PREREQUISITE_NOT_MET', 'Code must be PREREQUISITE_NOT_MET');
      assertEqual(prereqResult.missingPrerequisiteStage, 1, 'missingPrerequisiteStage must be 1');

      // 3.3 401 Unauthorized Guest Session Auto-Bootstrap & Single Retry
      setGuestSessionToken(null);
      let submitCalls = 0;
      let syncBootstrapCalls = 0;

      globalThis.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/leaderboard/submit')) {
          submitCalls++;
          if (submitCalls === 1) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return new Response(
            JSON.stringify({
              ok: true,
              xpAwarded: 25,
              alreadyClaimed: false,
              profile: { userId: 'guest_bootstrapped', xp: 900 },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.endsWith('/api/user/sync')) {
          syncBootstrapCalls++;
          return new Response(
            JSON.stringify({
              guestSessionToken: 'fresh_guest_token_abc',
              profile: { userId: 'guest_bootstrapped', xp: 875, completedStages: {} },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('{}', { status: 200 });
      };

      const bootstrapResult = await submitStageOrQuizReward(
        {
          rewardType: 'stage_completion',
          stageNumber: 1,
          stars: 3,
          score: 10,
          totalQuestions: 10,
        },
        1
      );
      assertEqual(syncBootstrapCalls, 1, '401 on submit should trigger exactly 1 guest session bootstrap via /api/user/sync');
      assertEqual(submitCalls, 2, 'Submit should be retried once after bootstrap');
      assertEqual(bootstrapResult.ok, true, 'Retried submit after 401 bootstrap should succeed');
      assertEqual(getGuestSessionToken(), 'fresh_guest_token_abc', 'Fresh guest session token must be persisted');

      // 3.4 AI Client 413, 429, and 503 Persian Error Mapping & AbortController safety
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '45' },
        });

      const rateLimitedMentor = await requestMentorResponse({
        question: 'تفاوت شرطی‌سازی کلاسیک و کنشی چیست؟',
      });
      assertEqual(rateLimitedMentor.ok, false, '429 response must return ok: false');
      assertEqual(rateLimitedMentor.status, 429, 'Status must be 429');
      assertEqual(rateLimitedMentor.retryAfterSeconds, 45, 'Retry-After header must be parsed as 45s');
      assert(
        rateLimitedMentor.text.includes('۴۵'),
        '429 error message should display Retry-After seconds in Persian digits'
      );

      // Test AbortController clean cancellation on streamMentorResponse
      const abortCtrl = new AbortController();
      abortCtrl.abort();
      let errorCalledOnAbort = false;
      const abortedStream = await streamMentorResponse(
        { question: 'تست لغو استریم' },
        {
          signal: abortCtrl.signal,
          onError: () => {
            errorCalledOnAbort = true;
          },
        }
      );
      assertEqual(abortedStream.ok, false, 'Aborted stream returns ok: false');
      assertEqual(errorCalledOnAbort, false, 'Intentional AbortController cancellation must NOT trigger error state');
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
  console.log('  ✅ Suite 3 Passed!\n');

  // ---------------------------------------------------------------------------
  // 4. PERSIAN DIGIT FORMATTER ISOLATION & XSS SANITIZATION
  // ---------------------------------------------------------------------------
  console.log('🔹 Suite 4: Persian Digit Formatter Isolation & RTL Sanitization');
  {
    assertEqual(toPersianDigits(1234567890), '۱۲۳۴۵۶۷۸۹۰', 'toPersianDigits converts all ASCII digits 0-9');
    assertEqual(toPersianDigits('مرحله 42 - 100%'), 'مرحله ۴۲ - ۱۰۰%', 'toPersianDigits converts embedded numbers');
    assertEqual(toEnglishDigits('۱۲۳۴۵۶۷۸۹۰'), '1234567890', 'toEnglishDigits converts Persian digits to ASCII');
    assertEqual(toEnglishDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789', 'toEnglishDigits converts Arabic-Indic digits to ASCII');

    // Ensure raw numeric IDs remain ASCII numbers when passed into API payloads
    const rawStageId = 15;
    const displayLabel = `مرحله ${toPersianDigits(rawStageId)}`;
    assertEqual(typeof rawStageId, 'number', 'Raw stageNumber must remain a standard number');
    assertEqual(displayLabel, 'مرحله ۱۵', 'Display label uses Persian digits');

    // XSS sanitization check
    const maliciousInput = 'متن علمی\u0000 با کاراکتر کنترلی\u0007';
    const cleaned = sanitizeRtlText(maliciousInput);
    assert(!cleaned.includes('\u0000') && !cleaned.includes('\u0007'), 'Control chars must be stripped');
    assert(cleaned.includes('متن علمی'), 'Valid Persian text must be preserved');
  }
  console.log('  ✅ Suite 4 Passed!\n');

  // ---------------------------------------------------------------------------
  // 5. PWA SERVICE WORKER (`/public/sw.js`) & `index.html` RTL VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('🔹 Suite 5: Service Worker Strict `/api/*` Bypass & HTML RTL Attributes');
  {
    const swPath = path.resolve(process.cwd(), 'public/sw.js');
    const swContent = fs.readFileSync(swPath, 'utf8');
    assert(
      swContent.includes("url.pathname.startsWith('/api/')"),
      'public/sw.js must strictly bypass /api/* routes'
    );
    assert(
      swContent.includes("event.request.method !== 'GET'"),
      'public/sw.js must only intercept GET requests'
    );

    const htmlPath = path.resolve(process.cwd(), 'index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    assert(
      htmlContent.includes('lang="fa"') && htmlContent.includes('dir="rtl"'),
      'index.html must enforce <html lang="fa" dir="rtl">'
    );
    assert(
      htmlContent.includes('Vazirmatn'),
      'index.html must load the Vazirmatn font family'
    );
  }
  console.log('  ✅ Suite 5 Passed!\n');

  // ---------------------------------------------------------------------------
  // 6. PHASE 10B: ENTRANCE EXAM SIMULATOR (D1 MIGRATION, WORKER API, SCORING, RESUME & HISTORY)
  // ---------------------------------------------------------------------------
  console.log('🔹 Suite 6: Phase 10B Entrance Exam Simulator (D1 Schema, Worker API, Konkoor Scoring & History)');
  {
    const { DatabaseSync } = await import('node:sqlite');
    const workerModule = await import('../src/worker/index.ts');
    const worker = workerModule.default;
    const {
      calculateExamScoreAndBreakdown,
      DEFAULT_EXAM_BLUEPRINTS,
    } = await import('../src/data/examBlueprintsData.ts');

    const sqlite = new DatabaseSync(':memory:');
    const migrationFiles = [
      'migrations/0001_initial_schema.sql',
      'migrations/0002_xp_idempotency.sql',
      'migrations/0003_auth_sessions.sql',
      'migrations/0004_auth_nonces.sql',
      'migrations/0005_worker_operational_state.sql',
      'migrations/0006_entrance_exams.sql',
    ];
    for (const file of migrationFiles) {
      sqlite.exec(fs.readFileSync(path.resolve(process.cwd(), file), 'utf8'));
    }

    const mockD1 = {
      prepare(query: string) {
        let boundValues: any[] = [];
        const normalize = (v: any) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
        return {
          bind(...values: any[]) {
            boundValues = values.map(normalize);
            return this;
          },
          async first<T = unknown>(colName?: string): Promise<T | null> {
            const stmt = sqlite.prepare(query);
            const row = stmt.get(...boundValues) as Record<string, unknown> | undefined;
            if (!row) return null;
            if (colName) return (row[colName] as T) ?? null;
            return row as T;
          },
          async run() {
            const stmt = sqlite.prepare(query);
            const res = stmt.run(...boundValues);
            return { success: true, meta: res as unknown as Record<string, unknown> };
          },
          async all<T = unknown>() {
            const stmt = sqlite.prepare(query);
            const rows = stmt.all(...boundValues);
            return { success: true, results: rows as T[] };
          },
          async raw<T = unknown>() {
            const stmt = sqlite.prepare(query);
            return stmt.all(...boundValues) as T[];
          },
        };
      },
      async batch(statements: any[]) {
        sqlite.exec('BEGIN TRANSACTION');
        try {
          const out = [];
          for (const s of statements) out.push(await s.run());
          sqlite.exec('COMMIT');
          return out;
        } catch (err) {
          sqlite.exec('ROLLBACK');
          throw err;
        }
      },
      async exec(query: string) {
        sqlite.exec(query);
        return { success: true };
      },
      async dump() {
        return new ArrayBuffer(0);
      },
    };

    const env = { DB: mockD1 } as any;
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };

    // 6.1 Pure Konkoor Negative-Marking Formula Verification
    const pureAnswersMap = new Map<
      string,
      { selectedIndex: number | null; isFlagged: boolean; timeSpentSeconds: number }
    >([
      ['q1', { selectedIndex: 1, isFlagged: false, timeSpentSeconds: 15 }], // Correct
      ['q2', { selectedIndex: 2, isFlagged: false, timeSpentSeconds: 20 }], // Correct
      ['q3', { selectedIndex: 0, isFlagged: true, timeSpentSeconds: 25 }], // Wrong (-0.3333)
      ['q4', { selectedIndex: null, isFlagged: false, timeSpentSeconds: 5 }], // Blank (0)
    ]);
    const pureScore = calculateExamScoreAndBreakdown({
      blueprint: {
        ...DEFAULT_EXAM_BLUEPRINTS[0],
        negativeMarking: true,
        negativeWeight: 1 / 3,
        sections: [{ id: 's1', title: 'بالینی', chapterIds: ['ch-1'], questionCount: 4, weight: 4 }],
      },
      questions: [
        { id: 'q1', chapterId: 'ch-1', sectionId: 's1', correctIndex: 1 },
        { id: 'q2', chapterId: 'ch-1', sectionId: 's1', correctIndex: 2 },
        { id: 'q3', chapterId: 'ch-1', sectionId: 's1', correctIndex: 3 },
        { id: 'q4', chapterId: 'ch-1', sectionId: 's1', correctIndex: 0 },
      ],
      answersByQuestionId: pureAnswersMap,
    });
    // 2 correct, 1 wrong out of 4 => (2 - 1/3) / 4 = 1.6667 / 4 = 41.67%
    assertEqual(pureScore.correctCount, 2, 'Konkoor score should count 2 correct');
    assertEqual(pureScore.wrongCount, 1, 'Konkoor score should count 1 wrong');
    assertEqual(pureScore.unansweredCount, 1, 'Konkoor score should count 1 unanswered');
    assertEqual(pureScore.rawScorePercent, 41.67, 'Konkoor 1/3 negative marking should compute 41.67%');
    assert(pureScore.xpToAward >= 25, 'XP earned should be at least 25');

    // 6.2 List Exam Blueprints via Worker GET /api/exams/blueprints
    const bpRes = await worker.fetch(new Request('http://localhost/api/exams/blueprints'), env, ctx);
    assertEqual(bpRes.status, 200, 'GET /api/exams/blueprints should return 200');
    const bpJson = await bpRes.json();
    assertEqual(bpJson.ok, true, 'Blueprints response should have ok: true');
    assert(Array.isArray(bpJson.blueprints) && bpJson.blueprints.length >= 5, 'Should seed at least 5 exam blueprints');

    // 6.3 Unauthenticated exam start is rejected with 401
    const unauthStart = await worker.fetch(
      new Request('http://localhost/api/exams/attempts/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify({ blueprintId: 'bp_diagnostic_placement' }),
      }),
      env,
      ctx
    );
    assertEqual(unauthStart.status, 401, 'Unauthenticated exam start must return 401');

    // 6.4 Bootstrap guest session via /api/user/sync
    const syncRes = await worker.fetch(
      new Request('http://localhost/api/user/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify({ userId: 'usr_exam_tester_1', name: 'داوطلب تست کنکور' }),
      }),
      env,
      ctx
    );
    assertEqual(syncRes.status, 200, 'User sync should succeed');
    const syncData = await syncRes.json();
    const guestToken = syncData.guestToken;
    assert(typeof guestToken === 'string' && guestToken.length > 10, 'Guest session token must be issued');

    // 6.5 Start a new Diagnostic Exam Attempt
    const startRes = await worker.fetch(
      new Request('http://localhost/api/exams/attempts/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          userId: 'usr_exam_tester_1',
          blueprintId: 'bp_diagnostic_placement',
          idempotencyKey: 'idem_diag_test_1',
        }),
      }),
      env,
      ctx
    );
    assertEqual(startRes.status, 201, 'Authenticated exam start should return 201');
    const startSession = await startRes.json();
    assertEqual(startSession.ok, true, 'Start session should have ok: true');
    assertEqual(startSession.questions.length, 10, 'Diagnostic blueprint should have 10 questions');
    assertEqual(
      (startSession.questions[0] as any).correctIndex,
      undefined,
      'Active exam session must NOT leak correctIndex before submission'
    );

    const attemptId = startSession.attempt.id;
    const firstQ = startSession.questions[0];
    const secondQ = startSession.questions[1];

    // 6.6 Save answer & flag on Question 1
    const ans1Res = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${attemptId}/answer`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          questionId: firstQ.id,
          selectedIndex: 1,
          isFlagged: true,
          timeSpentSeconds: 18,
          currentQuestionIndex: 1,
        }),
      }),
      env,
      ctx
    );
    assertEqual(ans1Res.status, 200, 'Saving answer for Q1 should return 200');
    const ans1Data = await ans1Res.json();
    assertEqual(ans1Data.answer.selectedIndex, 1, 'Saved answer selectedIndex should be 1');
    assertEqual(ans1Data.answer.isFlagged, true, 'Saved answer isFlagged should be true');

    // 6.7 Resume the in-progress attempt via idempotent key and verify persistence
    const resumeRes = await worker.fetch(
      new Request('http://localhost/api/exams/attempts/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          userId: 'usr_exam_tester_1',
          blueprintId: 'bp_diagnostic_placement',
          idempotencyKey: 'idem_diag_test_1',
        }),
      }),
      env,
      ctx
    );
    assertEqual(resumeRes.status, 200, 'Resuming active attempt should return 200');
    const resumedSession = await resumeRes.json();
    assertEqual(resumedSession.attempt.id, attemptId, 'Resumed attemptId must match');
    const savedQ1Ans = resumedSession.answers[firstQ.id];
    assert(Boolean(savedQ1Ans), 'Saved answer for Q1 must exist in resumed answers map');
    assertEqual(
      savedQ1Ans.selectedIndex,
      1,
      'Resumed attempt must preserve saved selectedIndex for Q1'
    );
    assertEqual(
      savedQ1Ans.isFlagged,
      true,
      'Resumed attempt must preserve saved flag for Q1'
    );

    // 6.8 Cross-user isolation check (another user cannot access or submit this attempt)
    const syncOtherRes = await worker.fetch(
      new Request('http://localhost/api/user/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify({ userId: 'usr_other_intruder_2', name: 'کاربر دوم' }),
      }),
      env,
      ctx
    );
    const otherToken = (await syncOtherRes.json()).guestToken;
    const forbiddenGet = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${attemptId}`, {
        method: 'GET',
        headers: { 'X-Guest-Token': otherToken },
      }),
      env,
      ctx
    );
    assertEqual(forbiddenGet.status, 403, 'Cross-user attempt access must be rejected with 403');

    // Helper to look up authoritative correct_index in test SQLite DB
    const getCorrectIndex = (questionId: string): number => {
      const row = sqlite
        .prepare('SELECT correct_index FROM exam_question_bank WHERE id = ?')
        .get(questionId) as { correct_index: number } | undefined;
      return row ? Number(row.correct_index) : 0;
    };

    // 6.9 Submit the exam attempt and verify scoring, explanations, and idempotent XP reward
    const firstQCorrect = getCorrectIndex(firstQ.id);
    const secondQCorrect = getCorrectIndex(secondQ.id);
    const submitRes = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${attemptId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          answers: [
            { questionId: firstQ.id, selectedIndex: firstQCorrect, isFlagged: true, timeSpentSeconds: 22 },
            { questionId: secondQ.id, selectedIndex: secondQCorrect, isFlagged: false, timeSpentSeconds: 14 },
          ],
          durationSecondsUsed: 36,
        }),
      }),
      env,
      ctx
    );
    assertEqual(submitRes.status, 200, 'Submitting attempt should return 200');
    const submitData = await submitRes.json();
    assertEqual(submitData.ok, true, 'Submit response ok should be true');
    assertEqual(submitData.alreadySubmitted, false, 'First submit should have alreadySubmitted: false');
    assertEqual(submitData.attempt.status, 'submitted', 'Attempt status should be submitted');
    assert(submitData.xpAwarded >= 10, 'Submitting exam must award XP');
    assert(
      typeof submitData.questions[0].correctIndex === 'number' &&
        submitData.questions[0].explanation.length > 5,
      'Post-submission review must include correctIndex and Persian explanation'
    );

    // 6.10 Idempotent re-submission must report alreadySubmitted: true
    const duplicateSubmitRes = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${attemptId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({}),
      }),
      env,
      ctx
    );
    assertEqual(duplicateSubmitRes.status, 200, 'Idempotent re-submit should return 200');
    const dupData = await duplicateSubmitRes.json();
    assertEqual(dupData.alreadySubmitted, true, 'Duplicate submit must report alreadySubmitted: true');

    // 6.11 Modifying answers after submission is rejected with 409
    const postSubmitAnswerRes = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${attemptId}/answer`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({ questionId: firstQ.id, selectedIndex: 2 }),
      }),
      env,
      ctx
    );
    assertEqual(postSubmitAnswerRes.status, 409, 'Saving answer on submitted attempt must return 409');

    // 6.12 Exam History endpoint returns completed attempt and summary analytics
    const historyRes = await worker.fetch(
      new Request('http://localhost/api/exams/history', {
        method: 'GET',
        headers: { 'X-Guest-Token': guestToken },
      }),
      env,
      ctx
    );
    assertEqual(historyRes.status, 200, 'GET /api/exams/history should return 200');
    const historyJson = await historyRes.json();
    assertEqual(historyJson.ok, true, 'History response should have ok: true');
    assertEqual(historyJson.stats.totalCompletedExams, 1, 'Stats should show 1 completed attempt');
    assertEqual(historyJson.attempts[0].id, attemptId, 'History should list the submitted attempt');

    // =========================================================================
    // 7. SUITE 7: PHASE 10B.2 SECURITY, DEADLINE & REWARD INTEGRITY REGRESSIONS
    // =========================================================================
    console.log('🔹 Suite 7: Phase 10B.2 Security, Deadline Enforcement & Reward Integrity');

    // 7.1 Client modules must not export exam question pools or answer keys
    const blueprintsModule = await import('../src/data/examBlueprintsData.ts');
    assertEqual(
      (blueprintsModule as any).buildCuratedExamQuestionPool,
      undefined,
      'Client-imported examBlueprintsData.ts must NOT export buildCuratedExamQuestionPool'
    );
    assertEqual(
      (blueprintsModule as any).CURATED_EXAM_QUESTIONS,
      undefined,
      'Client-imported examBlueprintsData.ts must NOT export CURATED_EXAM_QUESTIONS'
    );

    const examServiceSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/examService.ts'),
      'utf-8'
    );
    assert(
      !examServiceSource.includes('examQuestionsServerPool') &&
        !examServiceSource.includes('buildCuratedExamQuestionPool') &&
        !examServiceSource.includes('calculateExamScoreAndBreakdown'),
      'Client examService.ts must not import server question pools or client-side scoring fallback'
    );

    // 7.2 Public GET /api/quiz/bank must not expose exam_question_bank items or correctIndex/explanation
    const publicBankRes = await worker.fetch(
      new Request('http://localhost/api/quiz/bank?limit=50', { method: 'GET' }),
      env,
      ctx
    );
    assertEqual(publicBankRes.status, 200, 'GET /api/quiz/bank should return 200');
    const publicBankJson = await publicBankRes.json();
    assert(
      Array.isArray(publicBankJson.questions) && publicBankJson.questions.length > 0,
      'Public quiz bank should return conceptual questions'
    );
    for (const q of publicBankJson.questions) {
      assert(
        !String(q.id).startsWith('exq_'),
        'Public /api/quiz/bank must NEVER return entrance exam questions (exq_*)'
      );
      assertEqual(
        (q as any).correctIndex,
        undefined,
        'Public /api/quiz/bank must NEVER expose correctIndex'
      );
      assertEqual(
        (q as any).explanation,
        undefined,
        'Public /api/quiz/bank must NEVER expose explanation'
      );
    }

    // 7.3 Repeat attempt on the same blueprint after earning XP must award 0 XP (anti-farming)
    const repeatStartRes = await worker.fetch(
      new Request('http://localhost/api/exams/attempts/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          userId: 'usr_exam_tester_1',
          blueprintId: 'bp_diagnostic_placement',
          idempotencyKey: 'idem_diag_repeat_2',
        }),
      }),
      env,
      ctx
    );
    assertEqual(repeatStartRes.status, 201, 'Starting second attempt on same blueprint should return 201');
    const repeatSession = await repeatStartRes.json();
    const repeatQ0Correct = getCorrectIndex(repeatSession.questions[0].id);
    const repeatQ1Correct = getCorrectIndex(repeatSession.questions[1].id);
    const repeatSubmitRes = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${repeatSession.attempt.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          answers: [
            { questionId: repeatSession.questions[0].id, selectedIndex: repeatQ0Correct, timeSpentSeconds: 12 },
            { questionId: repeatSession.questions[1].id, selectedIndex: repeatQ1Correct, timeSpentSeconds: 12 },
          ],
          durationSecondsUsed: 24,
        }),
      }),
      env,
      ctx
    );
    assertEqual(repeatSubmitRes.status, 200, 'Submitting repeat attempt should return 200');
    const repeatSubmitData = await repeatSubmitRes.json();
    assertEqual(
      repeatSubmitData.xpAwarded,
      0,
      'Repeat completion of an already-rewarded blueprint must award 0 XP to prevent farming'
    );

    // 7.4 Empty exam submission on a fresh blueprint must award 0 XP
    const emptyStartRes = await worker.fetch(
      new Request('http://localhost/api/exams/attempts/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          userId: 'usr_exam_tester_1',
          blueprintId: bpJson.blueprints[1].id,
          idempotencyKey: 'idem_empty_clinical_1',
        }),
      }),
      env,
      ctx
    );
    assertEqual(emptyStartRes.status, 201, 'Starting second blueprint should return 201');
    const emptySession = await emptyStartRes.json();
    const emptySubmitRes = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${emptySession.attempt.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          answers: [],
          durationSecondsUsed: 5,
        }),
      }),
      env,
      ctx
    );
    assertEqual(emptySubmitRes.status, 200, 'Empty exam submission should return 200');
    const emptySubmitData = await emptySubmitRes.json();
    assertEqual(emptySubmitData.attempt.correctCount, 0, 'Empty attempt has 0 correct answers');
    assertEqual(emptySubmitData.xpAwarded, 0, 'Empty exam submission must award 0 XP');

    // 7.5 Server-side deadline enforcement: post-deadline answers in submit payload are ignored & status becomes expired
    const expStartRes = await worker.fetch(
      new Request('http://localhost/api/exams/attempts/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          userId: 'usr_exam_tester_1',
          blueprintId: bpJson.blueprints[2].id,
          idempotencyKey: 'idem_deadline_test_1',
        }),
      }),
      env,
      ctx
    );
    assertEqual(expStartRes.status, 201, 'Starting third blueprint should return 201');
    const expSession = await expStartRes.json();
    const expAttemptId = expSession.attempt.id;
    const preDeadlineQ = expSession.questions[0];
    const postDeadlineQ = expSession.questions[1];
    const preDeadlineQCorrect = getCorrectIndex(preDeadlineQ.id);
    const postDeadlineQCorrect = getCorrectIndex(postDeadlineQ.id);

    // Save one valid answer before the deadline expires
    const preSaveRes = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${expAttemptId}/answer`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          questionId: preDeadlineQ.id,
          selectedIndex: preDeadlineQCorrect,
          timeSpentSeconds: 15,
        }),
      }),
      env,
      ctx
    );
    assertEqual(preSaveRes.status, 200, 'Pre-deadline answer save should succeed');

    // Force attempt expires_at into the past in SQLite
    const pastIso = new Date(Date.now() - 60_000).toISOString();
    sqlite
      .prepare('UPDATE exam_attempts SET expires_at = ? WHERE id = ?')
      .run(pastIso, expAttemptId);

    // Saving a new answer via PUT after deadline must fail with 409 EXAM_TIME_EXPIRED
    const latePutRes = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${expAttemptId}/answer`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          questionId: postDeadlineQ.id,
          selectedIndex: postDeadlineQCorrect,
        }),
      }),
      env,
      ctx
    );
    assertEqual(latePutRes.status, 409, 'Late PUT /answer after deadline must be rejected with 409');

    // Submitting after deadline with sneaky post-deadline answers in payload must ignore the late answers and mark status='expired'
    const lateSubmitRes = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${expAttemptId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          answers: [
            { questionId: preDeadlineQ.id, selectedIndex: preDeadlineQCorrect },
            { questionId: postDeadlineQ.id, selectedIndex: postDeadlineQCorrect },
          ],
          durationSecondsUsed: 300,
        }),
      }),
      env,
      ctx
    );
    assertEqual(lateSubmitRes.status, 200, 'Late submit should finalize the expired attempt');
    const lateSubmitData = await lateSubmitRes.json();
    assertEqual(
      lateSubmitData.attempt.status,
      'expired',
      'Attempt finalized after expires_at must be marked with status = expired'
    );
    assertEqual(
      lateSubmitData.attempt.correctCount,
      1,
      'Only the pre-deadline saved answer (1 correct) must be counted; post-deadline payload answer must be ignored'
    );
    assertEqual(
      lateSubmitData.answers[postDeadlineQ.id]?.selectedIndex,
      null,
      'Post-deadline answer in submit payload must remain null (unanswered)'
    );

    // 7.6 XP Ledger failure during submit must NOT swallow error or permanently mark attempt submitted
    const txStartRes = await worker.fetch(
      new Request('http://localhost/api/exams/attempts/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          userId: 'usr_exam_tester_1',
          blueprintId: bpJson.blueprints[3].id,
          idempotencyKey: 'idem_ledger_fail_test_1',
        }),
      }),
      env,
      ctx
    );
    assertEqual(txStartRes.status, 201, 'Starting fourth blueprint should return 201');
    const txSession = await txStartRes.json();
    const txAttemptId = txSession.attempt.id;
    const txQ0Correct = getCorrectIndex(txSession.questions[0].id);

    // Create a failing DB proxy that throws only when inserting into xp_ledger
    const failingXpDb = {
      ...mockD1,
      prepare(query: string) {
        if (query.includes('INSERT INTO xp_ledger')) {
          throw new Error('Simulated D1 xp_ledger write outage');
        }
        return mockD1.prepare(query);
      },
    } as any;

    const failedSubmitRes = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${txAttemptId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          answers: [{ questionId: txSession.questions[0].id, selectedIndex: txQ0Correct, timeSpentSeconds: 10 }],
          durationSecondsUsed: 10,
        }),
      }),
      { DB: failingXpDb },
      ctx
    );
    assertEqual(
      failedSubmitRes.status,
      500,
      'Submit must return 500 when XP ledger write fails instead of swallowing the error'
    );

    const attemptAfterFail = sqlite
      .prepare('SELECT status, xp_awarded FROM exam_attempts WHERE id = ?')
      .get(txAttemptId) as { status: string; xp_awarded: number };
    assertEqual(
      attemptAfterFail.status,
      'in_progress',
      'Attempt must remain in_progress when XP ledger write fails so user can retry'
    );

    // Retrying with healthy DB must succeed and award the full XP
    const retrySubmitRes = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${txAttemptId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          answers: [{ questionId: txSession.questions[0].id, selectedIndex: txQ0Correct, timeSpentSeconds: 10 }],
          durationSecondsUsed: 10,
        }),
      }),
      env,
      ctx
    );
    assertEqual(retrySubmitRes.status, 200, 'Retry submit after ledger recovery must return 200');
    const retrySubmitData = await retrySubmitRes.json();
    assertEqual(retrySubmitData.attempt.status, 'submitted', 'Retry submit must mark attempt submitted');
    assert(retrySubmitData.xpAwarded >= 10, 'Retry submit must award XP after recovery');

    // 7.7 Client submitExamAttempt must throw on failed HTTP response and never fabricate client-side grading
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ ok: false, error: 'Simulated server outage' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      const { submitExamAttempt } = await import('../src/services/examService.ts');
      let threwOnOutage = false;
      try {
        await submitExamAttempt(
          {
            attemptId: 'exatt_outage_test',
            answers: [{ questionId: 'exq_ch1_1', selectedIndex: 1 }],
            durationSecondsUsed: 20,
          },
          txSession
        );
      } catch (err: any) {
        threwOnOutage = true;
        assert(
          err.message.includes('Simulated server outage'),
          'submitExamAttempt should surface server error message on failure'
        );
      }
      assertEqual(
        threwOnOutage,
        true,
        'submitExamAttempt must throw on HTTP error instead of falling back to client-side grading'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    console.log('  ✅ Suite 7 Passed!\n');

    // ============================================================================
    // 🔹 Suite 8: Phase 10B.3 Blueprint Selection, Difficulty Distribution,
    //             Stale Answer Prevention & Score Denominator Reliability
    // ============================================================================
    console.log('🔹 Suite 8: Phase 10B.3 Blueprint Selection, Stale Answer & Score Denominator Integrity');

    // 8.1 Blueprint question selection honors section difficultyMix
    const diffBpRes = await worker.fetch(
      new Request('http://localhost/api/exams/attempts/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          blueprintId: 'bp_comprehensive_arshad',
          idempotencyKey: `diff_mix_test_${Date.now()}`,
        }),
      }),
      env,
      ctx
    );
    assertEqual(diffBpRes.status, 201, 'Starting comprehensive exam should return 201');
    const diffBpData = await diffBpRes.json();
    const sec1Questions = diffBpData.questions.filter((q: any) => q.sectionId === 'sec_general_cognitive');
    assertEqual(sec1Questions.length, 4, 'Section 1 should select exactly 4 questions');

    // Check difficulty distribution: sec_general_cognitive difficultyMix is { easy: 1, medium: 2, hard: 1 }
    const easyCount = sec1Questions.filter((q: any) => q.difficulty === 'easy').length;
    const mediumCount = sec1Questions.filter((q: any) => q.difficulty === 'medium').length;
    const hardCount = sec1Questions.filter((q: any) => q.difficulty === 'hard').length;
    assertEqual(easyCount, 1, 'Section 1 should pick 1 easy question as specified in blueprint difficultyMix');
    assertEqual(mediumCount, 2, 'Section 1 should pick 2 medium questions as specified in blueprint difficultyMix');
    assertEqual(hardCount, 1, 'Section 1 should pick 1 hard question as specified in blueprint difficultyMix');

    // 8.2 Safe and idempotent exam data initialization
    const { D1ExamRepository } = await import('../src/worker/db/examRepository.ts');
    const examRepo = new D1ExamRepository(mockD1);
    await examRepo.ensureTablesAndSeeded();
    await examRepo.ensureTablesAndSeeded();
    const blueprintsAfterReinit = await examRepo.listBlueprints();
    assert(blueprintsAfterReinit.length >= 5, 'ensureTablesAndSeeded must preserve all seeded blueprints idempotently');
    const questionsCountRow = sqlite.prepare('SELECT COUNT(*) as cnt FROM exam_question_bank').get() as { cnt: number };
    assert(questionsCountRow.cnt >= 44, 'ensureTablesAndSeeded must preserve all 44 server pool questions idempotently');

    // 8.3 Prevention of stale / out-of-order answer updates
    const testAttemptId = diffBpData.attempt.id;
    const targetQ = diffBpData.questions[0];
    const t2 = new Date(Date.now() + 2000).toISOString();
    const t1Stale = new Date(Date.now() - 5000).toISOString();

    // First save newer answer at t2 with selectedIndex = 2
    const ansRes1 = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${testAttemptId}/answer`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          questionId: targetQ.id,
          selectedIndex: 2,
          isFlagged: false,
          timeSpentSeconds: 25,
          clientUpdatedAt: t2,
        }),
      }),
      env,
      ctx
    );
    assertEqual(ansRes1.status, 200, 'Saving newer answer at t2 should succeed');
    const ansData1 = await ansRes1.json();
    assertEqual(ansData1.answer.selectedIndex, 2, 'Saved answer at t2 should have selectedIndex 2');

    // Now attempt to save an out-of-order stale update at t1 (t1 < t2) with selectedIndex = 0
    const ansResStale = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${testAttemptId}/answer`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          questionId: targetQ.id,
          selectedIndex: 0,
          isFlagged: true,
          timeSpentSeconds: 10,
          clientUpdatedAt: t1Stale,
        }),
      }),
      env,
      ctx
    );
    assertEqual(ansResStale.status, 200, 'Stale answer request should return 200');
    const ansDataStale = await ansResStale.json();
    assertEqual(
      ansDataStale.answer.selectedIndex,
      2,
      'Stale update must NOT overwrite newer answer; should retain selectedIndex = 2'
    );

    const dbAnswerCheck = sqlite
      .prepare('SELECT selected_index FROM exam_attempt_answers WHERE attempt_id = ? AND question_id = ?')
      .get(testAttemptId, targetQ.id) as { selected_index: number };
    assertEqual(
      dbAnswerCheck.selected_index,
      2,
      'Database must reject stale update and preserve newer choice'
    );

    // 8.4 Reliable score denominators when question pool is incomplete
    const incompleteInput = {
      blueprint: {
        negativeMarking: true,
        negativeWeight: 1 / 3,
        sections: [{ id: 's1', title: 'عمومی', chapterIds: ['ch-1'], questionCount: 10, weight: 1 }],
      },
      questions: [
        { id: 'q1', sectionId: 's1', chapterId: 'ch-1', correctIndex: 1 },
        { id: 'q2', sectionId: 's1', chapterId: 'ch-1', correctIndex: 2 },
      ],
      answersByQuestionId: new Map([
        ['q1', { selectedIndex: 1 }],
        ['q2', { selectedIndex: 0 }],
      ]),
      totalQuestionsDenominator: 10, // Full attempt denominator is 10 even if only 2 loaded
    };
    const incompleteScore = calculateExamScoreAndBreakdown(incompleteInput);
    assertEqual(incompleteScore.totalQuestions, 10, 'Score calculator must use full denominator (10) when questions are incomplete');
    assertEqual(incompleteScore.correctCount, 1, 'Should have 1 correct answer');
    assertEqual(incompleteScore.wrongCount, 1, 'Should have 1 wrong answer');
    assertEqual(incompleteScore.unansweredCount, 8, 'Should correctly identify 8 unanswered questions out of 10');
    // Raw points: 1 - 1/3 = 0.6667. Percent over 10: 6.67%
    assertEqual(incompleteScore.rawScorePercent, 6.67, 'Percentage must be evaluated against full denominator 10 (6.67%)');

    // 8.5 Express store initialization and history limit parity
    const { expressExamStore } = await import('../src/server/examStore.ts');
    await expressExamStore.repo.ensureTablesAndSeeded();
    const expressBlueprints = await expressExamStore.repo.listBlueprints();
    assert(expressBlueprints.length >= 5, 'Express exam store must have parity with Worker blueprints');

    console.log('  ✅ Suite 8 Passed!\n');

    // ============================================================================
    // 🔹 Suite 9: Phase 10B.4 Final Exam Integrity Hardening & Regression Protection
    // ============================================================================
    console.log('🔹 Suite 9: Phase 10B.4 Final Exam Integrity Hardening & Regression Protection');

    // 9.1 P0: Strict Blueprint Scope - zero cross-section & cross-subject substitution
    for (const bp of DEFAULT_EXAM_BLUEPRINTS) {
      const startRes = await worker.fetch(
        new Request('http://localhost/api/exams/attempts/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'http://localhost',
            'X-Guest-Token': guestToken,
          },
          body: JSON.stringify({
            blueprintId: bp.id,
            idempotencyKey: `p0_scope_check_${bp.id}_${Date.now()}`,
          }),
        }),
        env,
        ctx
      );
      assertEqual(startRes.status, 201, `Starting ${bp.id} should return 201`);
      const startData = await startRes.json();
      assertEqual(startData.questions.length, bp.totalQuestions, `Attempt questions count must match blueprint total (${bp.totalQuestions})`);

      const qIdSet = new Set<string>();
      for (const q of startData.questions) {
        assert(!qIdSet.has(q.id), `Question ${q.id} must not appear more than once in the attempt`);
        qIdSet.add(q.id);

        const secDef = bp.sections.find((s: any) => s.id === q.sectionId);
        assert(Boolean(secDef), `Question sectionId ${q.sectionId} must belong to blueprint sections`);
        if (secDef && secDef.chapterIds && secDef.chapterIds.length > 0) {
          assert(
            secDef.chapterIds.includes(q.chapterId),
            `Question ${q.id} (chapter: ${q.chapterId}) must belong strictly to section permitted chapters [${secDef.chapterIds.join(', ')}] - NO CROSS-SECTION FALLBACK`
          );
        }
      }

      // Verify every section received its declared question count and exact difficulty quotas
      for (const sec of bp.sections) {
        const secQuestions = startData.questions.filter((q: any) => q.sectionId === sec.id);
        assertEqual(
          secQuestions.length,
          sec.questionCount,
          `Section ${sec.id} must receive exactly its declared question count (${sec.questionCount})`
        );
        if (sec.difficultyMix) {
          for (const diff of ['easy', 'medium', 'hard'] as const) {
            const expectedQuota = sec.difficultyMix[diff] || 0;
            const actualCount = secQuestions.filter((q: any) => q.difficulty === diff).length;
            assertEqual(
              actualCount,
              expectedQuota,
              `Section ${sec.id} must fulfill exact ${diff} quota (${expectedQuota})`
            );
          }
        }
      }
    }

    // 9.2 Future timestamp guard on saveAnswer
    const futureAttemptRes = await worker.fetch(
      new Request('http://localhost/api/exams/attempts/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          blueprintId: 'bp_timed_speed_drill',
          idempotencyKey: `future_ts_test_${Date.now()}`,
        }),
      }),
      env,
      ctx
    );
    const futureSession = await futureAttemptRes.json();
    const futureQ = futureSession.questions[0];

    // Client sends an untrusted future timestamp (+1 year)
    const spoofedFutureTs = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const futureAnsRes = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${futureSession.attempt.id}/answer`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          questionId: futureQ.id,
          selectedIndex: 1,
          clientUpdatedAt: spoofedFutureTs,
        }),
      }),
      env,
      ctx
    );
    assertEqual(futureAnsRes.status, 200, 'Answer save with spoofed future timestamp should succeed');
    const futureAnsData = await futureAnsRes.json();
    assert(
      new Date(futureAnsData.answer.updatedAt).getTime() < Date.now() + 15000,
      'Server must bound spoofed future updatedAt to near server now, preventing future-timestamp poisoning'
    );
    assertEqual(futureAnsData.answer.revision, 1, 'First answer save must have revision = 1');

    // Subsequent normal save with current timestamp MUST NOT be rejected as stale
    const validNextTs = new Date().toISOString();
    const nextAnsRes = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${futureSession.attempt.id}/answer`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          questionId: futureQ.id,
          selectedIndex: 3,
          clientUpdatedAt: validNextTs,
        }),
      }),
      env,
      ctx
    );
    assertEqual(nextAnsRes.status, 200, 'Subsequent legitimate answer save should succeed');
    const nextAnsData = await nextAnsRes.json();
    assertEqual(nextAnsData.answer.selectedIndex, 3, 'Legitimate subsequent answer must update selectedIndex');
    assertEqual(nextAnsData.answer.revision, 2, 'Monotonic revision must increment to 2');

    // 9.3 Idempotency collision on finalized attempt returns 409
    const finalizedIdemKey = `idem_finalized_test_${Date.now()}`;
    const firstStart = await worker.fetch(
      new Request('http://localhost/api/exams/attempts/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          blueprintId: 'bp_timed_speed_drill',
          idempotencyKey: finalizedIdemKey,
        }),
      }),
      env,
      ctx
    );
    assertEqual(firstStart.status, 201, 'First start should return 201');
    const firstSession = await firstStart.json();

    // Submit and finalize the attempt
    const submitFinRes = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${firstSession.attempt.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({ answers: [], durationSecondsUsed: 10 }),
      }),
      env,
      ctx
    );
    assertEqual(submitFinRes.status, 200, 'Submit must succeed');

    // Attempting to call startAttempt with the same idempotency key after finalization must return 409 Conflict
    const secondStartSameKey = await worker.fetch(
      new Request('http://localhost/api/exams/attempts/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          blueprintId: 'bp_timed_speed_drill',
          idempotencyKey: finalizedIdemKey,
        }),
      }),
      env,
      ctx
    );
    assertEqual(secondStartSameKey.status, 409, 'Starting attempt with finalized idempotency key must return 409 Conflict');

    // 9.4 Section-level score denominator reliability when questions are incomplete
    const secIncompleteInput = {
      blueprint: {
        negativeMarking: true,
        negativeWeight: 1 / 3,
        sections: [
          { id: 's1', title: 'بخش بالینی', chapterIds: ['ch-18'], questionCount: 5, weight: 2 },
          { id: 's2', title: 'بخش شناختی', chapterIds: ['ch-8'], questionCount: 5, weight: 1 },
        ],
      },
      questions: [
        { id: 'q_s1_1', sectionId: 's1', chapterId: 'ch-18', correctIndex: 0 },
        { id: 'q_s1_2', sectionId: 's1', chapterId: 'ch-18', correctIndex: 1 },
      ],
      answersByQuestionId: new Map([
        ['q_s1_1', { selectedIndex: 0 }], // correct
        ['q_s1_2', { selectedIndex: 2 }], // wrong
      ]),
      totalQuestionsDenominator: 10,
    };
    const secBreakdownScore = calculateExamScoreAndBreakdown(secIncompleteInput);
    assertEqual(secBreakdownScore.sectionBreakdown[0].totalQuestions, 5, 'Section 1 total questions must equal declared denominator 5');
    assertEqual(secBreakdownScore.sectionBreakdown[0].correctCount, 1, 'Section 1 correct count is 1');
    assertEqual(secBreakdownScore.sectionBreakdown[0].wrongCount, 1, 'Section 1 wrong count is 1');
    assertEqual(secBreakdownScore.sectionBreakdown[0].unansweredCount, 3, 'Section 1 unanswered count must be 3 out of 5');
    // Net: 1 - 1/3 = 0.6667. Over 5: 13.33%
    assertEqual(secBreakdownScore.sectionBreakdown[0].rawScorePercent, 13.33, 'Section 1 percentage must be calculated against declared denominator 5 (13.33%)');

    console.log('  ✅ Suite 9 Passed!\n');

    // ============================================================================
    // 🔹 Suite 10: Phase 10B.6 Controlled End-to-End Exam Acceptance Testing
    // ============================================================================
    console.log('🔹 Suite 10: Phase 10B.6 Controlled End-to-End Exam Acceptance Testing');

    // 10.1 Complete End-to-End Exam Lifecycle (Catalog -> Start -> Active -> Answer -> Submit -> Review -> History)
    const bpListRes = await worker.fetch(
      new Request('http://localhost/api/exams/blueprints', {
        method: 'GET',
        headers: { Origin: 'http://localhost' },
      }),
      env,
      ctx
    );
    assertEqual(bpListRes.status, 200, 'GET /api/exams/blueprints must return 200 OK');
    const bpListData = await bpListRes.json();
    assert(Array.isArray(bpListData.blueprints) && bpListData.blueprints.length >= 5, 'Must return at least 5 blueprints');

    const testBp = bpListData.blueprints[0];
    const e2eIdemKey = `e2e_acceptance_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const startE2eRes = await worker.fetch(
      new Request('http://localhost/api/exams/attempts/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          blueprintId: testBp.id,
          idempotencyKey: e2eIdemKey,
        }),
      }),
      env,
      ctx
    );
    assertEqual(startE2eRes.status, 201, 'Starting e2e attempt should return 201 Created');
    const startE2eData = await startE2eRes.json();
    const e2eAttemptId = startE2eData.attempt.id;
    assertEqual(startE2eData.attempt.status, 'in_progress', 'New attempt must have in_progress status');
    assertEqual(startE2eData.questions.length, testBp.totalQuestions, 'Must receive exact blueprint question count');

    // 10.2 Strict Privacy Invariant: Active attempt questions NEVER leak correctIndex or explanation
    for (const q of startE2eData.questions) {
      assert(
        !('correctIndex' in q) && (q as any).correctIndex === undefined,
        `Question ${q.id} must NEVER expose correctIndex during active exam`
      );
      assert(
        !('explanation' in q) && (q as any).explanation === undefined,
        `Question ${q.id} must NEVER expose explanation during active exam`
      );
    }

    // 10.3 Progression, Monotonic Revision & Answer Saving
    const q1 = startE2eData.questions[0];
    const q2 = startE2eData.questions[1];

    const s10Ans1Res = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${e2eAttemptId}/answer`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          questionId: q1.id,
          selectedIndex: 1,
          isFlagged: false,
          timeSpentSeconds: 15,
        }),
      }),
      env,
      ctx
    );
    assertEqual(s10Ans1Res.status, 200, 'Answer Q1 must return 200 OK');
    const s10Ans1Data = await s10Ans1Res.json();
    assertEqual(s10Ans1Data.answer.revision, 1, 'Initial answer revision must be 1');
    assertEqual(s10Ans1Data.answer.selectedIndex, 1, 'Selected index must be 1');

    // Answer Q2 with flag
    const s10Ans2Res = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${e2eAttemptId}/answer`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          questionId: q2.id,
          selectedIndex: 2,
          isFlagged: true,
          timeSpentSeconds: 20,
        }),
      }),
      env,
      ctx
    );
    assertEqual(s10Ans2Res.status, 200, 'Answer Q2 must return 200 OK');
    const s10Ans2Data = await s10Ans2Res.json();
    assertEqual(s10Ans2Data.answer.isFlagged, true, 'Q2 must be flagged');

    // Update Q1 again - revision must increment monotonically
    const s10Ans1UpdateRes = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${e2eAttemptId}/answer`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          questionId: q1.id,
          selectedIndex: 3,
          isFlagged: true,
          timeSpentSeconds: 30,
        }),
      }),
      env,
      ctx
    );
    assertEqual(s10Ans1UpdateRes.status, 200, 'Updating Q1 must return 200 OK');
    const s10Ans1UpdateData = await s10Ans1UpdateRes.json();
    assertEqual(s10Ans1UpdateData.answer.revision, 2, 'Updated answer revision must increment to 2');
    assertEqual(s10Ans1UpdateData.answer.selectedIndex, 3, 'Updated selected index must be 3');

    // 10.4 Submission, Authoritative Scoring & Review Payload
    const s10SubmitRes = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${e2eAttemptId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
        body: JSON.stringify({
          durationSecondsUsed: 120,
        }),
      }),
      env,
      ctx
    );
    assertEqual(s10SubmitRes.status, 200, 'Submit attempt must return 200 OK');
    const s10SubmitData = await s10SubmitRes.json();
    assertEqual(s10SubmitData.attempt.status, 'submitted', 'Attempt status must now be submitted');
    assert(typeof s10SubmitData.attempt.rawScorePercent === 'number', 'Raw score percent must be a number');
    assert(typeof s10SubmitData.attempt.weightedScorePercent === 'number', 'Weighted score percent must be a number');
    assert(Array.isArray(s10SubmitData.attempt.sectionBreakdown), 'Section breakdown must be an array');

    // Invariant: Review questions NOW legitimately contain correctIndex and explanation
    for (const rq of s10SubmitData.questions) {
      assert(
        typeof rq.correctIndex === 'number',
        `Review question ${rq.id} must contain authoritative correctIndex`
      );
      assert(
        typeof rq.explanation === 'string' && rq.explanation.length > 0,
        `Review question ${rq.id} must contain academic explanation`
      );
    }

    // 10.5 Fetch Review & History Parity
    const s10GetReviewRes = await worker.fetch(
      new Request(`http://localhost/api/exams/attempts/${e2eAttemptId}`, {
        method: 'GET',
        headers: {
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
      }),
      env,
      ctx
    );
    assertEqual(s10GetReviewRes.status, 200, 'GET submitted attempt review must return 200 OK');
    const s10GetReviewData = await s10GetReviewRes.json();
    assertEqual(s10GetReviewData.mode, 'submitted', 'Mode must be submitted');
    assertEqual(s10GetReviewData.attempt.id, e2eAttemptId, 'Review attempt ID must match');

    const s10HistoryRes = await worker.fetch(
      new Request('http://localhost/api/exams/history', {
        method: 'GET',
        headers: {
          Origin: 'http://localhost',
          'X-Guest-Token': guestToken,
        },
      }),
      env,
      ctx
    );
    assertEqual(s10HistoryRes.status, 200, 'GET exam history must return 200 OK');
    const s10HistoryData = await s10HistoryRes.json();
    assert(s10HistoryData.stats.totalCompletedExams >= 1, 'Total completed exams must be at least 1');
    const foundAttempt = s10HistoryData.attempts.find((a: any) => a.id === e2eAttemptId);
    assert(Boolean(foundAttempt), 'Submitted attempt must appear in user exam history');

    // 10.6 Express Database Persistence Across Restarts (Using Isolated Temp SQLite File)
    const { ExpressExamStore } = await import('../src/server/examStore.ts');

    const tempDbPath = path.join(
      os.tmpdir(),
      `psychomaster_express_persistence_test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.sqlite`
    );

    try {
      const expressStore1 = new ExpressExamStore(tempDbPath);
      await expressStore1.repo.ensureTablesAndSeeded();

      // Verify indexes in fresh isolated SQLite
      const createdIndexes = (expressStore1 as any).sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all()
        .map((r: any) => r.name);
      assert(
        createdIndexes.includes('idx_exam_attempts_idempotency'),
        'Fresh SQLite DB must contain idx_exam_attempts_idempotency'
      );
      assert(
        createdIndexes.includes('idx_exam_attempts_user_status'),
        'Fresh SQLite DB must contain idx_exam_attempts_user_status'
      );

      const expUserId = `exp_persist_user_${Date.now()}`;
      expressStore1.ensureUserMirror({ userId: expUserId, name: 'کاربر تستی اکسپرس' });

      const expStartRes = await expressStore1.repo.startAttempt({
        userId: expUserId,
        blueprintId: 'bp_timed_speed_drill',
        idempotencyKey: `exp_persist_idem_${Date.now()}`,
      });
      assert(expStartRes.ok, 'Express repo startAttempt must succeed');
      const expAttempt = (expStartRes as any).data.attempt;
      const expQ1 = (expStartRes as any).data.questions[0];

      await expressStore1.repo.saveAnswer({
        attemptId: expAttempt.id,
        userId: expUserId,
        questionId: expQ1.id,
        selectedIndex: 0,
        isFlagged: true,
        timeSpentSeconds: 12,
      });

      const expSubmitRes = await expressStore1.repo.submitAttempt({
        attemptId: expAttempt.id,
        userId: expUserId,
        durationSecondsUsed: 45,
      });
      assert(expSubmitRes.ok, 'Express repo submitAttempt must succeed');

      // Simulate Express server restart by closing db handle
      expressStore1.close();

      // Reopen fresh ExpressExamStore on the exact same database file
      const expressStore2 = new ExpressExamStore(tempDbPath);
      const reloadedAttemptRes = await expressStore2.repo.getAttemptForUser(expAttempt.id, expUserId);
      assert(reloadedAttemptRes.ok, 'Attempt must survive Express server restart');
      assertEqual((reloadedAttemptRes as any).mode, 'submitted', 'Attempt status must remain submitted');
      assertEqual((reloadedAttemptRes as any).data.attempt.id, expAttempt.id, 'Reloaded attempt ID must match');

      const reloadedHistory = await expressStore2.repo.getUserExamHistory(expUserId);
      assertEqual(reloadedHistory.stats.totalCompletedExams, 1, 'Exam history must persist across restart');

      expressStore2.close();
    } finally {
      try {
        if (fs.existsSync(tempDbPath)) {
          fs.unlinkSync(tempDbPath);
        }
      } catch {
        // Ignore unlink error
      }
    }

    // ============================================================================
    // 🔹 Suite 11: Phase 10C.2A Reward Consistency, Persistence & Stage 100 Chest
    // ============================================================================
    console.log('🔹 Suite 11: Phase 10C.2A Reward Consistency, Persistence & Stage 100 Chest');

    async function createGuestSession(userId: string): Promise<string> {
      const syncRes = await worker.fetch(
        new Request('http://localhost/api/user/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
          body: JSON.stringify({ userId, name: 'کاربر تست' }),
        }),
        env,
        ctx
      );
      const syncData = await syncRes.json();
      return syncData.guestToken;
    }

    // 11.1 Standalone quiz XP agreement across persisted balance and leaderboard
    const quizUserToken = await createGuestSession('usr_quiz_test');
    const quizUserXpRes1 = await worker.fetch(
      new Request('http://localhost/api/leaderboard?userId=usr_quiz_test', {
        method: 'GET',
        headers: { Origin: 'http://localhost', 'X-Guest-Token': quizUserToken },
      }),
      env,
      ctx
    );
    assertEqual(quizUserXpRes1.status, 200, 'GET leaderboard for quiz user should succeed');
    const quizUserLeaderboard1 = await quizUserXpRes1.json();
    const initRankEntry1 = quizUserLeaderboard1.leaderboard.find((e: any) => e.isCurrentUser);
    assert(Boolean(initRankEntry1), 'Current user entry must be identified when valid guest session provided');
    const initialUserXp = initRankEntry1.xp;

    // Submit a valid standalone quiz answer (+15 XP)
    const quizSubmitRes = await worker.fetch(
      new Request('http://localhost/api/leaderboard/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'X-Guest-Token': quizUserToken },
        body: JSON.stringify({
          userId: 'usr_quiz_test',
          rewardType: 'quiz_answer',
          chapterId: 'ch-1',
          questionId: 'q-1-1',
          userAnswer: 1,
          isCorrect: true,
          streakDays: 1,
        }),
      }),
      env,
      ctx
    );
    assertEqual(quizSubmitRes.status, 200, 'Submitting quiz answer must succeed');
    const quizSubmitData = await quizSubmitRes.json();
    assertEqual(quizSubmitData.applied, true, 'First submission must be applied');
    assertEqual(quizSubmitData.updatedXp, initialUserXp + 10, 'Updated XP must reflect exact +10 XP credit');

    // Fetch leaderboard again and assert agreement
    const quizUserXpRes2 = await worker.fetch(
      new Request('http://localhost/api/leaderboard?userId=usr_quiz_test', {
        method: 'GET',
        headers: { Origin: 'http://localhost', 'X-Guest-Token': quizUserToken },
      }),
      env,
      ctx
    );
    const quizUserLeaderboard2 = await quizUserXpRes2.json();
    const updatedRankEntry = quizUserLeaderboard2.leaderboard.find((e: any) => e.isCurrentUser);
    assertEqual(updatedRankEntry.xp, initialUserXp + 10, 'Leaderboard XP must match updated user balance');

    // 11.2 Replay reward eligibility, displayed value, actual credit, and duplicate prevention
    const retryQuizSubmitRes = await worker.fetch(
      new Request('http://localhost/api/leaderboard/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'X-Guest-Token': quizUserToken },
        body: JSON.stringify({
          userId: 'usr_quiz_test',
          rewardType: 'quiz_answer',
          chapterId: 'ch-1',
          questionId: 'q-1-1',
          userAnswer: 1,
          isCorrect: true,
          streakDays: 1,
        }),
      }),
      env,
      ctx
    );
    assertEqual(retryQuizSubmitRes.status, 200, 'Duplicate submission must return 200 OK');
    const retryData = await retryQuizSubmitRes.json();
    assertEqual(retryData.alreadyClaimed, true, 'Retry must be marked as already claimed');
    assertEqual(retryData.applied, false, 'Retry must NOT apply new XP credit');
    assertEqual(retryData.updatedXp, initialUserXp + 10, 'XP balance must remain unchanged');

    // 11.3 Correct achievement triggers for lesson vs quiz vs chapter events
    const { evaluateBadgeProgress, BADGE_DEFINITIONS } = await import('../src/data/badgeDefinitions.ts');
    const firstQuizBadge = BADGE_DEFINITIONS.find((b) => b.id === 'badge-first-quiz')!;

    const { getDefaultUserProgress } = await import('../src/utils/storage.ts');
    const chapterDoneOnlyProgress = {
      ...getDefaultUserProgress(),
      completedChapters: ['ch-1'],
      quizHistory: [{
        chapterId: 'stage_1',
        questionId: 'stage-1',
        isCorrect: true,
        userAnswer: 'passed',
        timestamp: Date.now(),
        timeSpentSeconds: 60,
        difficulty: 'basic' as const,
      }],
    };
    const chapterBadgeEval = evaluateBadgeProgress(firstQuizBadge, chapterDoneOnlyProgress, []);
    assertEqual(chapterBadgeEval.isUnlocked, false, 'Textbook chapter completion must NOT unlock First Quiz Spark badge');

    const realQuizProgress = {
      ...chapterDoneOnlyProgress,
      quizHistory: [{
        chapterId: 'ch-1',
        questionId: 'q-1-1',
        isCorrect: true,
        userAnswer: 1,
        timestamp: Date.now(),
        timeSpentSeconds: 15,
        difficulty: 'basic' as const,
      }],
    };
    const realQuizBadgeEval = evaluateBadgeProgress(firstQuizBadge, realQuizProgress, []);
    assertEqual(realQuizBadgeEval.isUnlocked, true, 'Answering actual quiz question MUST unlock First Quiz Spark badge');

    // 11.4 First-lesson achievement reward semantics (+50 XP for First Quiz Spark)
    const badgeUnlockRes = await worker.fetch(
      new Request('http://localhost/api/leaderboard/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'X-Guest-Token': quizUserToken },
        body: JSON.stringify({
          userId: 'usr_quiz_test',
          rewardType: 'badge_unlock',
          badgeId: 'badge-first-quiz',
          streakDays: 1,
        }),
      }),
      env,
      ctx
    );
    assertEqual(badgeUnlockRes.status, 200, 'Submitting badge_unlock must succeed');
    const badgeUnlockData = await badgeUnlockRes.json();
    assertEqual(badgeUnlockData.applied, true, 'Badge unlock reward must be applied');
    assertEqual(badgeUnlockData.updatedXp, initialUserXp + 10 + 50, 'XP balance must credit advertised +50 XP badge reward');

    // 11.5 Stage 100 claim rejection when prerequisites are unmet
    const { stageExecutionEngine } = await import('../src/services/stageExecutionEngine.ts');
    const emptyStagesProgress = { ...getDefaultUserProgress(), completedStages: {} };
    const stage100Prereq = stageExecutionEngine.isStagePrerequisiteMet(100, emptyStagesProgress.completedStages);
    assertEqual(stage100Prereq.isMet, false, 'Stage 100 prerequisites must NOT be met when prior stages are incomplete');
    assertEqual(stage100Prereq.missingStageNumber, 1, 'Missing stage number must be stage 1 when no stages are completed');

    // 11.6 Exactly-once +150 diamond credit for an eligible chest claim & persistence after reload
    const allStagesDoneMap: Record<number, any> = {};
    for (let i = 1; i <= 100; i++) {
      allStagesDoneMap[i] = {
        stageNumber: i,
        completedAt: new Date().toISOString(),
        stars: 3,
        score: 5,
        totalQuestions: 5,
        xpEarned: 50,
        verified: true,
        source: 'online-verified',
      };
    }
    const eligible100Progress = {
      ...getDefaultUserProgress(),
      diamonds: 480,
      claimedStageChests: [],
      completedStages: allStagesDoneMap,
    };
    const stage100EligiblePrereq = stageExecutionEngine.isStagePrerequisiteMet(100, eligible100Progress.completedStages);
    assertEqual(stage100EligiblePrereq.isMet, true, 'Stage 100 prerequisites MUST be met when stages 1-99 are completed');

    const {
      saveUserProgress,
      loadUserProgress,
      calculateAuthoritativeUserXp,
      recordDailyXpActivity,
      applyStandaloneQuizAnswerToProgress,
      applyStageCompletionToProgress,
      claimStageChestReward,
      recordPomodoroSessionCompletion,
    } = await import('../src/utils/storage.ts');

    const chestClaimRes1 = claimStageChestReward(eligible100Progress, 100);
    assertEqual(chestClaimRes1.claimed, true, 'Eligible stage 100 chest claim must apply');
    assertEqual(chestClaimRes1.diamondsAwarded, 150, 'Stage 100 chest must credit exactly 150 diamonds');
    assertEqual(chestClaimRes1.progress.diamonds, 630, 'Diamond balance must increase from 480 to 630');
    assert(Boolean(chestClaimRes1.progress.claimedStageChests?.includes(100)), 'Stage 100 chest must be recorded in claimedStageChests');

    // Duplicate claim protection
    const chestClaimResDuplicate = claimStageChestReward(chestClaimRes1.progress, 100);
    assertEqual(chestClaimResDuplicate.claimed, false, 'Repeated stage 100 chest claim must be rejected');
    assertEqual(chestClaimResDuplicate.alreadyClaimed, true, 'Repeated stage 100 chest claim must set alreadyClaimed = true');
    assertEqual(chestClaimResDuplicate.diamondsAwarded, 0, 'Duplicate chest claim must credit 0 diamonds');
    assertEqual(chestClaimResDuplicate.progress.diamonds, 630, 'Diamond balance must remain 630 after duplicate claim attempt');

    saveUserProgress(chestClaimRes1.progress, 'usr_chest_test');
    const reloadedChestProgress = loadUserProgress('usr_chest_test');
    assertEqual(reloadedChestProgress.diamonds, 630, 'Reloaded diamond balance must remain 630');
    assert(Boolean(reloadedChestProgress.claimedStageChests?.includes(100)), 'Reloaded claimedStageChests must include stage 100');

    // 11.7 Exactly-once Pomodoro completion persistence and total study time after reload
    const pomoBaseProgress = {
      ...getDefaultUserProgress(),
      totalStudyMinutes: 45,
      pomodoroHistory: [],
    };
    const pomoRes1 = recordPomodoroSessionCompletion(pomoBaseProgress, {
      sessionId: 'pomo_test_1',
      chapterId: 'ch-1',
      seconds: 25 * 60,
    });
    assertEqual(pomoRes1.applied, true, '25-min Pomodoro session must be recorded');
    assertEqual(pomoRes1.progress.totalStudyMinutes, 70, 'Total study time must increase from 45 to 70 after 25min Pomodoro');

    // Duplicate session ID must not double-count
    const pomoResDuplicate = recordPomodoroSessionCompletion(pomoRes1.progress, {
      sessionId: 'pomo_test_1',
      chapterId: 'ch-1',
      seconds: 25 * 60,
    });
    assertEqual(pomoResDuplicate.applied, false, 'Duplicate Pomodoro session ID must not be applied again');
    assertEqual(pomoResDuplicate.progress.totalStudyMinutes, 70, 'Total study time must remain 70 on duplicate Pomodoro submission');

    // Incomplete session (< 60s) must not count
    const pomoResIncomplete = recordPomodoroSessionCompletion(pomoRes1.progress, {
      sessionId: 'pomo_incomplete_1',
      chapterId: 'ch-1',
      seconds: 30,
    });
    assertEqual(pomoResIncomplete.applied, false, 'Incomplete Pomodoro session (< 60s) must not be counted');
    assertEqual(pomoResIncomplete.progress.totalStudyMinutes, 70, 'Total study time must remain 70 after incomplete session');

    saveUserProgress(pomoRes1.progress, 'usr_pomo_test');
    const reloadedPomoProgress = loadUserProgress('usr_pomo_test');
    assertEqual(reloadedPomoProgress.totalStudyMinutes, 70, 'Reloaded study time must remain 70 minutes');
    assertEqual(reloadedPomoProgress.pomodoroHistory?.length, 1, 'Reloaded pomodoroHistory must contain 1 session');

    console.log('  ✅ Suite 11 Passed!\n');

    // =========================================================================
    // SUITE 12: Phase 10C.2B Behavioral Verification & 18-Scenario Regression
    // =========================================================================
    console.log('📋 Suite 12: Phase 10C.2B Behavioral Verification & 18-Scenario Regression...');

    const readSrcFile = (relPath: string) =>
      fs.readFileSync(path.resolve(process.cwd(), 'src', relPath), 'utf-8');

    // --- Defect 2A: Sound-setting synchronization ---
    const {
      getAudioMuted,
      isSoundEnabled,
      setAudioMuted,
      setSoundEnabled,
      playDuoSound,
      getAudioPlaybackStats,
      resetAudioPlaybackStats,
    } = await import('../src/utils/duoAudio.ts');

    // Ensure default user progress exists in localStorage before testing sync
    saveUserProgress(getDefaultUserProgress());
    resetAudioPlaybackStats();
    setSoundEnabled(false);
    assertEqual(isSoundEnabled(), false, '2A: setSoundEnabled(false) must set soundEnabled to false');
    assertEqual(getAudioMuted(), true, '2A: setSoundEnabled(false) must synchronize header getAudioMuted() to true');
    const reloadedSoundOffProgress = loadUserProgress();
    assertEqual(
      reloadedSoundOffProgress.customSettings.soundEnabled,
      false,
      '2A: Muting sound must persist customSettings.soundEnabled = false in storage'
    );
    const playedWhileMuted = playDuoSound('correct');
    assertEqual(playedWhileMuted, false, '2A: playDuoSound must return false and not play when muted');
    assertEqual(getAudioPlaybackStats().playedSoundCount, 0, '2A: playedSoundCount must remain 0 when muted');

    setAudioMuted(false);
    assertEqual(getAudioMuted(), false, '2A: setAudioMuted(false) from header control must unmute audio');
    assertEqual(isSoundEnabled(), true, '2A: setAudioMuted(false) must synchronize Settings isSoundEnabled() to true');
    const reloadedSoundOnProgress = loadUserProgress();
    assertEqual(
      reloadedSoundOnProgress.customSettings.soundEnabled,
      true,
      '2A: Unmuting from header must persist customSettings.soundEnabled = true across reloads'
    );

    // --- Defect 2B: Reader font-size controls ---
    const {
      normalizeReaderFontSize,
      stepReaderFontSize,
      resolveReaderFontSizeSpec,
    } = await import('../src/components/BookReaderView.tsx');
    const cssSource = readSrcFile('index.css');
    assert(
      !cssSource.includes('.prose-persian {\n  line-height: 2.05;\n  text-align: justify;\n  font-size: 1.025rem;\n}'),
      '2B: .prose-persian must not hardcode font-size: 1.025rem overriding reader font-size controls'
    );
    assert(
      cssSource.includes('.prose-persian[data-reader-font-size="lg"]') &&
        cssSource.includes('.prose-persian[data-reader-font-size="xl"]'),
      '2B: index.css must define explicit font-size rules for data-reader-font-size sm, md, lg, xl'
    );
    const initialReaderSize = normalizeReaderFontSize('md');
    const enlargedSize1 = stepReaderFontSize(initialReaderSize, 'increase');
    const enlargedSize2 = stepReaderFontSize(enlargedSize1, 'increase');
    const reducedSize = stepReaderFontSize(enlargedSize2, 'decrease');
    assertEqual(enlargedSize1, 'lg', '2B: Clicking A+ from md must step font size to lg');
    assertEqual(enlargedSize2, 'xl', '2B: Clicking A+ from lg must step font size to xl');
    assertEqual(reducedSize, 'lg', '2B: Clicking A- from xl must step font size back to lg');
    assert(
      resolveReaderFontSizeSpec('xl').pxValue > resolveReaderFontSizeSpec('lg').pxValue &&
        resolveReaderFontSizeSpec('lg').pxValue > resolveReaderFontSizeSpec('md').pxValue &&
        resolveReaderFontSizeSpec('md').pxValue > resolveReaderFontSizeSpec('sm').pxValue,
      '2B: Reader font-size px values must strictly increase sm < md < lg < xl'
    );

    // --- Defect 2C: Exercise-type filtering ---
    const {
      normalizeExerciseFilterType,
      isGenuineExerciseOfType,
      filterQuestionsByExerciseType,
    } = await import('../src/components/QuizCenterView.tsx');
    const { psychologySections } = await import('../src/data/psychologyCurriculum.ts');
    const allCurriculumQuestions = psychologySections.flatMap((s) =>
      s.chapters.flatMap((c) => c.questions)
    );

    assertEqual(
      normalizeExerciseFilterType('sentence-ordering'),
      'sentence_order',
      '2C: sentence-ordering alias must normalize to sentence_order'
    );
    assertEqual(
      normalizeExerciseFilterType('sentence-arrangement'),
      'sentence_order',
      '2C: sentence-arrangement alias must normalize to sentence_order'
    );

    const sentenceOrderingFiltered = filterQuestionsByExerciseType(
      allCurriculumQuestions,
      'sentence-ordering'
    );
    assert(
      sentenceOrderingFiltered.length >= 2,
      '2C: Filtering by sentence-ordering must return genuine sentence_order exercises'
    );
    assert(
      sentenceOrderingFiltered.every(
        (q) =>
          q.type === 'sentence_order' &&
          Array.isArray(q.sentenceTokens) &&
          q.sentenceTokens.length >= 2 &&
          !q.text.includes('SSRI')
      ),
      '2C: sentence-ordering filter must NEVER return matching-pairs or unrelated SSRI multiple-choice questions'
    );

    const sentenceArrangementFiltered = filterQuestionsByExerciseType(
      allCurriculumQuestions,
      'sentence-arrangement'
    );
    assertEqual(
      sentenceArrangementFiltered.length,
      sentenceOrderingFiltered.length,
      '2C: sentence-arrangement and sentence-ordering must return the exact same genuine sentence_order pool'
    );
    assert(
      sentenceArrangementFiltered.every((q) => isGenuineExerciseOfType(q, 'sentence_order')),
      '2C: sentence-arrangement must only return genuine sentence_order exercises'
    );

    const matchingFiltered = filterQuestionsByExerciseType(allCurriculumQuestions, 'matching');
    assert(
      matchingFiltered.length > 0 &&
        matchingFiltered.every((q) => isGenuineExerciseOfType(q, 'match_pairs')),
      '2C: matching filter must return only genuine matching-pairs exercises'
    );

    const caseFiltered = filterQuestionsByExerciseType(allCurriculumQuestions, 'case_based');
    assert(
      caseFiltered.length > 0 &&
        caseFiltered.every((q) => isGenuineExerciseOfType(q, 'case_study')),
      '2C: case_based filter must return only genuine clinical case exercises'
    );

    const fillBlankFiltered = filterQuestionsByExerciseType(allCurriculumQuestions, 'fill_blank');
    assert(
      fillBlankFiltered.length > 0 &&
        fillBlankFiltered.every((q) => isGenuineExerciseOfType(q, 'fill_blank')),
      '2C: fill_blank filter must return only genuine fill-in-the-blank exercises'
    );

    // Empty-pool truthful behavior (no fallback to unrelated exercise types)
    const emptyPoolResult = filterQuestionsByExerciseType(
      matchingFiltered,
      'sentence-ordering'
    );
    assertEqual(
      emptyPoolResult.length,
      0,
      '2C: When no exercises match the selected type, filterQuestionsByExerciseType must return [] rather than substituting unrelated exercises'
    );

    // --- Defect 2D: Persian search normalization ---
    const {
      normalizePersianSearchText,
      matchesNormalizedPersianQuery,
    } = await import('../src/utils/persianDigits.ts');
    const { searchCurriculumChapters } = await import('../src/components/AdvancedSearchModal.tsx');

    // Half-space (ZWNJ) vs ordinary space in both directions for "روان‌شناسی" / "روان شناسی" and "معرفت‌شناسی" / "معرفت شناسی"
    const searchWithSpace = searchCurriculumChapters(psychologySections, 'روان شناسی');
    const searchWithZwnj = searchCurriculumChapters(psychologySections, 'روان‌شناسی');
    const searchCompound = searchCurriculumChapters(psychologySections, 'روانشناسی');
    assert(searchWithSpace.length > 0, '2D: Searching with normal space "روان شناسی" must find lessons');
    assertEqual(
      searchWithSpace.map((c) => c.id).join(','),
      searchWithZwnj.map((c) => c.id).join(','),
      '2D: Searching with normal space and Persian half-space (ZWNJ) must return identical results'
    );
    assert(
      searchCompound.length >= 8 && searchCompound.some((c) => c.id === 'ch-1'),
      '2D: Searching compound "روانشناسی" without space must match ZWNJ-indexed lessons'
    );

    const searchEpistemologySpace = searchCurriculumChapters(
      psychologySections,
      'فلسفه علم و مبانی معرفت شناسی در روان شناسی'
    );
    assert(
      searchEpistemologySpace.some((c) => c.id === 'ch-2'),
      '2D: Searching "فلسفه علم و مبانی معرفت شناسی در روان شناسی" with normal spaces must find ch-2'
    );

    // Arabic yeh/kaf variants ('روانشناسي و معرفت شناسي')
    const searchArabicVariants = searchCurriculumChapters(
      psychologySections,
      'معرفت شناسي و روانشناسي'
    );
    assert(
      searchArabicVariants.some((c) => c.id === 'ch-2'),
      '2D: Searching with Arabic Yeh/Kaf variants must find ch-2'
    );

    // English term search
    const searchEnglishTerm = searchCurriculumChapters(psychologySections, 'Falsifiability');
    assert(
      searchEnglishTerm.some((c) => c.id === 'ch-2'),
      '2D: Searching English term "Falsifiability" must find ch-2'
    );
    assert(
      matchesNormalizedPersianQuery('روان‌شناسی شناختی', 'روان شناسي شناختي'),
      '2D: matchesNormalizedPersianQuery must match ZWNJ text against space + Arabic yeh query'
    );
    assertEqual(
      normalizePersianSearchText('روان‌شناسي'),
      'روان شناسی',
      '2D: normalizePersianSearchText must unify ZWNJ and Arabic yeh'
    );

    // --- Defect 2E & 2F: User Panel loading/retry/navigation & Dashboard Achievements entry ---
    const errorBoundarySource = readSrcFile('components/OfflineSafeErrorBoundary.tsx');
    assert(
      errorBoundarySource.includes('resetKey') && errorBoundarySource.includes('بازگشت به خانه'),
      '2E: OfflineSafeErrorBoundary must reset automatically on navigation (resetKey) and provide a direct Home button'
    );
    const userPanelSource = readSrcFile('components/UserPanelView.tsx');
    assert(
      userPanelSource.includes('loadExamHistory') && userPanelSource.includes('examHistoryError'),
      '2E: UserPanelView must isolate exam history errors and provide retry without crashing overview metrics'
    );
    const dashboardSource = readSrcFile('components/DashboardView.tsx');
    assert(
      dashboardSource.includes('مشاهده همه دستاوردها') && dashboardSource.includes('onOpenBadges'),
      '2F: DashboardView must wire "مشاهده همه دستاوردها" to onOpenBadges'
    );

    // --- Reward Audit Item 2 & 3: Daily XP mission progression & persistence ---
    const missionProg = getDefaultUserProgress();
    assertEqual(missionProg.dailyXp, 0, 'Daily XP must start at 0 on fresh progress');
    assertEqual(missionProg.dailyMissionCompleted, false, 'Daily mission must start incomplete');

    // Standalone quiz completion advances daily XP
    const afterQuiz1 = applyStandaloneQuizAnswerToProgress(missionProg, {
      chapterId: 'ch-1',
      questionId: 'q-1-1',
      isCorrect: true,
      userAnswer: 1,
      timeSpentSeconds: 12,
      difficulty: 'basic',
    });
    assertEqual(afterQuiz1.xpAwarded, 10, 'q-1-1 must grant 10 XP');
    assertEqual(afterQuiz1.progress.dailyXp, 10, 'Standalone quiz must advance dailyXp by 10');
    assertEqual(afterQuiz1.progress.dailyMissionCompleted, false, 'Daily mission (target 50) must still be incomplete at 10 XP');

    // Stage 1 completion (+25 XP -> 35/50)
    const afterStage1 = applyStageCompletionToProgress(afterQuiz1.progress, {
      stageNumber: 1,
      completedAt: new Date().toISOString(),
      stars: 3,
      score: 10,
      totalQuestions: 10,
      xpEarned: 25,
      verified: true,
      source: 'online-verified',
    });
    assertEqual(afterStage1.xpAwarded, 25, 'First completion of Stage 1 must credit 25 XP');
    assertEqual(afterStage1.progress.dailyXp, 35, 'Daily XP must advance to 35 after Stage 1');
    assertEqual(afterStage1.progress.dailyMissionCompleted, false, 'Daily mission must still be incomplete at 35/50 XP');

    // Stage 2 completion (+25 XP -> 60/50) crosses daily target!
    const afterStage2 = applyStageCompletionToProgress(afterStage1.progress, {
      stageNumber: 2,
      completedAt: new Date().toISOString(),
      stars: 3,
      score: 10,
      totalQuestions: 10,
      xpEarned: 25,
      verified: true,
      source: 'online-verified',
    });
    assertEqual(afterStage2.xpAwarded, 25, 'First completion of Stage 2 must credit 25 XP');
    assertEqual(afterStage2.progress.dailyXp, 60, 'Daily XP must advance to 60 after Stage 2');
    assertEqual(
      afterStage2.progress.dailyMissionCompleted,
      true,
      'Lesson reward crossing daily XP target (60 >= 50) must complete the daily mission'
    );

    saveUserProgress(afterStage2.progress, 'usr_mission_test');
    const reloadedMissionProg = loadUserProgress('usr_mission_test');
    assertEqual(reloadedMissionProg.dailyXp, 60, 'Daily XP must persist across reloads');
    assertEqual(reloadedMissionProg.dailyMissionCompleted, true, 'Daily mission completion must persist across reloads');

    // --- Reward Audit Item 4: Lesson replay displays and grants 0 new XP ---
    const { resolveStageAttemptDisplayReward } = await import('../src/components/DuolingoStageModal.tsx');
    const firstRunRewardDisplay = resolveStageAttemptDisplayReward({
      wasAlreadyCompleted: false,
      stageXpReward: 25,
    });
    assertEqual(firstRunRewardDisplay.displayedXpAwarded, 25, 'First stage completion must display +25 XP');
    const replayRewardDisplay = resolveStageAttemptDisplayReward({
      wasAlreadyCompleted: true,
      stageXpReward: 25,
    });
    assertEqual(replayRewardDisplay.displayedXpAwarded, 0, 'Stage replay must display 0 new XP');
    assert(
      replayRewardDisplay.badgeLabel.includes('حالت تمرین'),
      'Stage replay badge label must clearly indicate practice mode (0 new XP)'
    );

    const replayStage1Result = applyStageCompletionToProgress(afterStage2.progress, {
      stageNumber: 1,
      completedAt: new Date().toISOString(),
      stars: 3,
      score: 10,
      totalQuestions: 10,
      xpEarned: 25,
      verified: true,
      source: 'online-verified',
    });
    assertEqual(replayStage1Result.isReplay, true, 'Re-completing Stage 1 must be flagged as replay');
    assertEqual(replayStage1Result.xpAwarded, 0, 'Replaying Stage 1 must grant 0 new XP');
    assertEqual(
      replayStage1Result.progress.totalXp,
      afterStage2.progress.totalXp,
      'Authoritative totalXp must not increase on stage replay'
    );

    // --- Reward Audit Item 5 & 6: First-lesson vs First-quiz achievement reward semantics (no double XP grant) ---
    const { findNewlyUnlockedBadges } = await import('../src/data/badgeDefinitions.ts');
    const freshDefaultProg = getDefaultUserProgress();
    assertEqual(
      freshDefaultProg.quizHistory.length,
      0,
      'Fresh default progress must not pre-seed quizHistory (preventing false First Quiz Spark on chapter completion)'
    );

    // 5. Completing a textbook chapter on fresh default progress must NEVER unlock First Quiz Spark
    const afterChapter1MarkedDone = {
      ...freshDefaultProg,
      completedChapters: ['ch-1'],
    };
    const newlyUnlockedAfterChapter1 = findNewlyUnlockedBadges(
      freshDefaultProg.unlockedBadgeIds || [],
      afterChapter1MarkedDone,
      psychologySections
    );
    assert(
      !newlyUnlockedAfterChapter1.some((b) => b.id === 'badge-first-quiz'),
      '5: Textbook chapter completion must NEVER trigger First Quiz Spark'
    );

    // 6a. Completing Stage 1 (First Lesson) credits Stage 1 XP once (15 XP canonical) without unlocking First Quiz Spark
    const freshStage1Complete = applyStageCompletionToProgress(freshDefaultProg, {
      stageNumber: 1,
      completedAt: new Date().toISOString(),
      stars: 3,
      score: 10,
      totalQuestions: 10,
      xpEarned: 15,
      verified: true,
      source: 'online-verified',
    }).progress;
    const newlyUnlockedAfterStage1 = findNewlyUnlockedBadges(
      freshDefaultProg.unlockedBadgeIds || [],
      freshStage1Complete,
      psychologySections
    );
    assert(
      !newlyUnlockedAfterStage1.some((b) => b.id === 'badge-first-quiz'),
      '6a: Completing Stage 1 lesson must NOT unlock First Quiz Spark (which is exclusively for standalone quizzes)'
    );
    assertEqual(
      calculateAuthoritativeUserXp(freshStage1Complete),
      15,
      '6a: First-lesson completion must credit strictly Stage 1 XP (15 XP) once without double-counting'
    );

    // 6b. Answering first standalone quiz question unlocks First Quiz Spark (+50 XP) and credits XP once (15 + 10 + 50 = 75 XP)
    const afterFirstRealQuiz = applyStandaloneQuizAnswerToProgress(freshStage1Complete, {
      chapterId: 'ch-1',
      questionId: 'q-1-1',
      isCorrect: true,
      userAnswer: 1,
      timeSpentSeconds: 12,
      difficulty: 'basic',
    }).progress;
    const newlyUnlockedAfterQuiz1 = findNewlyUnlockedBadges(
      freshStage1Complete.unlockedBadgeIds || [],
      afterFirstRealQuiz,
      psychologySections
    );
    assert(
      newlyUnlockedAfterQuiz1.some((b) => b.id === 'badge-first-quiz'),
      '6b: First standalone quiz answer MUST unlock First Quiz Spark (+50 XP)'
    );
    const withFirstQuizBadgeClaimed = recordDailyXpActivity(
      {
        ...afterFirstRealQuiz,
        unlockedBadgeIds: [
          ...(afterFirstRealQuiz.unlockedBadgeIds || []),
          ...newlyUnlockedAfterQuiz1.map((b) => b.id),
        ],
        claimedBadgeIds: [
          ...(afterFirstRealQuiz.claimedBadgeIds || []),
          ...newlyUnlockedAfterQuiz1.map((b) => b.id),
        ],
      },
      50,
      undefined,
      { xpAlreadyInComputedLedger: true }
    );
    assertEqual(
      calculateAuthoritativeUserXp(withFirstQuizBadgeClaimed),
      15 + 10 + 50,
      '6b: Authoritative XP after Stage 1 (15) + Quiz 1 (10) + First Quiz Spark badge (50) must be exactly 75 XP (never granting badge XP twice)'
    );

    // --- Scenarios 13, 14, 16: 3rd & 4th lesson completion & True/False perfect practice ---
    const afterStage3 = applyStageCompletionToProgress(afterStage2.progress, {
      stageNumber: 3,
      completedAt: new Date().toISOString(),
      stars: 3,
      score: 10,
      totalQuestions: 10,
      xpEarned: 25,
      verified: true,
      source: 'online-verified',
    });
    const afterStage4 = applyStageCompletionToProgress(afterStage3.progress, {
      stageNumber: 4,
      completedAt: new Date().toISOString(),
      stars: 3,
      score: 10,
      totalQuestions: 10,
      xpEarned: 25,
      verified: true,
      source: 'online-verified',
    });
    assertEqual(
      Object.keys(afterStage4.progress.completedStages || {}).length,
      4,
      'Scenario 16: Fourth lesson completion must record all 4 completed stages'
    );
    assertEqual(
      afterStage4.progress.unlockedStageNumber,
      5,
      'Scenario 16: Completing stage 4 must unlock stage 5'
    );

    const tfQuestions = filterQuestionsByExerciseType(allCurriculumQuestions, 'true_false');
    assert(tfQuestions.length >= 2, 'Scenario 14: Curriculum must include true_false questions');
    let tfProg = afterStage4.progress;
    for (const tfQ of tfQuestions.slice(0, 2)) {
      const res = applyStandaloneQuizAnswerToProgress(tfProg, {
        chapterId: tfQ.id.startsWith('q-1-') ? 'ch-1' : 'ch-2',
        questionId: tfQ.id,
        isCorrect: true,
        userAnswer: tfQ.correctAnswer,
        timeSpentSeconds: 8,
        difficulty: tfQ.difficulty,
      });
      tfProg = res.progress;
    }
    assert(
      (tfProg.dailyXp || 0) > (afterStage4.progress.dailyXp || 0),
      'Scenario 14: True/False practice completion must advance dailyXp and totalXp'
    );

    console.log('  ✅ Suite 12 Passed!\n');

    // =========================================================================
    // SUITE 13: Phase 10C.4 Targeted Reward Integrity Repairs (Findings 1–5)
    // =========================================================================
    console.log('🛡️ Suite 13: Phase 10C.4 Targeted Reward Integrity Repairs (Findings 1–5)...');

    const {
      calculateCanonicalPomodoroXp,
      CHAPTER_COMPLETION_XP_REWARD,
      applyChapterCompletionToggleToProgress,
      applyBadgeUnlocksToProgress,
      reconcileUserProgressWithSyncedProfile,
    } = await import('../src/utils/storage.ts');
    const { applySyncedProfileToLocalStorage } = await import('../src/utils/cloudSync.ts');

    // --- Finding 1: Pomodoro reward canonical policy, validation, idempotency, and failed sync handling ---
    assertEqual(calculateCanonicalPomodoroXp(15), 20, 'F1: 15-min Pomodoro canonical reward must be 20 XP');
    assertEqual(calculateCanonicalPomodoroXp(25), 35, 'F1: 25-min Pomodoro canonical reward must be 35 XP');
    assertEqual(calculateCanonicalPomodoroXp(35), 50, 'F1: 35-min Pomodoro canonical reward must be 50 XP');
    assertEqual(calculateCanonicalPomodoroXp(45), 65, 'F1: 45-min Pomodoro canonical reward must be 65 XP');
    assertEqual(calculateCanonicalPomodoroXp(0), 0, 'F1: 0-min Pomodoro must grant 0 XP');
    assertEqual(calculateCanonicalPomodoroXp(90), 0, 'F1: Out-of-bounds (>60m) Pomodoro must grant 0 XP');

    const f1BaseProg = getDefaultUserProgress();
    const f1ValidPomo = recordPomodoroSessionCompletion(f1BaseProg, {
      sessionId: 'pomo_f1_valid_25m',
      chapterId: 'ch-1',
      seconds: 25 * 60,
    });
    assertEqual(f1ValidPomo.applied, true, 'F1: Valid 25m Pomodoro session must be applied locally');
    assertEqual(f1ValidPomo.xpAwarded, 35, 'F1: Valid 25m Pomodoro must award 35 XP');
    assertEqual(f1ValidPomo.minutesAdded, 25, 'F1: Valid 25m Pomodoro must add 25 study minutes');
    assertEqual(f1ValidPomo.progress.totalXp, 35, 'F1: Local totalXp must increase to 35 after 25m Pomodoro');
    assertEqual(f1ValidPomo.progress.dailyXp, 35, 'F1: Daily mission XP must advance by 35 after 25m Pomodoro');

    // Duplicate local Pomodoro session ID must be rejected
    const f1DupLocalPomo = recordPomodoroSessionCompletion(f1ValidPomo.progress, {
      sessionId: 'pomo_f1_valid_25m',
      chapterId: 'ch-1',
      seconds: 25 * 60,
    });
    assertEqual(f1DupLocalPomo.applied, false, 'F1: Duplicate Pomodoro sessionId must not apply twice locally');
    assertEqual(f1DupLocalPomo.xpAwarded, 0, 'F1: Duplicate Pomodoro sessionId must award 0 XP');
    assertEqual(f1DupLocalPomo.progress.totalXp, 35, 'F1: Local totalXp must remain 35 after duplicate Pomodoro');
    assertEqual(f1DupLocalPomo.progress.dailyXp, 35, 'F1: Daily XP must remain 35 after duplicate Pomodoro');

    // Invalid sessionId format or short session (<60s) must be rejected
    const f1BadIdPomo = recordPomodoroSessionCompletion(f1ValidPomo.progress, {
      sessionId: 'invalid_id',
      chapterId: 'ch-1',
      seconds: 25 * 60,
    });
    assertEqual(f1BadIdPomo.applied, false, 'F1: Pomodoro without canonical pomo_* sessionId must be rejected');
    assertEqual(f1BadIdPomo.xpAwarded, 0, 'F1: Rejected Pomodoro must award 0 XP');

    // Server Pomodoro submission: valid session, duplicate submission, short session, spoofed XP, and timestamp mismatch
    const pomoServerRes1 = await worker.fetch(
      new Request('http://localhost/api/leaderboard/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'X-Guest-Token': quizUserToken },
        body: JSON.stringify({
          userId: 'usr_quiz_test',
          rewardType: 'pomodoro',
          sessionId: 'pomo_server_25m_1',
          chapterId: 'ch-1',
          seconds: 25 * 60,
          startedAt: new Date(Date.now() - 26 * 60 * 1000).toISOString(),
          completedAt: new Date().toISOString(),
        }),
      }),
      env,
      ctx
    );
    assertEqual(pomoServerRes1.status, 200, 'F1: Valid server Pomodoro submission must return 200 OK');
    const pomoServerData1 = await pomoServerRes1.json();
    assertEqual(pomoServerData1.applied, true, 'F1: First server Pomodoro submission must be applied');
    assertEqual(pomoServerData1.awardedXp, 35, 'F1: Server must credit canonical 35 XP for 25-min Pomodoro');
    assertEqual(pomoServerData1.profile.totalStudyMinutes, 25, 'F1: Server profile totalStudyMinutes must increment by 25');

    // Duplicate server Pomodoro submission
    const pomoServerDupRes = await worker.fetch(
      new Request('http://localhost/api/leaderboard/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'X-Guest-Token': quizUserToken },
        body: JSON.stringify({
          userId: 'usr_quiz_test',
          rewardType: 'pomodoro',
          sessionId: 'pomo_server_25m_1',
          chapterId: 'ch-1',
          seconds: 25 * 60,
        }),
      }),
      env,
      ctx
    );
    assertEqual(pomoServerDupRes.status, 200, 'F1: Duplicate server Pomodoro submission must return 200 idempotently');
    const pomoServerDupData = await pomoServerDupRes.json();
    assertEqual(pomoServerDupData.applied, false, 'F1: Duplicate server Pomodoro must have applied = false');
    assertEqual(pomoServerDupData.alreadyClaimed, true, 'F1: Duplicate server Pomodoro must have alreadyClaimed = true');
    assertEqual(pomoServerDupData.awardedXp, 0, 'F1: Duplicate server Pomodoro must award 0 XP');
    assertEqual(pomoServerDupData.profile.totalStudyMinutes, 25, 'F1: Duplicate server Pomodoro must not double-count study minutes');

    // Client-inflated XP on Pomodoro must be rejected with 400
    const pomoSpoofedXpRes = await worker.fetch(
      new Request('http://localhost/api/leaderboard/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'X-Guest-Token': quizUserToken },
        body: JSON.stringify({
          userId: 'usr_quiz_test',
          rewardType: 'pomodoro',
          sessionId: 'pomo_server_spoofed_xp',
          chapterId: 'ch-1',
          seconds: 25 * 60,
          xpEarned: 500,
        }),
      }),
      env,
      ctx
    );
    assertEqual(pomoSpoofedXpRes.status, 400, 'F1: Server must reject Pomodoro submission with client-inflated xpEarned (400)');

    // Short (<60s) or timestamp-faked Pomodoro session must be rejected with 400
    const pomoShortRes = await worker.fetch(
      new Request('http://localhost/api/leaderboard/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'X-Guest-Token': quizUserToken },
        body: JSON.stringify({
          userId: 'usr_quiz_test',
          rewardType: 'pomodoro',
          sessionId: 'pomo_server_short_30s',
          chapterId: 'ch-1',
          seconds: 30,
        }),
      }),
      env,
      ctx
    );
    assertEqual(pomoShortRes.status, 400, 'F1: Server must reject short Pomodoro session (<60s) with 400');

    const pomoFakeElapsedRes = await worker.fetch(
      new Request('http://localhost/api/leaderboard/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'X-Guest-Token': quizUserToken },
        body: JSON.stringify({
          userId: 'usr_quiz_test',
          rewardType: 'pomodoro',
          sessionId: 'pomo_server_fake_elapsed',
          chapterId: 'ch-1',
          seconds: 25 * 60,
          startedAt: new Date(Date.now() - 10 * 1000).toISOString(),
          completedAt: new Date().toISOString(),
        }),
      }),
      env,
      ctx
    );
    assertEqual(pomoFakeElapsedRes.status, 400, 'F1: Server must reject Pomodoro when elapsed timestamps are shorter than claimed duration (400)');

    // Failed synchronization (rejected submission) must return ok: false from submitStageOrQuizReward so it is never treated as server-confirmed
    const prevFetchF1 = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr =
        typeof input === 'string'
          ? input.startsWith('http')
            ? input
            : `http://localhost${input}`
          : input instanceof URL
          ? input.toString()
          : input.url;
      return worker.fetch(new Request(urlStr, init), env, ctx);
    };
    try {
      const rejectedPomoSyncResult = await submitStageOrQuizReward(
        {
          rewardType: 'pomodoro',
          sessionId: 'pomo_rejected_short',
          chapterId: 'ch-1',
          seconds: 15,
        },
        1,
        { skipAutoBootstrap: true }
      );
      assertEqual(
        rejectedPomoSyncResult.ok,
        false,
        'F1: Rejected Pomodoro submission must return ok=false and never appear as a server-confirmed reward'
      );
    } finally {
      globalThis.fetch = prevFetchF1;
    }

    // --- Finding 2: Textbook chapter XP farming prevention ---
    assertEqual(CHAPTER_COMPLETION_XP_REWARD, 20, 'F2: Canonical chapter completion reward must be 20 XP');
    const f2StartProg = getDefaultUserProgress();
    const f2Mark1 = applyChapterCompletionToggleToProgress(f2StartProg, 'ch-2');
    assertEqual(f2Mark1.isCompleted, true, 'F2: First toggle of ch-2 must mark it completed');
    assertEqual(f2Mark1.alreadyRewarded, false, 'F2: First completion of ch-2 must not be marked alreadyRewarded');
    assertEqual(f2Mark1.xpAwarded, 20, 'F2: First completion of ch-2 must award +20 XP');
    assertEqual(f2Mark1.progress.totalXp, 20, 'F2: totalXp must be 20 after first completion of ch-2');
    assertEqual(f2Mark1.progress.dailyXp, 20, 'F2: dailyXp must be 20 after first completion of ch-2');
    assert(f2Mark1.progress.rewardedChapterIds?.includes('ch-2'), 'F2: ch-2 must be recorded in rewardedChapterIds');

    // Unmarking ch-2 must remove completion flag without reducing XP or clearing rewardedChapterIds
    const f2Unmark1 = applyChapterCompletionToggleToProgress(f2Mark1.progress, 'ch-2');
    assertEqual(f2Unmark1.isCompleted, false, 'F2: Second toggle of ch-2 must unmark completion');
    assertEqual(f2Unmark1.alreadyRewarded, true, 'F2: Unmarking ch-2 must preserve alreadyRewarded = true');
    assertEqual(f2Unmark1.xpAwarded, 0, 'F2: Unmarking ch-2 must award 0 XP');
    assertEqual(f2Unmark1.progress.totalXp, 20, 'F2: totalXp must remain 20 when ch-2 is unmarked');
    assert(f2Unmark1.progress.rewardedChapterIds?.includes('ch-2'), 'F2: rewardedChapterIds must retain ch-2 when unmarked');

    // Re-marking ch-2 repeatedly must NEVER grant XP or daily mission progress again
    const f2Remark1 = applyChapterCompletionToggleToProgress(f2Unmark1.progress, 'ch-2');
    assertEqual(f2Remark1.isCompleted, true, 'F2: Third toggle of ch-2 must mark it completed again');
    assertEqual(f2Remark1.alreadyRewarded, true, 'F2: Re-marking ch-2 must report alreadyRewarded = true');
    assertEqual(f2Remark1.xpAwarded, 0, 'F2: Re-marking ch-2 must award 0 XP');
    assertEqual(f2Remark1.progress.totalXp, 20, 'F2: totalXp must remain 20 after re-marking ch-2');
    assertEqual(f2Remark1.progress.dailyXp, 20, 'F2: dailyXp must remain 20 after re-marking ch-2');

    // Reload persistence of rewardedChapterIds
    saveUserProgress(f2Unmark1.progress, 'usr_chapter_farm_test');
    const f2ReloadedProg = loadUserProgress('usr_chapter_farm_test');
    assert(
      f2ReloadedProg.rewardedChapterIds?.includes('ch-2'),
      'F2: rewardedChapterIds must persist across save/load reload even if chapter is currently unmarked'
    );
    const f2RemarkAfterReload = applyChapterCompletionToggleToProgress(f2ReloadedProg, 'ch-2');
    assertEqual(f2RemarkAfterReload.xpAwarded, 0, 'F2: Re-marking ch-2 after reload must still award 0 XP');
    assertEqual(f2RemarkAfterReload.progress.totalXp, 20, 'F2: totalXp must remain 20 after reload and re-mark');

    // Server chapter_completion reward verification and idempotency
    const chServerRes1 = await worker.fetch(
      new Request('http://localhost/api/leaderboard/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'X-Guest-Token': quizUserToken },
        body: JSON.stringify({
          userId: 'usr_quiz_test',
          rewardType: 'chapter_completion',
          chapterId: 'ch-1',
        }),
      }),
      env,
      ctx
    );
    assertEqual(chServerRes1.status, 200, 'F2: Valid server chapter_completion must return 200 OK');
    const chServerData1 = await chServerRes1.json();
    assertEqual(chServerData1.applied, true, 'F2: First server chapter_completion for ch-1 must apply');
    assertEqual(chServerData1.awardedXp, 20, 'F2: Server must credit +20 XP for ch-1 completion');
    assert(chServerData1.profile.completedChapters.includes('ch-1'), 'F2: Server profile completedChapters must include ch-1');

    const chServerDupRes = await worker.fetch(
      new Request('http://localhost/api/leaderboard/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'X-Guest-Token': quizUserToken },
        body: JSON.stringify({
          userId: 'usr_quiz_test',
          rewardType: 'chapter_completion',
          chapterId: 'ch-1',
        }),
      }),
      env,
      ctx
    );
    const chServerDupData = await chServerDupRes.json();
    assertEqual(chServerDupData.applied, false, 'F2: Duplicate chapter_completion for ch-1 must not apply a second time');
    assertEqual(chServerDupData.alreadyClaimed, true, 'F2: Duplicate chapter_completion must return alreadyClaimed = true');
    assertEqual(chServerDupData.awardedXp, 0, 'F2: Duplicate chapter_completion must award 0 XP');

    // --- Finding 3: Stale React state & localStorage reconciliation after server synchronization ---
    const f3LocalProg = {
      ...getDefaultUserProgress(),
      totalXp: 25,
      streakDays: 1,
      totalStudyMinutes: 10,
      completedChapters: ['ch-1'],
      rewardedChapterIds: ['ch-1'],
      unlockedBadgeIds: [],
      claimedBadgeIds: [],
      completedStages: {
        1: {
          stageNumber: 1,
          completedAt: '2026-03-01T00:00:00.000Z',
          stars: 3,
          score: 10,
          totalQuestions: 10,
          xpEarned: 25,
          verified: true,
          source: 'online-verified' as const,
        },
      },
    };

    // 3a. XP-only synchronization when completedStages is completely unchanged
    const f3XpOnlyServerProfile = {
      userId: 'usr_sync_f3',
      name: 'کاربر همگام‌سازی',
      avatar: '🦉',
      xp: 120,
      streakDays: 1,
      totalStudyMinutes: 10,
      completedChapters: ['ch-1'],
      completedStages: f3LocalProg.completedStages,
      unlockedBadgeIds: [],
      bookmarkedChapters: [],
      lastSyncedAt: new Date().toISOString(),
    };
    const f3AfterXpOnly = reconcileUserProgressWithSyncedProfile(f3LocalProg, f3XpOnlyServerProfile);
    assert(f3AfterXpOnly !== f3LocalProg, 'F3: XP-only server update must produce a new state reference even when completedStages is unchanged');
    assertEqual(f3AfterXpOnly.totalXp, 120, 'F3: XP-only server sync must reconcile totalXp to 120');

    // 3b. Badge reward synchronization when completedStages is unchanged
    const f3BadgeServerProfile = {
      ...f3XpOnlyServerProfile,
      xp: 170,
      unlockedBadgeIds: ['badge-first-quiz'],
    };
    const f3AfterBadgeSync = reconcileUserProgressWithSyncedProfile(f3AfterXpOnly, f3BadgeServerProfile);
    assertEqual(f3AfterBadgeSync.totalXp, 170, 'F3: Badge sync must update totalXp to 170');
    assert(f3AfterBadgeSync.unlockedBadgeIds?.includes('badge-first-quiz'), 'F3: Badge sync must reconcile unlockedBadgeIds');
    assert(f3AfterBadgeSync.claimedBadgeIds?.includes('badge-first-quiz'), 'F3: Badge sync must reconcile claimedBadgeIds');

    // 3c. Repeated identical sync events must return the EXACT same reference (no feedback loop)
    const f3RepeatedIdentical = reconcileUserProgressWithSyncedProfile(f3AfterBadgeSync, f3BadgeServerProfile);
    assertEqual(
      f3RepeatedIdentical,
      f3AfterBadgeSync,
      'F3: Repeated identical sync event must return exact same object reference to prevent React/localStorage feedback loops'
    );

    // 3d. applySyncedProfileToLocalStorage persists reconciled server state so subsequent load/save does not overwrite newer server XP
    saveUserProgress(f3LocalProg, 'usr_sync_f3');
    applySyncedProfileToLocalStorage(f3BadgeServerProfile);
    const f3LoadedFromStorage = loadUserProgress('usr_sync_f3');
    assertEqual(f3LoadedFromStorage.totalXp, 170, 'F3: applySyncedProfileToLocalStorage must persist server XP (170) to localStorage');
    assert(
      f3LoadedFromStorage.unlockedBadgeIds?.includes('badge-first-quiz'),
      'F3: applySyncedProfileToLocalStorage must persist server unlockedBadgeIds to localStorage'
    );

    // --- Finding 4: Stage 100 chest eligibility requires BOTH stages 1..99 AND Stage 100 itself ---
    const stages1To99Only: Record<number, any> = {};
    for (let i = 1; i <= 99; i++) {
      stages1To99Only[i] = {
        stageNumber: i,
        completedAt: new Date().toISOString(),
        stars: 3,
        score: 5,
        totalQuestions: 5,
        xpEarned: 25,
        verified: true,
        source: 'online-verified',
      };
    }
    const f4IncompleteStage100Prog = {
      ...getDefaultUserProgress(),
      diamonds: 200,
      claimedStageChests: [],
      completedStages: stages1To99Only,
    };
    const f4AttemptWithoutStage100 = claimStageChestReward(f4IncompleteStage100Prog, 100);
    assertEqual(
      f4AttemptWithoutStage100.claimed,
      false,
      'F4: Stage 100 chest claim MUST be rejected when Stages 1..99 are done but Stage 100 itself is incomplete'
    );
    assertEqual(f4AttemptWithoutStage100.diamondsAwarded, 0, 'F4: Ineligible Stage 100 chest claim must award 0 diamonds');
    assertEqual(f4AttemptWithoutStage100.progress.diamonds, 200, 'F4: Diamonds must remain 200 when Stage 100 is incomplete');

    // Stage 100 completed, but an earlier stage (Stage 50) is missing
    const stagesMissing50: Record<number, any> = {
      ...stages1To99Only,
      100: {
        stageNumber: 100,
        completedAt: new Date().toISOString(),
        stars: 3,
        score: 5,
        totalQuestions: 5,
        xpEarned: 50,
        verified: true,
        source: 'online-verified',
      },
    };
    delete stagesMissing50[50];
    const f4AttemptMissingEarlier = claimStageChestReward(
      { ...f4IncompleteStage100Prog, completedStages: stagesMissing50 },
      100
    );
    assertEqual(
      f4AttemptMissingEarlier.claimed,
      false,
      'F4: Stage 100 chest claim MUST be rejected when any earlier stage (e.g. Stage 50) is incomplete'
    );
    assertEqual(f4AttemptMissingEarlier.diamondsAwarded, 0, 'F4: Missing earlier stage must award 0 diamonds');

    // --- Finding 5: Badge reward accounting, defaultProgress, badge-diamond-champ XP, multi-pass & server verification ---
    const f5Default = getDefaultUserProgress();
    assertEqual(f5Default.streakDays, 1, 'F5: Default progress must start with streakDays = 1');
    assertEqual((f5Default.unlockedBadgeIds || []).length, 0, 'F5: Default progress must not pre-unlock badge-streak-3');
    assertEqual(f5Default.claimedBadgeIds?.length || 0, 0, 'F5: Default progress must start with empty claimedBadgeIds');

    // Existing users' stored earned badges must be preserved on loadUserProgress
    saveUserProgress(
      {
        ...f5Default,
        streakDays: 3,
        unlockedBadgeIds: ['badge-streak-3'],
        claimedBadgeIds: ['badge-streak-3'],
        totalXp: 80,
      },
      'usr_f5_existing_badges'
    );
    const f5ReloadedExisting = loadUserProgress('usr_f5_existing_badges');
    assert(
      f5ReloadedExisting.unlockedBadgeIds?.includes('badge-streak-3'),
      'F5: Existing users stored badges must be preserved on loadUserProgress'
    );
    assertEqual(
      calculateAuthoritativeUserXp(f5ReloadedExisting),
      80,
      'F5: Claimed badge-streak-3 must contribute its 80 XP to authoritative XP'
    );

    // Multi-pass badge evaluation & badge-diamond-champ using calculateAuthoritativeUserXp:
    // Start with 450 XP from verified stage completions (stages 1..18) + 1 standalone quiz answer (+10 XP = 460 XP).
    // Unlocking badge-first-quiz (+50 XP) brings total authoritative XP to 510 XP (>= 500 XP),
    // which MUST unlock badge-diamond-champ (+250 XP) in the same multi-pass evaluation!
    const f5StagesMap: Record<number, any> = {};
    for (let i = 1; i <= 18; i++) {
      f5StagesMap[i] = {
        stageNumber: i,
        completedAt: new Date().toISOString(),
        stars: 3,
        score: 5,
        totalQuestions: 5,
        xpEarned: 25,
        verified: true,
        source: 'online-verified',
      };
    }
    const f5PreCascadeProg = applyStandaloneQuizAnswerToProgress(
      {
        ...getDefaultUserProgress(),
        completedStages: f5StagesMap, // 18 * 25 = 450 XP
        totalXp: 450,
      },
      {
        chapterId: 'ch-1',
        questionId: 'q-1-1',
        isCorrect: true,
        userAnswer: 1,
        timeSpentSeconds: 15,
        difficulty: 'basic',
      }
    ).progress;
    assertEqual(
      calculateAuthoritativeUserXp(f5PreCascadeProg),
      460,
      'F5: Pre-badge XP must be 450 (stages) + 10 (quiz) = 460 XP'
    );

    const f5CascadeResult = applyBadgeUnlocksToProgress(f5PreCascadeProg, psychologySections);
    const f5CascadeIds = f5CascadeResult.newlyUnlockedBadges.map((b) => b.id);
    assert(
      f5CascadeIds.includes('badge-first-quiz') && f5CascadeIds.includes('badge-diamond-champ'),
      'F5: Multi-pass badge evaluation must unlock badge-first-quiz (+50 XP -> 510 XP) AND cascade to unlock badge-diamond-champ (>= 500 XP) in one evaluation'
    );
    assertEqual(
      f5CascadeResult.badgeXpAwarded,
      50 + 250,
      'F5: Multi-pass badge unlock must credit 50 + 250 = 300 badge XP once'
    );
    assertEqual(
      f5CascadeResult.progress.totalXp,
      460 + 300,
      'F5: Total authoritative XP after cascading badges must be 760 XP without double-counting'
    );

    // Re-running applyBadgeUnlocksToProgress on the updated state must unlock nothing (idempotent)
    const f5SecondRun = applyBadgeUnlocksToProgress(f5CascadeResult.progress, psychologySections);
    assertEqual(f5SecondRun.newlyUnlockedBadges.length, 0, 'F5: Subsequent badge evaluation must unlock 0 duplicate badges');
    assertEqual(f5SecondRun.badgeXpAwarded, 0, 'F5: Subsequent badge evaluation must award 0 XP');

    // Server badge eligibility enforcement: submitting an unearned badge ID (e.g. badge-streak-7 when streakDays=1) must be rejected with 400
    const unearnedBadgeServerRes = await worker.fetch(
      new Request('http://localhost/api/leaderboard/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'X-Guest-Token': quizUserToken },
        body: JSON.stringify({
          userId: 'usr_quiz_test',
          rewardType: 'badge_unlock',
          badgeId: 'badge-streak-7',
        }),
      }),
      env,
      ctx
    );
    assertEqual(
      unearnedBadgeServerRes.status,
      400,
      'F5: Server must reject badge_unlock when user has not met badge eligibility criteria (400)'
    );

    console.log('  ✅ Suite 13 Passed!\n');

    // =========================================================================
    // SUITE 14: Phase 10C.6 Multi-Discipline Learning Selector
    // =========================================================================
    console.log('🧭 Suite 14: Phase 10C.6 Multi-Discipline Learning Selector...');

    const {
      ACTIVE_DISCIPLINE_STORAGE_KEY,
      DEFAULT_LEARNING_DISCIPLINE_ID,
      LEARNING_DISCIPLINES,
      SUPPORTED_DISCIPLINE_IDS,
      isValidDisciplineId,
      normalizeDisciplineId,
      getDisciplineDefinition,
      loadActiveDiscipline,
      saveActiveDiscipline,
      createSynchronizedDisciplineController,
    } = await import('../src/utils/storage.ts');
    const React = (await import('react')).default;
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { DashboardView } = await import('../src/components/DashboardView.tsx');
    const { Navbar } = await import('../src/components/Navbar.tsx');

    // 14.1 Psychology is the default when no valid value is stored
    mockLocalStorage.removeItem(ACTIVE_DISCIPLINE_STORAGE_KEY);
    assertEqual(
      ACTIVE_DISCIPLINE_STORAGE_KEY,
      'psychomaster:active-discipline:v1',
      '14.1: Active discipline storage key must be versioned and namespaced as psychomaster:active-discipline:v1'
    );
    assertEqual(
      DEFAULT_LEARNING_DISCIPLINE_ID,
      'psychology',
      '14.1: Default learning discipline ID must be psychology'
    );
    assertEqual(
      loadActiveDiscipline(),
      'psychology',
      '14.1: loadActiveDiscipline must return psychology when storage is empty'
    );

    // 14.2 Selected discipline persists across reload through the storage abstraction
    for (const disciplineId of SUPPORTED_DISCIPLINE_IDS) {
      const saved = saveActiveDiscipline(disciplineId);
      assertEqual(saved, disciplineId, `14.2: saveActiveDiscipline must return ${disciplineId}`);
      assertEqual(
        mockLocalStorage.getItem(ACTIVE_DISCIPLINE_STORAGE_KEY),
        disciplineId,
        `14.2: localStorage must persist ${disciplineId}`
      );
      assertEqual(
        loadActiveDiscipline(),
        disciplineId,
        `14.2: Reloading via loadActiveDiscipline must restore ${disciplineId}`
      );
    }

    // 14.3 Invalid stored discipline IDs fall back safely to Psychology
    for (const invalidVal of ['invalid_domain', 'biology', '', '   ', 'PSYCHOLOGY', null, undefined, 123]) {
      assertEqual(
        isValidDisciplineId(invalidVal),
        false,
        `14.3: isValidDisciplineId must reject ${JSON.stringify(invalidVal)}`
      );
      assertEqual(
        normalizeDisciplineId(invalidVal),
        'psychology',
        `14.3: normalizeDisciplineId must fall back to psychology for ${JSON.stringify(invalidVal)}`
      );
    }
    mockLocalStorage.setItem(ACTIVE_DISCIPLINE_STORAGE_KEY, 'corrupted_unknown_discipline');
    assertEqual(
      loadActiveDiscipline(),
      'psychology',
      '14.3: Corrupted localStorage discipline value must safely fall back to psychology'
    );

    // 14.4 Dashboard and header controls stay synchronized through one shared source of truth
    mockLocalStorage.removeItem(ACTIVE_DISCIPLINE_STORAGE_KEY);
    const sharedController = createSynchronizedDisciplineController();
    let headerObservedDiscipline = sharedController.getActiveDiscipline();
    let dashboardObservedDiscipline = sharedController.getActiveDiscipline();
    let notificationCount = 0;

    const unsubHeader = sharedController.subscribe((nextId) => {
      headerObservedDiscipline = nextId;
      notificationCount++;
    });
    const unsubDashboard = sharedController.subscribe((nextId) => {
      dashboardObservedDiscipline = nextId;
    });

    assertEqual(headerObservedDiscipline, 'psychology', '14.4: Header starts on psychology');
    assertEqual(dashboardObservedDiscipline, 'psychology', '14.4: Dashboard starts on psychology');

    // Selecting 'art' from Dashboard updates Header and localStorage immediately
    sharedController.selectDiscipline('art');
    assertEqual(headerObservedDiscipline, 'art', '14.4: Selecting art updates Header immediately');
    assertEqual(dashboardObservedDiscipline, 'art', '14.4: Selecting art updates Dashboard immediately');
    assertEqual(loadActiveDiscipline(), 'art', '14.4: Selecting art persists to localStorage');
    assertEqual(notificationCount, 1, '14.4: Selecting art notifies subscribers once');

    // Selecting the already-active discipline ('art') does not trigger duplicate notifications or loops
    sharedController.selectDiscipline('art');
    assertEqual(
      notificationCount,
      1,
      '14.4: Selecting already-active discipline must not fire duplicate notifications'
    );

    // Selecting 'law' from Header updates Dashboard and localStorage immediately
    sharedController.selectDiscipline('law');
    assertEqual(headerObservedDiscipline, 'law', '14.4: Selecting law from Header updates Header');
    assertEqual(dashboardObservedDiscipline, 'law', '14.4: Selecting law from Header updates Dashboard');
    assertEqual(loadActiveDiscipline(), 'law', '14.4: Selecting law persists to localStorage');

    unsubHeader();
    unsubDashboard();

    // 14.5 Switching disciplines does NOT modify XP, progress, achievements, notes, bookmarks, Pomodoro, or exam history
    const richProgressBeforeSwitch = {
      ...getDefaultUserProgress(),
      totalXp: 645,
      dailyXp: 35,
      streakDays: 5,
      diamonds: 630,
      totalStudyMinutes: 120,
      completedChapters: ['ch-1', 'ch-2', 'ch-3'],
      rewardedChapterIds: ['ch-1', 'ch-2', 'ch-3'],
      bookmarkedChapters: ['ch-1', 'ch-5'],
      pinnedChapters: ['ch-1', 'ch-10'],
      chapterNotes: {
        'ch-1': 'یادداشت تخصصی فصل اول',
        'ch-2': 'یادداشت تخصصی فصل دوم',
      },
      unlockedBadgeIds: ['badge-first-quiz', 'badge-streak-3'],
      claimedBadgeIds: ['badge-first-quiz', 'badge-streak-3'],
      pomodoroHistory: [
        {
          id: 'pomo_preserve_1',
          chapterId: 'ch-1',
          minutes: 25,
          xpEarned: 35,
          completedAt: '2026-03-10T10:00:00.000Z',
        },
      ],
      completedStages: {
        1: {
          stageNumber: 1,
          completedAt: '2026-03-10T09:00:00.000Z',
          stars: 3,
          score: 10,
          totalQuestions: 10,
          xpEarned: 25,
          verified: true,
          source: 'online-verified' as const,
        },
      },
    };
    saveUserProgress(richProgressBeforeSwitch, 'usr_discipline_safety');
    const serializedBeforeSwitch = JSON.stringify(loadUserProgress('usr_discipline_safety'));
    const examHistoryBeforeSwitch = await examRepo.getUserExamHistory('usr_exam_1');

    for (const d of SUPPORTED_DISCIPLINE_IDS) {
      saveActiveDiscipline(d);
    }

    const loadedAfterAllSwitches = loadUserProgress('usr_discipline_safety');
    const serializedAfterSwitch = JSON.stringify(loadedAfterAllSwitches);
    const examHistoryAfterSwitch = await examRepo.getUserExamHistory('usr_exam_1');

    assertEqual(
      serializedAfterSwitch,
      serializedBeforeSwitch,
      '14.5: Switching across all 7 disciplines must not alter any field in UserProgress (XP, stages, badges, notes, bookmarks, Pomodoro)'
    );
    assertEqual(
      loadedAfterAllSwitches.totalXp,
      645,
      '14.5: User totalXp must remain 645 after switching disciplines'
    );
    assertEqual(
      loadedAfterAllSwitches.chapterNotes['ch-2'],
      'یادداشت تخصصی فصل دوم',
      '14.5: Chapter notes must remain intact after switching disciplines'
    );
    assertEqual(
      examHistoryAfterSwitch.attempts.length,
      examHistoryBeforeSwitch.attempts.length,
      '14.5: Server/D1 exam history must remain completely untouched when switching disciplines'
    );

    // 14.6 All 7 supported disciplines and exact concise Persian labels are present and rendered
    const expectedDisciplines: Array<{ id: string; label: string }> = [
      { id: 'psychology', label: 'روانشناسی' },
      { id: 'sociology', label: 'جامعهشناسی' },
      { id: 'law', label: 'حقوق' },
      { id: 'art', label: 'هنر' },
      { id: 'philosophy', label: 'فلسفه' },
      { id: 'entrance_exam', label: 'کنکور' },
      { id: 'politics', label: 'سیاست' },
    ];

    assertEqual(
      LEARNING_DISCIPLINES.length,
      7,
      '14.6: LEARNING_DISCIPLINES must contain exactly 7 supported disciplines'
    );
    for (let i = 0; i < expectedDisciplines.length; i++) {
      assertEqual(
        LEARNING_DISCIPLINES[i].id,
        expectedDisciplines[i].id as any,
        `14.6: Discipline #${i + 1} ID must be ${expectedDisciplines[i].id}`
      );
      assertEqual(
        LEARNING_DISCIPLINES[i].label,
        expectedDisciplines[i].label,
        `14.6: Discipline #${i + 1} Persian label must be "${expectedDisciplines[i].label}"`
      );
    }
    assertEqual(
      getDisciplineDefinition('psychology').hasCurriculum,
      true,
      '14.6: Psychology must be marked hasCurriculum = true'
    );
    for (const nonPsychId of ['sociology', 'law', 'art', 'philosophy', 'entrance_exam', 'politics']) {
      assertEqual(
        getDisciplineDefinition(nonPsychId).hasCurriculum,
        false,
        `14.6: ${nonPsychId} must honestly report hasCurriculum = false in this phase`
      );
    }

    // Render DashboardView with Psychology vs non-Psychology discipline ('art')
    const dashboardPsychHtml = renderToStaticMarkup(
      React.createElement(DashboardView, {
        sections: psychologySections,
        progress: richProgressBeforeSwitch,
        activeDiscipline: 'psychology',
        onSelectDiscipline: () => {},
        onSelectChapter: () => {},
        onStartQuiz: () => {},
        onOpenNotes: () => {},
        onOpenBadges: () => {},
      })
    );
    for (const item of expectedDisciplines) {
      assert(
        dashboardPsychHtml.includes(item.label),
        `14.6: Rendered DashboardView must display Persian discipline label "${item.label}"`
      );
    }
    assert(
      dashboardPsychHtml.includes('data-testid="dashboard-discipline-selector"'),
      '14.6: Rendered DashboardView must include dashboard-discipline-selector nav'
    );
    assert(
      dashboardPsychHtml.includes('ادامه یادگیری') &&
        !dashboardPsychHtml.includes('data-testid="discipline-empty-curriculum-state"'),
      '14.6: DashboardView on psychology must render Continue Learning card and NOT empty-curriculum state'
    );

    const dashboardArtHtml = renderToStaticMarkup(
      React.createElement(DashboardView, {
        sections: psychologySections,
        progress: richProgressBeforeSwitch,
        activeDiscipline: 'art',
        onSelectDiscipline: () => {},
        onSelectChapter: () => {},
        onStartQuiz: () => {},
        onOpenNotes: () => {},
        onOpenBadges: () => {},
      })
    );
    assert(
      dashboardArtHtml.includes('data-testid="discipline-empty-curriculum-state"') &&
        dashboardArtHtml.includes('میز مطالعه هنر') &&
        dashboardArtHtml.includes('در حال تدوین سرفصل اختصاصی'),
      '14.6: DashboardView on non-Psychology discipline (art) must render honest future-curriculum state without faking stages'
    );
    assert(
      dashboardArtHtml.includes('۶۴۵ XP') && dashboardArtHtml.includes('مشاهده همه دستاوردها'),
      '14.6: DashboardView on non-Psychology discipline must preserve compact progress summary and achievements link'
    );

    // Render Navbar with activeDiscipline='philosophy' wrapped in AuthProvider
    const { AuthProvider } = await import('../src/context/AuthContext.tsx');
    const navbarPhilosophyHtml = renderToStaticMarkup(
      React.createElement(
        AuthProvider,
        null,
        React.createElement(Navbar, {
          activeTab: 'dashboard',
          setActiveTab: () => {},
          activeDiscipline: 'philosophy',
          onSelectDiscipline: () => {},
          onOpenSearch: () => {},
          onOpenSettings: () => {},
          streakDays: 5,
          totalXp: 645,
        })
      )
    );
    assert(
      navbarPhilosophyHtml.includes('data-testid="navbar-discipline-switcher"') &&
        navbarPhilosophyHtml.includes('فلسفه'),
      '14.6: Rendered Navbar must display compact discipline switcher with active discipline label (فلسفه)'
    );

    // 14.7 Responsive classes & App.tsx shared wiring verification
    const appSource14 = readSrcFile('App.tsx');
    const navbarSource14 = readSrcFile('components/Navbar.tsx');
    const dashboardSource14 = readSrcFile('components/DashboardView.tsx');
    assert(
      appSource14.includes('activeDiscipline={activeDiscipline}') &&
        appSource14.includes('onSelectDiscipline={handleSelectDiscipline}'),
      '14.7: App.tsx must pass shared activeDiscipline and handleSelectDiscipline to both Navbar and DashboardView'
    );
    assert(
      dashboardSource14.includes('overflow-x-auto') &&
        dashboardSource14.includes('shrink-0') &&
        dashboardSource14.includes('min-h-[44px]'),
      '14.7: Dashboard discipline selector must use horizontal scrolling (overflow-x-auto), shrink-0, and >=44px touch targets'
    );
    assert(
      navbarSource14.includes('aria-haspopup="listbox"') &&
        navbarSource14.includes('role="listbox"'),
      '14.7: Header discipline switcher must expose accessible listbox ARIA attributes'
    );

    // Restore default discipline in mockLocalStorage
    saveActiveDiscipline('psychology');
    console.log('  ✅ Suite 14 Passed!\n');

    console.log('  ✅ Suite 10 Passed!\n');
  }
  console.log('  ✅ Suite 6 Passed!\n');

  console.log('================================================================');
  console.log(`🎉 ALL FRONTEND CONTRACT & PHASE 10C.6 REGRESSION TESTS PASSED!`);
  console.log(`✅ Total Passing Assertions: ${passedAssertions} | Failed: ${failedAssertions}`);
  console.log('================================================================');
}

runPhase7FrontendContractTests().catch((err) => {
  console.error('Fatal test failure:', err);
  process.exit(1);
});
