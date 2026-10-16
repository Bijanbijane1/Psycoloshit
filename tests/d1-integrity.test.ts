/**
 * Automated Regression Test Suite for D1 Data Integrity & Reward Security
 * Project: PsychoMaster (روان‌لینگو) - Phase 4C
 *
 * Runs on Node 22 using SQLite in-memory engine to guarantee 100% test isolation.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import workerDefault from '../src/worker/index.ts';
import {
  D1UserRepository,
  D1QuestionRepository,
  DataIntegrityError,
  rowToSyncedUserProfile,
  parsePersistedOptions,
} from '../src/worker/db/index.ts';
import type { D1Database, Env } from '../src/worker/types.ts';

// Helper to create a D1Database mock backed by node:sqlite DatabaseSync
function createMockD1(db: DatabaseSync): D1Database {
  return {
    prepare(query: string) {
      let boundValues: any[] = [];
      return {
        bind(...values: unknown[]) {
          boundValues = values as any[];
          return this;
        },
        async first<T = unknown>(colName?: string): Promise<T | null> {
          const stmt = db.prepare(query);
          const row = stmt.get(...boundValues);
          if (!row) return null;
          if (colName) return (row as Record<string, unknown>)[colName] as T;
          return row as T;
        },
        async run<T = unknown>() {
          const stmt = db.prepare(query);
          const result = stmt.run(...boundValues);
          return { success: true, meta: result as unknown as Record<string, unknown> };
        },
        async all<T = unknown>() {
          const stmt = db.prepare(query);
          const rows = stmt.all(...boundValues);
          return { success: true, results: rows as T[] };
        },
        async raw<T = unknown>() {
          const stmt = db.prepare(query);
          return stmt.all(...boundValues) as T[];
        },
      };
    },
    async batch<T = unknown>(statements: any[]) {
      db.exec('BEGIN TRANSACTION');
      try {
        const results = [];
        for (const s of statements) {
          results.push(await s.run());
        }
        db.exec('COMMIT');
        return results;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    async exec(query: string) {
      db.exec(query);
      return { success: true };
    },
    async dump() {
      return new ArrayBuffer(0);
    },
  };
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('RUNNING D1 REGRESSION TEST SUITE (PHASE 4E)');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
      throw new Error(`Assertion failed: ${msg}`);
    }
  }

  // ---------------------------------------------------------------
  // 1. MIGRATION APPLICATION & HISTORICAL DATA PRESERVATION
  // ---------------------------------------------------------------
  console.log('Test Suite 1: Sequential Migrations & Historical Ledger Compatibility');
  const sqlite = new DatabaseSync(':memory:');
  const m1 = fs.readFileSync('migrations/0001_initial_schema.sql', 'utf8');
  sqlite.exec(m1);

  // Seed user and historical ledger row without idempotency key
  sqlite.exec("INSERT INTO users (user_id, name, xp) VALUES ('u_hist', 'کاربر تاریخی', 400)");
  sqlite.exec("INSERT INTO xp_ledger (id, user_id, amount, reason) VALUES ('l_hist_1', 'u_hist', 50, 'quiz')");
  sqlite.exec("INSERT INTO xp_ledger (id, user_id, amount, reason) VALUES ('l_hist_2', 'u_hist', 75, 'stage')");

  // Apply migration 0002
  const m2 = fs.readFileSync('migrations/0002_xp_idempotency.sql', 'utf8');
  sqlite.exec(m2);

  const histRows = sqlite.prepare('SELECT id, user_id, amount, idempotency_key FROM xp_ledger').all() as any[];
  assert(histRows.length === 2, 'Historical ledger rows are completely preserved');
  assert(histRows[0].idempotency_key === null && histRows[1].idempotency_key === null, 'Historical rows retain NULL idempotency keys safely');

  const mockDb = createMockD1(sqlite);
  const userRepo = new D1UserRepository(mockDb);
  const qRepo = new D1QuestionRepository(mockDb);

  // ---------------------------------------------------------------
  // 2. SERVER-OWNED XP PROTECTION
  // ---------------------------------------------------------------
  console.log('\nTest Suite 2: Server-Owned XP Protection in upsertUser');

  // Attempting to overwrite existing user's XP with 999999
  const updatedExisting = await userRepo.upsertUser({
    userId: 'u_hist',
    name: 'کاربر تاریخی تغییریافته',
    xp: 999999, // Malicious / client attempt to set XP
    totalStudyMinutes: 60,
  });
  assert(updatedExisting.xp === 400, 'upsertUser ignores client xp: 999999 on existing user (preserved 400)');

  // Verify in database directly
  const dbUser = (await userRepo.getUserById('u_hist'))!;
  assert(dbUser.xp === 400, 'Direct database read confirms stored XP is still 400');
  assert(dbUser.name === 'کاربر تاریخی تغییریافته', 'Allowed profile fields (name) update properly');

  // Creating a new user with client-supplied xp: 888888
  const newUser = await userRepo.upsertUser({
    userId: 'u_new_hacker',
    name: 'کاربر جدید',
    xp: 888888, // Should be ignored
  });
  assert(newUser.xp === 0, 'upsertUser initializes new user XP strictly to 0, discarding client xp');
  const dbNewUser = (await userRepo.getUserById('u_new_hacker'))!;
  assert(dbNewUser.xp === 0, 'Database confirms new user was stored with exactly 0 XP');

  // ---------------------------------------------------------------
  // 3. EVENT-LEVEL IDEMPOTENCY IN awardXp
  // ---------------------------------------------------------------
  console.log('\nTest Suite 3: Event-Level Idempotency in awardXp');

  // First legitimate reward
  const award1 = await userRepo.awardXp({
    userId: 'u_hist',
    idempotencyKey: 'evt_quiz_101',
    amount: 150,
    reason: 'stage_passed',
  });
  assert(award1.applied === true && award1.alreadyProcessed === false, 'First award applies successfully');
  assert(award1.updatedXp === 550, 'User XP incremented from 400 to 550');

  // Exact duplicate event (sequential retry)
  const award1Retry = await userRepo.awardXp({
    userId: 'u_hist',
    idempotencyKey: 'evt_quiz_101',
    amount: 150,
    reason: 'stage_passed',
  });
  assert(award1Retry.applied === false && award1Retry.alreadyProcessed === true, 'Retry detects duplicate event key');
  assert(award1Retry.updatedXp === 550, 'User XP was NOT incremented again on retry (remains 550)');
  assert(award1Retry.ledgerId === award1.ledgerId, 'Retry returns original ledgerId');

  // Distinct event with same reason
  const award2 = await userRepo.awardXp({
    userId: 'u_hist',
    idempotencyKey: 'evt_quiz_102',
    amount: 50,
    reason: 'stage_passed', // Same reason, distinct key
  });
  assert(award2.applied === true && award2.updatedXp === 600, 'Distinct event key with same reason awards XP correctly (now 600)');

  // Same event key for a DIFFERENT user
  const awardOtherUser = await userRepo.awardXp({
    userId: 'u_new_hacker',
    idempotencyKey: 'evt_quiz_101', // Same key, different user
    amount: 100,
    reason: 'stage_passed',
  });
  assert(awardOtherUser.applied === true && awardOtherUser.updatedXp === 100, 'Same event key for different user succeeds');

  // Ledger count verification
  const userLedger = await userRepo.getUserXpLedger('u_hist');
  // u_hist had 2 historical entries + 2 new awards (evt_quiz_101, evt_quiz_102)
  assert(userLedger.length === 4, 'Ledger contains exactly 4 entries for u_hist (no duplicates stored)');

  // Task 1: Rejection of XP awards for unknown users
  let threwUnknownUser = false;
  try {
    await userRepo.awardXp({
      userId: 'u_unknown_ghost',
      idempotencyKey: 'evt_ghost_01',
      amount: 100,
    });
  } catch (err: any) {
    if (err.message && err.message.includes("user 'u_unknown_ghost' not found")) {
      threwUnknownUser = true;
    }
  }
  assert(threwUnknownUser, 'awardXp rejects XP awards for unknown users');

  const ghostUserRow = sqlite.prepare("SELECT * FROM users WHERE user_id = 'u_unknown_ghost'").get();
  assert(ghostUserRow === undefined, 'No ghost user was created in users table');

  const ghostLedgerRows = sqlite.prepare("SELECT * FROM xp_ledger WHERE user_id = 'u_unknown_ghost'").all();
  assert(ghostLedgerRows.length === 0, 'No ghost entries were created in xp_ledger');

  // Retry with same idempotency key for unknown user also rejects safely
  let threwGhostRetry = false;
  try {
    await userRepo.awardXp({
      userId: 'u_unknown_ghost',
      idempotencyKey: 'evt_ghost_01',
      amount: 100,
    });
  } catch {
    threwGhostRetry = true;
  }
  assert(threwGhostRetry, 'Retry with same key for unknown user also rejects safely');

  // Name and avatar preservation when whitespace is passed to awardXp
  const awardWhitespaceName = await userRepo.awardXp({
    userId: 'u_hist',
    idempotencyKey: 'evt_quiz_103',
    amount: 25,
    name: '   ',
    avatar: '   ',
  });
  assert(awardWhitespaceName.profile.name === 'کاربر تاریخی تغییریافته', 'awardXp preserves existing name when whitespace passed');
  assert(awardWhitespaceName.profile.avatar === '🦉', 'awardXp preserves existing avatar when whitespace passed');

  // Empty userId in getUserXpLedger returns empty array
  const emptyLedger = await userRepo.getUserXpLedger('   ');
  assert(Array.isArray(emptyLedger) && emptyLedger.length === 0, 'getUserXpLedger returns empty array for empty/whitespace userId');

  // Validation rejections
  let threwAmountZero = false;
  try {
    await userRepo.awardXp({ userId: 'u_hist', idempotencyKey: 'evt_bad', amount: 0 });
  } catch {
    threwAmountZero = true;
  }
  assert(threwAmountZero, 'awardXp rejects amount = 0');

  let threwAmountNegative = false;
  try {
    await userRepo.awardXp({ userId: 'u_hist', idempotencyKey: 'evt_bad', amount: -20 });
  } catch {
    threwAmountNegative = true;
  }
  assert(threwAmountNegative, 'awardXp rejects negative amount');

  let threwAmountFractional = false;
  try {
    await userRepo.awardXp({ userId: 'u_hist', idempotencyKey: 'evt_bad', amount: 25.5 });
  } catch {
    threwAmountFractional = true;
  }
  assert(threwAmountFractional, 'awardXp rejects fractional amount');

  let threwAmountExcessive = false;
  try {
    await userRepo.awardXp({ userId: 'u_hist', idempotencyKey: 'evt_bad', amount: 1500 });
  } catch {
    threwAmountExcessive = true;
  }
  assert(threwAmountExcessive, 'awardXp rejects excessive amount > 1000');

  let threwEmptyKey = false;
  try {
    await userRepo.awardXp({ userId: 'u_hist', idempotencyKey: '   ', amount: 50 });
  } catch {
    threwEmptyKey = true;
  }
  assert(threwEmptyKey, 'awardXp rejects whitespace/empty idempotencyKey');

  // ---------------------------------------------------------------
  // 4. DATA INTEGRITY ERROR HANDLING ON STORED CORRUPTION
  // ---------------------------------------------------------------
  console.log('\nTest Suite 4: Fail-Safe Handling of Corrupted Stored Data');

  // Inject corrupted JSON directly into raw database table
  sqlite.exec(`
    INSERT INTO users (
      user_id, name, avatar, xp, streak_days, total_study_minutes,
      completed_chapters, completed_stages, unlocked_badge_ids, bookmarked_chapters, last_synced_at
    ) VALUES (
      'u_corrupted', 'کاربر خراب', '🦉', 100, 1, 0,
      '["psy_01"', -- Corrupted truncated JSON array
      '{}', '[]', '[]', datetime('now')
    )
  `);

  let caughtCorruptError = false;
  try {
    await userRepo.getUserById('u_corrupted');
  } catch (err) {
    if (err instanceof DataIntegrityError) {
      caughtCorruptError = true;
    }
  }
  assert(caughtCorruptError, 'getUserById throws DataIntegrityError on malformed JSON instead of silently returning empty array');

  // Verify upsertUser rejects updating when stored data cannot be safely read
  let upsertBlocked = false;
  try {
    await userRepo.upsertUser({
      userId: 'u_corrupted',
      name: 'تلاش برای ویرایش',
    });
  } catch (err) {
    if (err instanceof DataIntegrityError) {
      upsertBlocked = true;
    }
  }
  assert(upsertBlocked, 'upsertUser aborts on corrupted stored record, preventing silent destruction of user data');

  // ---------------------------------------------------------------
  // 5. QUESTION BANK RUNTIME VALIDATION
  // ---------------------------------------------------------------
  console.log('\nTest Suite 5: Question Bank Runtime Validation in addQuestion');

  // Valid question
  const validQ = await qRepo.addQuestion({
    chapterId: 'psy_01',
    chapterTitle: 'کلیات روان‌شناسی',
    difficulty: 'medium',
    question: 'ویلهلم وونت چه سالی آزمایشگاه لایپزیگ را بنیان نهاد؟',
    options: ['۱۸۷۹', '۱۹۰۰', '۱۸۵۰', '۱۹۱۴'],
    correctIndex: 0,
    explanation: 'در سال ۱۸۷۹ تأسیس شد.',
    source: 'academic-curated',
  });
  assert(validQ.id.startsWith('qb_'), 'addQuestion accepts valid question and generates valid ID');

  // 1. Strict four-option contract: Exactly 4 options required
  let threwTwoOptions = false;
  try {
    await qRepo.addQuestion({
      chapterId: 'psy_01',
      chapterTitle: 'کلیات',
      difficulty: 'easy',
      question: 'تست؟',
      options: ['الف', 'ب'], // Only 2 options
      correctIndex: 0,
      explanation: 'توضیح',
      source: 'academic-curated',
    });
  } catch (err: any) {
    if (err.message && err.message.includes('options must be an array of exactly 4 elements')) {
      threwTwoOptions = true;
    }
  }
  assert(threwTwoOptions, 'addQuestion rejects 2 options (strictly requires 4 options)');

  let threwThreeOptions = false;
  try {
    await qRepo.addQuestion({
      chapterId: 'psy_01',
      chapterTitle: 'کلیات',
      difficulty: 'easy',
      question: 'تست؟',
      options: ['الف', 'ب', 'ج'], // 3 options
      correctIndex: 0,
      explanation: 'توضیح',
      source: 'academic-curated',
    });
  } catch (err: any) {
    if (err.message && err.message.includes('options must be an array of exactly 4 elements')) {
      threwThreeOptions = true;
    }
  }
  assert(threwThreeOptions, 'addQuestion rejects 3 options (strictly requires 4 options)');

  let threwFiveOptions = false;
  try {
    await qRepo.addQuestion({
      chapterId: 'psy_01',
      chapterTitle: 'کلیات',
      difficulty: 'easy',
      question: 'تست؟',
      options: ['الف', 'ب', 'ج', 'د', 'هـ'], // 5 options
      correctIndex: 0,
      explanation: 'توضیح',
      source: 'academic-curated',
    });
  } catch (err: any) {
    if (err.message && err.message.includes('options must be an array of exactly 4 elements')) {
      threwFiveOptions = true;
    }
  }
  assert(threwFiveOptions, 'addQuestion rejects 5 options (strictly requires 4 options)');

  // 2. Out of bounds correctIndex for 4 options (0, 1, 2, 3)
  let threwIndexFour = false;
  try {
    await qRepo.addQuestion({
      chapterId: 'psy_01',
      chapterTitle: 'کلیات',
      difficulty: 'easy',
      question: 'تست؟',
      options: ['الف', 'ب', 'ج', 'د'],
      correctIndex: 4, // Out of bounds for 4 options!
      explanation: 'توضیح',
      source: 'academic-curated',
    });
  } catch (err: any) {
    if (err.message && err.message.includes('correctIndex must be an integer between 0 and 3')) {
      threwIndexFour = true;
    }
  }
  assert(threwIndexFour, 'addQuestion rejects correctIndex = 4 (must be 0 to 3)');

  let threwNegativeIndex = false;
  try {
    await qRepo.addQuestion({
      chapterId: 'psy_01',
      chapterTitle: 'کلیات',
      difficulty: 'easy',
      question: 'تست؟',
      options: ['الف', 'ب', 'ج', 'د'],
      correctIndex: -1,
      explanation: 'توضیح',
    });
  } catch (err: any) {
    if (err.message && err.message.includes('correctIndex must be an integer between 0 and 3')) {
      threwNegativeIndex = true;
    }
  }
  assert(threwNegativeIndex, 'addQuestion rejects negative correctIndex < 0');

  let threwFractionalIndex = false;
  try {
    await qRepo.addQuestion({
      chapterId: 'psy_01',
      chapterTitle: 'کلیات',
      difficulty: 'easy',
      question: 'تست؟',
      options: ['الف', 'ب', 'ج', 'د'],
      correctIndex: 1.5,
      explanation: 'توضیح',
    });
  } catch {
    threwFractionalIndex = true;
  }
  assert(threwFractionalIndex, 'addQuestion rejects fractional correctIndex');

  // 3. Invalid difficulty and source
  let threwBadDifficulty = false;
  try {
    await qRepo.addQuestion({
      chapterId: 'psy_01',
      chapterTitle: 'کلیات',
      difficulty: 'insane' as any,
      question: 'تست؟',
      options: ['الف', 'ب', 'ج', 'د'],
      correctIndex: 0,
      explanation: 'توضیح',
    });
  } catch {
    threwBadDifficulty = true;
  }
  assert(threwBadDifficulty, 'addQuestion rejects invalid difficulty');

  let threwBadSource = false;
  try {
    await qRepo.addQuestion({
      chapterId: 'psy_01',
      chapterTitle: 'کلیات',
      difficulty: 'easy',
      question: 'تست؟',
      options: ['الف', 'ب', 'ج', 'د'],
      correctIndex: 0,
      explanation: 'توضیح',
      source: 'web-scraper' as any,
    });
  } catch {
    threwBadSource = true;
  }
  assert(threwBadSource, 'addQuestion rejects invalid source');

  // 4. Empty or whitespace options
  let threwEmptyOptions = false;
  try {
    await qRepo.addQuestion({
      chapterId: 'psy_01',
      chapterTitle: 'کلیات',
      difficulty: 'easy',
      question: 'تست؟',
      options: ['الف', 'ب', 'ج', '   '],
      correctIndex: 0,
      explanation: 'توضیح',
    });
  } catch (err: any) {
    if (err.message && err.message.includes('option at index 3 must be a non-empty string')) {
      threwEmptyOptions = true;
    }
  }
  assert(threwEmptyOptions, 'addQuestion rejects empty or whitespace option strings');

  // 5. parsePersistedOptions unit tests
  const parsedValid = parsePersistedOptions(JSON.stringify(['۱', '۲', '۳', '۴']));
  assert(parsedValid.length === 4, 'parsePersistedOptions parses valid 4-option JSON array');

  let parsedThrowsTwo = false;
  try {
    parsePersistedOptions(JSON.stringify(['۱', '۲']));
  } catch (err) {
    if (err instanceof DataIntegrityError) parsedThrowsTwo = true;
  }
  assert(parsedThrowsTwo, 'parsePersistedOptions rejects array with 2 options');

  let parsedThrowsFive = false;
  try {
    parsePersistedOptions(JSON.stringify(['۱', '۲', '۳', '۴', '۵']));
  } catch (err) {
    if (err instanceof DataIntegrityError) parsedThrowsFive = true;
  }
  assert(parsedThrowsFive, 'parsePersistedOptions rejects array with 5 options');

  // 6. recordAnswered validation
  const recordInvalid = await qRepo.recordAnswered('   ');
  assert(recordInvalid === false, 'recordAnswered returns false for empty questionId');

  const recordSuccess = await qRepo.recordAnswered(validQ.id);
  assert(recordSuccess === true, 'recordAnswered increments count for valid question');

  // 7. Leaderboard rank calculation with nonexistent user
  const leaderboardUnknown = await userRepo.getLeaderboard('u_nonexistent_user_999');
  assert(leaderboardUnknown.currentUserRank === -1, 'getLeaderboard returns -1 for nonexistent user rank');

  // ---------------------------------------------------------------
  // 6. HARDENED HEALTH CHECK ENDPOINT
  // ---------------------------------------------------------------
  console.log('\nTest Suite 6: Hardened D1 Health Check Endpoint');

  const mockEnv: Env = {
    DB: mockDb,
  };
  const mockCtx = {
    waitUntil: () => {},
    passThroughOnException: () => {},
  };

  // 1. GET /api/d1/health -> 200 OK
  const getReq = new Request('http://localhost/api/d1/health', { method: 'GET' });
  const getRes = await workerDefault.fetch(getReq, mockEnv, mockCtx);
  assert(getRes.status === 200, 'GET /api/d1/health returns 200 OK');
  assert(getRes.headers.get('Cache-Control') === 'no-store', 'Health check enforces Cache-Control: no-store');
  const getBody = (await getRes.json()) as any;
  assert(getBody.ok === true && getBody.status === 'connected', 'Response contains ok: true, status: connected');
  assert(getBody.tables === undefined, 'CRITICAL: Database tables list is NOT exposed in response');

  // 2. POST /api/d1/health -> 405 Method Not Allowed
  const postReq = new Request('http://localhost/api/d1/health', { method: 'POST' });
  const postRes = await workerDefault.fetch(postReq, mockEnv, mockCtx);
  assert(postRes.status === 405, 'POST /api/d1/health returns 405 Method Not Allowed');
  assert(postRes.headers.get('Allow') === 'GET', '405 response includes Allow: GET header');
  assert(postRes.headers.get('Cache-Control') === 'no-store', '405 response includes Cache-Control: no-store');

  // 3. Simulated DB failure on GET -> 500 controlled error without stack trace
  const brokenDbEnv: Env = {
    DB: {
      ...mockDb,
      prepare() {
        throw new Error('Database disk image is malformed: sensitive internal path /var/d1/db.sqlite');
      },
    },
  };
  const failReq = new Request('http://localhost/api/d1/health', { method: 'GET' });
  const failRes = await workerDefault.fetch(failReq, brokenDbEnv, mockCtx);
  assert(failRes.status === 500, 'Failing DB returns 500 status');
  const failBody = (await failRes.json()) as any;
  assert(failBody.error === 'Failed to verify database connectivity', 'Controlled error message returned');
  assert(!JSON.stringify(failBody).includes('/var/d1'), 'Internal SQL/path details are NOT leaked to client');

  console.log('\n====================================================');
  console.log(`ALL TESTS PASSED! (${passed} checks passed, ${failed} failed)`);
  console.log('====================================================\n');
}

runTestSuite().catch((err) => {
  console.error('\n❌ FATAL TEST FAILURE:', err);
  process.exit(1);
});
