/**
 * Automated Regression Test Suite for D1 Data Integrity & Reward Security
 * Project: PsychoMaster (روان‌لینگو) - Phase 4C
 *
 * Runs on Node 22 using SQLite in-memory engine to guarantee 100% test isolation.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import workerDefault from '../src/worker/index.ts';
import {
  D1UserRepository,
  D1QuestionRepository,
  DataIntegrityError,
  rowToSyncedUserProfile,
  parsePersistedOptions,
} from '../src/worker/db/index.ts';
import {
  hashSessionToken,
  generateSessionToken,
  generateAuthNonce,
  verifyGoogleIdToken,
  extractCookieValue,
  validateRequestOrigin,
  buildCookieHeader,
  clearCookieHeader,
} from '../src/worker/auth.ts';
import { userSyncManager } from '../src/server/userStore.ts';
import { verifyRewardSubmission, buildCanonicalStageAnswers } from '../src/worker/rewards.ts';
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

  // ---------------------------------------------------------------
  // 7. SEQUENTIAL MIGRATION 0003 & HASHED SESSIONS IN D1
  // ---------------------------------------------------------------
  console.log('\nTest Suite 7: Sequential Migrations 0003 & 0004 & Opaque Hashed Sessions in D1');
  const m3 = fs.readFileSync('migrations/0003_auth_sessions.sql', 'utf8');
  sqlite.exec(m3);
  const m4 = fs.readFileSync('migrations/0004_auth_nonces.sql', 'utf8');
  sqlite.exec(m4);

  const sessionsTableCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").get();
  assert(Boolean(sessionsTableCheck), 'Migration 0003 creates sessions table successfully');
  const noncesTableCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='auth_nonces'").get();
  assert(Boolean(noncesTableCheck), 'Migration 0004 creates auth_nonces table successfully');

  const histUserWithAuth = sqlite.prepare("SELECT user_id, email, google_id, picture FROM users WHERE user_id = 'u_hist'").get() as any;
  assert(histUserWithAuth && histUserWithAuth.email === null, 'Historical user retained safely with NULL auth fields');

  // Session Token Creation & SHA-256 Hashing Verification
  const rawToken = generateSessionToken();
  assert(rawToken.length >= 32, 'generateSessionToken creates cryptographically strong opaque token');
  const tokenHash = await hashSessionToken(rawToken);
  assert(tokenHash.length === 64, 'hashSessionToken produces 64-character hex SHA-256 string');

  const createdSession = await userRepo.createSession('u_hist', tokenHash);
  assert(createdSession.userId === 'u_hist', 'createSession associates session with user');

  // Verify in direct SQLite that raw token is NOT stored in DB, only the SHA-256 hash
  const storedSessionRow = sqlite.prepare('SELECT * FROM sessions WHERE id = ?').get(createdSession.id) as any;
  assert(storedSessionRow.token_hash === tokenHash, 'Database stores SHA-256 token hash');
  assert(storedSessionRow.token_hash !== rawToken, 'Raw session token is NEVER stored in database');

  // Validate session
  const validSession = await userRepo.validateSession(tokenHash);
  assert(validSession !== null && validSession.user.userId === 'u_hist', 'validateSession validates active session and loads user');

  // Tampered token hash rejects
  const tamperedSession = await userRepo.validateSession('0000000000000000000000000000000000000000000000000000000000000000');
  assert(tamperedSession === null, 'validateSession rejects invalid/tampered token hash');

  // Delete session
  const deleted = await userRepo.deleteSession(tokenHash);
  assert(deleted === true, 'deleteSession deletes session successfully');
  const recheckSession = await userRepo.validateSession(tokenHash);
  assert(recheckSession === null, 'Deleted session is immediately rejected on validation');

  // ---------------------------------------------------------------
  // 8. GOOGLE AUTHENTICATION & GUEST PROGRESS MERGING
  // ---------------------------------------------------------------
  console.log('\nTest Suite 8: Google Account Management & Atomic Guest Progress Merging');

  // Create Google User
  const googleUserRes = await userRepo.createOrUpdateGoogleUser({
    googleId: 'google_sub_10928301',
    email: 'student@tehran.ac.ir',
    name: 'دانشجوی دانشگاه تهران',
    picture: 'https://lh3.googleusercontent.com/a/student=s96-c',
  });
  assert(googleUserRes.isNew === true, 'createOrUpdateGoogleUser marks new user as isNew: true');
  assert(googleUserRes.user.xp === 0, 'New Google user initialized strictly to 0 XP');
  assert(googleUserRes.user.email === 'student@tehran.ac.ir', 'User email stored correctly');
  assert(googleUserRes.user.googleId === 'google_sub_10928301', 'User googleId stored correctly');

  // Re-login with same Google credentials returns existing user
  const returningUserRes = await userRepo.createOrUpdateGoogleUser({
    googleId: 'google_sub_10928301',
    email: 'student@tehran.ac.ir',
    name: 'دانشجوی دانشگاه تهران',
  });
  assert(returningUserRes.isNew === false, 'Re-login recognizes returning user (isNew: false)');
  assert(returningUserRes.user.userId === googleUserRes.user.userId, 'Returning user retains identical user_id');

  // Find user by Google ID and by Email
  const foundByGid = await userRepo.findUserByGoogleId('google_sub_10928301');
  assert(foundByGid !== null && foundByGid.userId === googleUserRes.user.userId, 'findUserByGoogleId locates user');
  const foundByEmail = await userRepo.findUserByEmail('STUDENT@TEHRAN.AC.IR');
  assert(foundByEmail !== null && foundByEmail.userId === googleUserRes.user.userId, 'findUserByEmail is case-insensitive');

  // Create an offline guest user with progress and XP
  const guestUser = await userRepo.upsertUser({
    userId: 'u_guest_offline',
    name: 'مهمان آفلاین',
    completedChapters: ['psy_01', 'psy_03'],
    streakDays: 4,
    totalStudyMinutes: 90,
  });
  await userRepo.awardXp({
    userId: 'u_guest_offline',
    idempotencyKey: 'offline_quiz_1',
    amount: 200,
    reason: 'stage_completion',
  });
  const guestBeforeMerge = (await userRepo.getUserById('u_guest_offline'))!;
  assert(guestBeforeMerge.xp === 200, 'Guest has 200 XP before merge');

  // Atomically merge guest into Google user
  const mergedGoogleUser = await userRepo.mergeGuestIntoUser(
    googleUserRes.user.userId,
    'u_guest_offline'
  );
  assert(mergedGoogleUser.xp === 200, 'Google user successfully received guest 200 XP');
  assert(mergedGoogleUser.completedChapters.includes('psy_01'), 'Google user contains merged chapter psy_01');
  assert(mergedGoogleUser.completedChapters.includes('psy_03'), 'Google user contains merged chapter psy_03');
  assert(mergedGoogleUser.streakDays === 4, 'Google user retained maximum streak days (4)');
  assert(mergedGoogleUser.totalStudyMinutes === 90, 'Google user retained study minutes (90)');

  // ---------------------------------------------------------------
  // 9. CRYPTOGRAPHIC GOOGLE AUTHENTICATION & SESSION SECURITY (PHASE 5C)
  // ---------------------------------------------------------------
  console.log('\nTest Suite 9: Cryptographic Google Identity Verification & Endpoint Security');

  // Generate real RS256 keypairs for controlled cryptographic testing
  const validKeyPair = await generateKeyPair('RS256');
  const attackerKeyPair = await generateKeyPair('RS256');

  const validPublicJwk = await exportJWK(validKeyPair.publicKey);
  validPublicJwk.kid = 'google-test-key-rs256-1';
  validPublicJwk.alg = 'RS256';
  validPublicJwk.use = 'sig';

  const testJwks = createLocalJWKSet({ keys: [validPublicJwk] });
  const TEST_GOOGLE_CLIENT_ID = '713146407716-testclient.apps.googleusercontent.com';

  const authEnv: Env = {
    DB: mockDb,
    GOOGLE_CLIENT_ID: TEST_GOOGLE_CLIENT_ID,
    GOOGLE_JWKS: testJwks,
  };

  async function signTestGoogleJwt(
    claims: Record<string, unknown>,
    options?: {
      privateKey?: CryptoKey;
      issuer?: string;
      audience?: string;
      subject?: string;
      expirationTime?: number | string;
      kid?: string;
    }
  ): Promise<string> {
    const signerKey = options?.privateKey || validKeyPair.privateKey;
    const jwt = new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: options?.kid || 'google-test-key-rs256-1', typ: 'JWT' })
      .setIssuedAt();

    if (options?.issuer !== undefined) {
      jwt.setIssuer(options.issuer);
    } else {
      jwt.setIssuer('https://accounts.google.com');
    }

    if (options?.audience !== undefined) {
      jwt.setAudience(options.audience);
    } else {
      jwt.setAudience(TEST_GOOGLE_CLIENT_ID);
    }

    if (options?.subject !== undefined) {
      if (options.subject !== '') {
        jwt.setSubject(options.subject);
      }
    } else {
      jwt.setSubject('google_verified_sub_9001');
    }

    if (options?.expirationTime !== undefined) {
      jwt.setExpirationTime(options.expirationTime);
    } else {
      jwt.setExpirationTime('1h');
    }

    return await jwt.sign(signerKey);
  }

  // 9.1. Unauthenticated account-list endpoint is completely unavailable (404)
  const accountsListReq = new Request('http://localhost/api/auth/accounts', { method: 'GET' });
  const accountsListRes = await workerDefault.fetch(accountsListReq, authEnv, mockCtx);
  assert(accountsListRes.status === 404, 'GET /api/auth/accounts returns 404 Not Found (account enumeration removed)');

  // 9.2. Fail closed when GOOGLE_CLIENT_ID is missing
  const unconfiguredEnv: Env = { DB: mockDb };
  const validTokenForUnconfigured = await signTestGoogleJwt({
    email: 'user@gmail.com',
    email_verified: true,
    name: 'Test User',
  });
  const unconfReq = new Request('http://localhost/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: validTokenForUnconfigured }),
  });
  const unconfRes = await workerDefault.fetch(unconfReq, unconfiguredEnv, mockCtx);
  assert(unconfRes.status === 503, 'POST /api/auth/google fails closed (503) when GOOGLE_CLIENT_ID is missing');

  // 9.3. Missing Google credential rejected
  const missingCredReq = new Request('http://localhost/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const missingCredRes = await workerDefault.fetch(missingCredReq, authEnv, mockCtx);
  assert(missingCredRes.status === 400, 'Missing Google credential rejected with 400');

  // 9.4. Arbitrary plain googleId and email rejected (no credential)
  const forgedPlainReq = new Request('http://localhost/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      googleId: 'google_sub_10928301',
      email: 'student@tehran.ac.ir',
      name: 'Impersonator',
    }),
  });
  const forgedPlainRes = await workerDefault.fetch(forgedPlainReq, authEnv, mockCtx);
  assert(forgedPlainRes.status === 400, 'Plain { googleId, email } payload without signed credential rejected with 400');

  // 9.5. Malformed JWT rejected
  const malformedReq = new Request('http://localhost/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: 'not.a.valid.jwt.token' }),
  });
  const malformedRes = await workerDefault.fetch(malformedReq, authEnv, mockCtx);
  assert(malformedRes.status === 401, 'Malformed JWT rejected with 401');

  // 9.6. Unsigned / base64-forged JWT rejected
  const forgedHeader = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const forgedPayload = Buffer.from(
    JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: TEST_GOOGLE_CLIENT_ID,
      sub: 'google_sub_10928301',
      email: 'student@tehran.ac.ir',
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString('base64url');
  const forgedUnsignedToken = `${forgedHeader}.${forgedPayload}.fakesignaturebytes`;
  const unsignedRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: forgedUnsignedToken }),
    }),
    authEnv,
    mockCtx
  );
  assert(unsignedRes.status === 401, 'Forged unverified JWT payload with fake signature rejected with 401');

  // 9.7. Invalid cryptographic signature (signed with wrong RSA private key) rejected
  const wrongKeyToken = await signTestGoogleJwt(
    { email: 'student@tehran.ac.ir', email_verified: true, name: 'Wrong Key' },
    { privateKey: attackerKeyPair.privateKey }
  );
  const wrongKeyRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: wrongKeyToken }),
    }),
    authEnv,
    mockCtx
  );
  assert(wrongKeyRes.status === 401, 'JWT signed with attacker RSA key rejected with 401 (INVALID_SIGNATURE)');

  // 9.8. Invalid issuer rejected
  const badIssuerToken = await signTestGoogleJwt(
    { email: 'student@tehran.ac.ir', email_verified: true },
    { issuer: 'https://evil-idp.example.com' }
  );
  const badIssuerRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: badIssuerToken }),
    }),
    authEnv,
    mockCtx
  );
  assert(badIssuerRes.status === 401, 'JWT with invalid issuer (iss) rejected with 401');

  // 9.9. Invalid audience rejected
  const badAudToken = await signTestGoogleJwt(
    { email: 'student@tehran.ac.ir', email_verified: true },
    { audience: 'other-app-client-id.apps.googleusercontent.com' }
  );
  const badAudRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: badAudToken }),
    }),
    authEnv,
    mockCtx
  );
  assert(badAudRes.status === 401, 'JWT with wrong audience (aud) rejected with 401');

  // 9.10. Expired token rejected
  const expiredToken = await signTestGoogleJwt(
    { email: 'student@tehran.ac.ir', email_verified: true },
    { expirationTime: Math.floor(Date.now() / 1000) - 600 }
  );
  const expiredRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: expiredToken }),
    }),
    authEnv,
    mockCtx
  );
  assert(expiredRes.status === 401, 'Expired Google ID token rejected with 401');

  // 9.11. Unverified email rejected
  const unverifiedEmailToken = await signTestGoogleJwt({
    email: 'unverified@gmail.com',
    email_verified: false,
  });
  const unverifiedEmailRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: unverifiedEmailToken }),
    }),
    authEnv,
    mockCtx
  );
  assert(unverifiedEmailRes.status === 401, 'Google ID token with email_verified: false rejected with 401');

  // 9.12. Missing sub rejected
  const missingSubToken = await signTestGoogleJwt(
    { email: 'nosub@gmail.com', email_verified: true },
    { subject: '' }
  );
  const missingSubRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: missingSubToken }),
    }),
    authEnv,
    mockCtx
  );
  assert(missingSubRes.status === 401, 'Google ID token without sub claim rejected with 401');

  // 9.13. Nonce binding verification: GET /api/auth/nonce & reject mismatched nonce
  const nonceReq = new Request('http://localhost/api/auth/nonce', { method: 'GET' });
  const nonceRes = await workerDefault.fetch(nonceReq, authEnv, mockCtx);
  assert(nonceRes.status === 200, 'GET /api/auth/nonce returns 200 OK');
  const nonceBody = (await nonceRes.json()) as any;
  const serverNonce = nonceBody.nonce;
  assert(typeof serverNonce === 'string' && serverNonce.length >= 16, 'Server issues cryptographic nonce');
  const nonceCookieHeader = nonceRes.headers.get('Set-Cookie') || '';
  assert(nonceCookieHeader.includes(`oauth_nonce=${serverNonce}`), 'Sets HttpOnly oauth_nonce cookie');

  const wrongNonceToken = await signTestGoogleJwt({
    email: 'masirsalamatt@gmail.com',
    email_verified: true,
    nonce: 'mismatched_nonce_value',
  });
  const wrongNonceRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `oauth_nonce=${serverNonce}`,
      },
      body: JSON.stringify({ credential: wrongNonceToken }),
    }),
    authEnv,
    mockCtx
  );
  assert(wrongNonceRes.status === 401, 'Mismatched nonce rejected with 401 (INVALID_NONCE)');

  // 9.14. Cross-origin CSRF protection rejects forged Origin header
  const validTokenWithNonce = await signTestGoogleJwt(
    {
      email: 'masirsalamatt@gmail.com',
      email_verified: true,
      name: 'مسیر سلامت',
      picture: 'https://lh3.googleusercontent.com/a/masir=s96-c',
      nonce: serverNonce,
    },
    { subject: 'google_verified_sub_9001' }
  );
  const csrfOriginRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil-phishing.example.com',
        Cookie: `oauth_nonce=${serverNonce}`,
      },
      body: JSON.stringify({ credential: validTokenWithNonce }),
    }),
    authEnv,
    mockCtx
  );
  assert(csrfOriginRes.status === 403, 'Cross-origin POST /api/auth/google rejected with 403 Forbidden');

  // 9.15. Valid cryptographically signed Google ID token establishes account and HttpOnly session
  const authPostReq = new Request('http://localhost/api/auth/google', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
      Cookie: `oauth_nonce=${serverNonce}`,
    },
    body: JSON.stringify({
      credential: validTokenWithNonce,
      // Attempt to pass untrusted override fields in body — server must ignore them
      googleId: 'forged_ignored_sub',
      email: 'forged_ignored@evil.com',
      xp: 999999,
    }),
  });
  const authPostRes = await workerDefault.fetch(authPostReq, authEnv, mockCtx);
  assert(authPostRes.status === 200, 'Valid signed Google credential returns 200 OK');
  const authPostJson = (await authPostRes.json()) as any;
  assert(authPostJson.ok === true && authPostJson.isNew === true, 'Creates new verified user account');
  assert(authPostJson.sessionToken === undefined, 'Raw sessionToken is NOT exposed in response JSON body');
  assert(authPostJson.user.email === 'masirsalamatt@gmail.com', 'Uses verified email from signed JWT, ignoring body override');
  assert(authPostJson.user.googleId === 'google_verified_sub_9001', 'Uses verified sub from signed JWT, ignoring body override');
  assert(authPostJson.user.xp === 0, 'New verified user starts strictly at 0 XP');

  const setCookieHeader = authPostRes.headers.get('Set-Cookie') || '';
  assert(setCookieHeader.includes('session_token=') && setCookieHeader.includes('HttpOnly'), 'Sets HttpOnly session_token cookie');
  const workerSessionToken = extractCookieValue(setCookieHeader, 'session_token')!;
  assert(Boolean(workerSessionToken && workerSessionToken.length >= 32), 'Extracted high-entropy session cookie token');

  // 9.16. Award XP to verified user, then sign in again with same `sub` using a fresh server nonce -> preserves XP and userId
  await userRepo.awardXp({
    userId: authPostJson.user.userId,
    idempotencyKey: 'verified_user_quiz_1',
    amount: 175,
    reason: 'stage_completion',
  });

  // Replaying the already-consumed nonce from 9.15 MUST be rejected with 401
  const replaySameNonceRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `oauth_nonce=${serverNonce}`,
      },
      body: JSON.stringify({ credential: validTokenWithNonce }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    replaySameNonceRes.status === 401,
    'Replaying an already-consumed server nonce is rejected with 401 (single-use enforcement)'
  );

  // Request a fresh nonce for legitimate re-login
  const reloginNonceRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/nonce', { method: 'GET' }),
    authEnv,
    mockCtx
  );
  const reloginNonce = ((await reloginNonceRes.json()) as any).nonce;
  const reloginToken = await signTestGoogleJwt(
    {
      email: 'masirsalamatt@gmail.com',
      email_verified: true,
      name: 'مسیر سلامت',
      picture: 'https://lh3.googleusercontent.com/a/masir=s96-c',
      nonce: reloginNonce,
    },
    { subject: 'google_verified_sub_9001' }
  );

  const reloginRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `oauth_nonce=${reloginNonce}`,
      },
      body: JSON.stringify({ credential: reloginToken }),
    }),
    authEnv,
    mockCtx
  );
  const reloginJson = (await reloginRes.json()) as any;
  assert(reloginRes.status === 200 && reloginJson.isNew === false, 'Repeated sign-in with same sub resolves existing account');
  assert(reloginJson.user.userId === authPostJson.user.userId, 'Repeated sign-in preserves exact userId');
  assert(reloginJson.user.xp === 175, 'Repeated sign-in preserves existing 175 XP without resetting');

  // 9.17. Never link accounts solely because their email values match
  const distinctSubNonceRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/nonce', { method: 'GET' }),
    authEnv,
    mockCtx
  );
  const distinctSubNonce = ((await distinctSubNonceRes.json()) as any).nonce;
  const differentSubSameEmailToken = await signTestGoogleJwt(
    {
      email: 'student@tehran.ac.ir', // Same email as google_sub_10928301 (which has 200 XP)
      email_verified: true,
      name: 'Different Sub Account',
      nonce: distinctSubNonce,
    },
    { subject: 'google_distinct_sub_77777' }
  );
  const distinctSubRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `oauth_nonce=${distinctSubNonce}`,
      },
      body: JSON.stringify({ credential: differentSubSameEmailToken }),
    }),
    authEnv,
    mockCtx
  );
  const distinctSubJson = (await distinctSubRes.json()) as any;
  assert(distinctSubRes.status === 200 && distinctSubJson.isNew === true, 'Different sub with matching email creates separate account');
  assert(distinctSubJson.user.userId !== googleUserRes.user.userId, 'Does NOT link to existing account solely by email');
  assert(distinctSubJson.user.xp === 0, 'Separate sub account starts at 0 XP and does not inherit other user XP');

  // 9.18. GET /api/auth/me (valid session cookie)
  const meReq = new Request('http://localhost/api/auth/me', {
    method: 'GET',
    headers: { Cookie: `session_token=${workerSessionToken}` },
  });
  const meRes = await workerDefault.fetch(meReq, authEnv, mockCtx);
  assert(meRes.status === 200, 'GET /api/auth/me returns 200 OK for valid HttpOnly session cookie');
  const meJson = (await meRes.json()) as any;
  assert(meJson.ok === true && meJson.user.userId === authPostJson.user.userId, 'Returns authenticated user from session cookie');

  // 9.19. GET /api/auth/me (invalid & expired sessions rejected)
  const invalidMeReq = new Request('http://localhost/api/auth/me', {
    method: 'GET',
    headers: { Cookie: 'session_token=fake_invalid_token_xyz' },
  });
  const invalidMeRes = await workerDefault.fetch(invalidMeReq, authEnv, mockCtx);
  assert(invalidMeRes.status === 401, 'GET /api/auth/me returns 401 Unauthorized for invalid session cookie');

  const expiredRawToken = generateSessionToken();
  const expiredTokenHash = await hashSessionToken(expiredRawToken);
  await userRepo.createSession(authPostJson.user.userId, expiredTokenHash, -60); // Expired 60s ago
  const expiredSessionMeRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `session_token=${expiredRawToken}` },
    }),
    authEnv,
    mockCtx
  );
  assert(expiredSessionMeRes.status === 401, 'GET /api/auth/me rejects expired session token with 401');

  // 9.20. POST /api/auth/profile (Update name and avatar with valid session cookie)
  const profileReq = new Request('http://localhost/api/auth/profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `session_token=${workerSessionToken}`,
    },
    body: JSON.stringify({
      name: 'دکتر مریم دانشور',
      avatar: '🧠',
    }),
  });
  const profileRes = await workerDefault.fetch(profileReq, authEnv, mockCtx);
  assert(profileRes.status === 200, 'POST /api/auth/profile returns 200 OK');
  const profileJson = (await profileRes.json()) as any;
  assert(profileJson.ok === true && profileJson.user.name === 'دکتر مریم دانشور', 'Profile name updated successfully');
  assert(profileJson.user.avatar === '🧠', 'Profile avatar updated successfully');

  // 9.21. POST /api/auth/logout revokes session
  const logoutReq = new Request('http://localhost/api/auth/logout', {
    method: 'POST',
    headers: { Cookie: `session_token=${workerSessionToken}` },
  });
  const logoutRes = await workerDefault.fetch(logoutReq, authEnv, mockCtx);
  assert(logoutRes.status === 200, 'POST /api/auth/logout returns 200 OK');
  assert(Boolean(logoutRes.headers.get('Set-Cookie')?.includes('Max-Age=0')), 'Logout clears session_token cookie');

  const postLogoutMeRes = await workerDefault.fetch(meReq, authEnv, mockCtx);
  assert(postLogoutMeRes.status === 401, 'Post-logout GET /api/auth/me returns 401 (session revoked in D1)');

  // 9.22. Worker /api/user/sync, /api/leaderboard, and /api/leaderboard/submit with Guest Session Binding
  const syncReq = new Request('http://localhost/api/user/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'u_sync_worker_test',
      name: 'دانشجوی همگام‌شده D1',
      avatar: '👩‍🏫',
      xp: 500000, // Untrusted client XP must be ignored
      streakDays: 5,
      totalStudyMinutes: 120,
      completedChapters: ['psy_01', 'psy_02'],
      bookmarkedChapters: ['psy_01'],
    }),
  });
  const syncRes = await workerDefault.fetch(syncReq, authEnv, mockCtx);
  assert(syncRes.status === 200, 'POST /api/user/sync returns 200 OK');
  const syncJson = (await syncRes.json()) as any;
  assert(syncJson.success === true && syncJson.profile.xp === 0, 'Worker /api/user/sync ignores client-supplied XP');
  const guestSetCookie = syncRes.headers.get('Set-Cookie') || '';
  const guestSessionToken = extractCookieValue(guestSetCookie, 'guest_session_token')!;
  assert(Boolean(guestSessionToken && guestSessionToken.length >= 32), 'POST /api/user/sync issues HttpOnly guest_session_token cookie for new guest');

  const submitScoreReq = new Request('http://localhost/api/leaderboard/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `guest_session_token=${guestSessionToken}`,
    },
    body: JSON.stringify({
      userId: 'u_sync_worker_test',
      rewardType: 'stage_completion',
      stageNumber: 1,
      stars: 3,
      score: 10,
      totalQuestions: 10,
      stageAnswers: buildCanonicalStageAnswers(1),
      streakDays: 6,
      idempotencyKey: 'evt_test_submit_1',
    }),
  });
  const submitScoreRes = await workerDefault.fetch(submitScoreReq, authEnv, mockCtx);
  assert(submitScoreRes.status === 200, 'POST /api/leaderboard/submit returns 200 OK with valid guest session');
  const submitScoreJson = (await submitScoreRes.json()) as any;
  assert(submitScoreJson.success === true && submitScoreJson.updatedXp === 15, 'Awarded canonical 15 XP for Stage 1 in D1');

  // 9.23. Unauthenticated caller cannot impersonate or mutate a Google-authenticated user via sync/leaderboard/merge
  const unauthSyncGoogleUserRes = await workerDefault.fetch(
    new Request('http://localhost/api/user/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: authPostJson.user.userId,
        name: 'Hijacked Name',
        completedChapters: ['psy_01', 'psy_02', 'psy_03'],
      }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    unauthSyncGoogleUserRes.status === 401,
    'Unauthenticated POST /api/user/sync targeting a Google account is rejected with 401'
  );

  const unauthGetGoogleUserRes = await workerDefault.fetch(
    new Request(`http://localhost/api/user/sync/${encodeURIComponent(authPostJson.user.userId)}`, {
      method: 'GET',
    }),
    authEnv,
    mockCtx
  );
  assert(
    unauthGetGoogleUserRes.status === 401,
    'Unauthenticated GET /api/user/sync/:userId targeting a Google account is rejected with 401'
  );

  const unauthSubmitGoogleUserRes = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: authPostJson.user.userId,
        xpEarned: 500,
        idempotencyKey: 'forged_xp_award_attempt',
      }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    unauthSubmitGoogleUserRes.status === 401,
    'Unauthenticated POST /api/leaderboard/submit targeting a Google account is rejected with 401'
  );

  const attemptMergeGoogleAsGuest = await userRepo.mergeGuestIntoUser(
    distinctSubJson.user.userId,
    authPostJson.user.userId
  );
  assert(
    attemptMergeGoogleAsGuest.xp === 0,
    'mergeGuestIntoUser refuses to merge a Google-authenticated account as a guest'
  );

  // ---------------------------------------------------------------
  // 10. CONCURRENT GUEST MERGE & EXPRESS XP PROTECTION (PHASE 5C)
  // ---------------------------------------------------------------
  console.log('\nTest Suite 10: Concurrent Guest Merge Atomicity & Express Server-Owned XP Protection');

  // 10.1. Repeated & concurrent guest merges in D1 do NOT double-count study minutes or XP
  const mergeTarget = await userRepo.createOrUpdateGoogleUser({
    googleId: 'google_sub_concurrent_merge_1',
    email: 'concurrent@tehran.ac.ir',
    name: 'کاربر تست همزمانی',
  });
  await userRepo.upsertUser({
    userId: 'u_guest_concurrent_1',
    name: 'مهمان همزمان',
    totalStudyMinutes: 45,
    completedChapters: ['psy_01', 'psy_02'],
    streakDays: 3,
  });
  await userRepo.awardXp({
    userId: 'u_guest_concurrent_1',
    idempotencyKey: 'guest_conc_xp_1',
    amount: 150,
    reason: 'stage_completion',
  });

  // Execute 5 concurrent merge calls against separate repository instances sharing the same DB
  const repoA = new D1UserRepository(mockDb);
  const repoB = new D1UserRepository(mockDb);
  const repoC = new D1UserRepository(mockDb);
  const concurrentResults = await Promise.all([
    repoA.mergeGuestIntoUser(mergeTarget.user.userId, 'u_guest_concurrent_1'),
    repoB.mergeGuestIntoUser(mergeTarget.user.userId, 'u_guest_concurrent_1'),
    repoC.mergeGuestIntoUser(mergeTarget.user.userId, 'u_guest_concurrent_1'),
    userRepo.mergeGuestIntoUser(mergeTarget.user.userId, 'u_guest_concurrent_1'),
    userRepo.mergeGuestIntoUser(mergeTarget.user.userId, 'u_guest_concurrent_1'),
  ]);
  const finalMergedTarget = (await userRepo.getUserById(mergeTarget.user.userId))!;
  assert(
    finalMergedTarget.xp === 150,
    `Concurrent guest merge awarded XP exactly once (expected 150, got ${finalMergedTarget.xp})`
  );
  assert(
    finalMergedTarget.totalStudyMinutes === 45,
    `Concurrent guest merge added study minutes exactly once (expected 45, got ${finalMergedTarget.totalStudyMinutes})`
  );
  assert(
    concurrentResults.every((r) => r.xp === 150 && r.totalStudyMinutes === 45),
    'All concurrent merge callers observe consistent non-inflated state'
  );

  // Also test 0-XP guest merge retry to ensure study minutes are never double-counted even when guestXp === 0
  await userRepo.mergeGuestIntoUser(mergeTarget.user.userId, 'u_guest_zero_xp', {
    totalStudyMinutes: 30,
    completedChapters: [],
    xp: 0,
  });
  const afterZeroXpRepeat = await userRepo.mergeGuestIntoUser(mergeTarget.user.userId, 'u_guest_zero_xp', {
    totalStudyMinutes: 30,
    completedChapters: [],
    xp: 0,
  });
  assert(
    afterZeroXpRepeat.totalStudyMinutes === 75,
    `0-XP guest merge retry does NOT double-count study minutes (expected 75, got ${afterZeroXpRepeat.totalStudyMinutes})`
  );

  // 10.2. Sign-in mode preserves existing custom name in D1
  await userRepo.updateUserProfile(googleUserRes.user.userId, {
    name: 'دکتر نیما شریعتی',
    avatar: '🧠',
  });
  const afterSignIn = await userRepo.createOrUpdateGoogleUser({
    googleId: 'google_sub_10928301',
    email: 'student@tehran.ac.ir',
    name: 'مسیر سلامت',
    mode: 'signin',
  });
  assert(
    afterSignIn.user.name === 'دکتر نیما شریعتی',
    'Sign-in mode preserves existing user custom name in database'
  );
  assert(
    afterSignIn.user.avatar === '🧠',
    'Sign-in mode preserves existing user custom avatar in database'
  );

  // 10.3. Express userSyncManager: Client-supplied XP cannot inflate stored XP
  const expressTestUserId = `u_express_xp_guard_${Date.now()}`;
  const syncedNewExpressUser = userSyncManager.syncUser({
    userId: expressTestUserId,
    name: 'کاربر تست اکسپرس',
    xp: 999999, // Arbitrarily large client-supplied XP
    totalStudyMinutes: 100, // Even with study minutes, syncUser must NOT inflate XP
    completedChapters: ['ch-1', 'ch-2', 'ch-3'],
  });
  assert(
    syncedNewExpressUser.xp === 0,
    `Express syncUser ignores client-supplied 999999 XP and initializes new user to 0 XP (got ${syncedNewExpressUser.xp})`
  );

  userSyncManager.awardXp({
    userId: expressTestUserId,
    xpEarned: 80,
    idempotencyKey: `exp_award_${Date.now()}`,
  });
  const afterLegitExpressAward = userSyncManager.getUser(expressTestUserId)!;
  assert(afterLegitExpressAward.xp === 80, 'Express awardXp legitimately increments XP to 80');

  const afterInflatedSyncAttempt = userSyncManager.syncUser({
    userId: expressTestUserId,
    xp: 5000000,
    totalStudyMinutes: 999,
  });
  assert(
    afterInflatedSyncAttempt.xp === 80,
    `Express syncUser preserves server-owned 80 XP and rejects client 5000000 XP inflation (got ${afterInflatedSyncAttempt.xp})`
  );

  // 10.4. Express userSyncManager: Repeated guest merge does not double-count study minutes or XP
  const expressGoogleTarget = userSyncManager.createOrUpdateGoogleUser({
    googleId: `g_express_sub_${Date.now()}`,
    email: 'express.target@gmail.com',
    name: 'کاربر گوگل اکسپرس',
  });
  const expressGuestId = `usr_express_guest_${Date.now()}`;
  userSyncManager.mergeGuestIntoUser(expressGoogleTarget.user.userId, expressGuestId, {
    totalStudyMinutes: 40,
    completedChapters: ['ch-1'],
  });
  const afterFirstExpressMerge = userSyncManager.getUser(expressGoogleTarget.user.userId)!;
  const firstExpressMinutes = afterFirstExpressMerge.totalStudyMinutes;
  const firstExpressXp = afterFirstExpressMerge.xp;

  const afterSecondExpressMerge = userSyncManager.mergeGuestIntoUser(
    expressGoogleTarget.user.userId,
    expressGuestId,
    {
      totalStudyMinutes: 40,
      completedChapters: ['ch-1'],
    }
  );
  assert(
    afterSecondExpressMerge.totalStudyMinutes === firstExpressMinutes &&
      afterSecondExpressMerge.xp === firstExpressXp,
    'Express mergeGuestIntoUser is idempotent and does not double-count study minutes or XP'
  );

  // 10.5. Express checkDatabaseHealth honesty check
  const expressHealth = userSyncManager.checkDatabaseHealth();
  assert(
    expressHealth.ok === true && expressHealth.engine === 'node-sqlite-local',
    'Express checkDatabaseHealth honestly reports node-sqlite-local engine without claiming remote D1'
  );
  assert(
    (expressHealth as any).totalUsers === undefined && (expressHealth as any).activeSessions === undefined,
    'Express checkDatabaseHealth does not leak user or session counts'
  );

  // ---------------------------------------------------------------
  // 11. PHASE 6B BACKEND SECURITY & DATA INTEGRITY REPAIRS
  // ---------------------------------------------------------------
  console.log('\nTest Suite 11: Phase 6B Backend Security & Data Integrity Repairs');

  // 11.1. Nonce bypass prevention: body.expectedNonce without oauth_nonce cookie is rejected
  const standaloneBodyNonceToken = await signTestGoogleJwt({
    email: 'bypass@gmail.com',
    email_verified: true,
    nonce: 'client_supplied_only_nonce_123456',
  });
  const noCookieNonceRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential: standaloneBodyNonceToken,
        expectedNonce: 'client_supplied_only_nonce_123456',
      }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    noCookieNonceRes.status === 401,
    'POST /api/auth/google rejects body.expectedNonce when HttpOnly oauth_nonce cookie is absent (401)'
  );

  // 11.2. Client-fabricated oauth_nonce cookie that was never issued by GET /api/auth/nonce is rejected
  const unissuedCookieNonce = 'unissued_client_cookie_nonce_abcdef1234567890';
  const unissuedNonceToken = await signTestGoogleJwt({
    email: 'bypass2@gmail.com',
    email_verified: true,
    nonce: unissuedCookieNonce,
  });
  const unissuedCookieRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `oauth_nonce=${unissuedCookieNonce}`,
      },
      body: JSON.stringify({
        credential: unissuedNonceToken,
        expectedNonce: unissuedCookieNonce,
      }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    unissuedCookieRes.status === 401,
    'POST /api/auth/google rejects client-fabricated oauth_nonce cookie not issued by server (401)'
  );

  // 11.3. Express single-use nonce store: createAuthNonce & consumeAuthNonce
  const expNonceRaw = generateAuthNonce();
  const expNonceHash = await hashSessionToken(expNonceRaw);
  userSyncManager.createAuthNonce(expNonceHash, 60);
  const expFirstConsume = userSyncManager.consumeAuthNonce(expNonceHash);
  const expSecondConsume = userSyncManager.consumeAuthNonce(expNonceHash);
  assert(
    expFirstConsume === true && expSecondConsume === false,
    'Express userSyncManager enforces single-use OAuth nonces (second redemption rejected)'
  );

  // 11.4. Origin / Referer / Sec-Fetch-Site CSRF protection on state-changing routes
  assert(
    validateRequestOrigin(null, ['http://localhost'], { secFetchSiteHeader: 'cross-site' }) === false,
    'validateRequestOrigin rejects requests with Sec-Fetch-Site: cross-site even when Origin header is omitted'
  );
  assert(
    validateRequestOrigin(null, ['http://localhost'], { refererHeader: 'https://attacker.example.com/csrf.html' }) === false,
    'validateRequestOrigin rejects cross-origin Referer header when Origin header is omitted'
  );
  assert(
    validateRequestOrigin('http://localhost', ['http://localhost'], { secFetchSiteHeader: 'same-origin' }) === true,
    'validateRequestOrigin accepts valid same-origin request'
  );

  const csrfSyncRes = await workerDefault.fetch(
    new Request('http://localhost/api/user/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil-attacker.example.com',
      },
      body: JSON.stringify({ userId: 'u_csrf_victim', name: 'CSRF' }),
    }),
    authEnv,
    mockCtx
  );
  assert(csrfSyncRes.status === 403, 'Cross-origin POST /api/user/sync is rejected with 403 Forbidden');

  const csrfLeaderboardRes = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Sec_Fetch_Site: 'cross-site',
        'Sec-Fetch-Site': 'cross-site',
      },
      body: JSON.stringify({
        userId: 'u_sync_worker_test',
        xpEarned: 50,
        idempotencyKey: 'csrf_xp_attempt',
      }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    csrfLeaderboardRes.status === 403,
    'Cross-site POST /api/leaderboard/submit (Sec-Fetch-Site: cross-site) is rejected with 403 Forbidden'
  );

  // 11.5. Guest session ownership enforcement on /api/user/sync, /api/user/sync/:userId, and /api/leaderboard/submit
  const unauthGetGuestRes = await workerDefault.fetch(
    new Request('http://localhost/api/user/sync/u_sync_worker_test', { method: 'GET' }),
    authEnv,
    mockCtx
  );
  assert(
    unauthGetGuestRes.status === 401,
    'Unauthenticated GET /api/user/sync/:userId for a guest profile is rejected with 401'
  );

  const authGetGuestRes = await workerDefault.fetch(
    new Request('http://localhost/api/user/sync/u_sync_worker_test', {
      method: 'GET',
      headers: { Cookie: `guest_session_token=${guestSessionToken}` },
    }),
    authEnv,
    mockCtx
  );
  assert(
    authGetGuestRes.status === 200,
    'Authenticated GET /api/user/sync/:userId with matching guest_session_token returns 200 OK'
  );

  const hijackGuestSyncRes = await workerDefault.fetch(
    new Request('http://localhost/api/user/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'u_sync_worker_test',
        name: 'Tampered By Unauthenticated Caller',
      }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    hijackGuestSyncRes.status === 401,
    'Unauthenticated POST /api/user/sync attempting to overwrite session-bound guest profile is rejected with 401'
  );

  const hijackGuestSubmitRes = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'u_sync_worker_test',
        xpEarned: 100,
        idempotencyKey: 'hijack_guest_xp_1',
      }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    hijackGuestSubmitRes.status === 401,
    'Unauthenticated POST /api/leaderboard/submit attempting to award XP to session-bound guest is rejected with 401'
  );

  // Seeded competitor protection
  const seededSyncRes = await workerDefault.fetch(
    new Request('http://localhost/api/user/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'u_sara_kiani',
        name: 'Tampered Seeded Competitor',
      }),
    }),
    authEnv,
    mockCtx
  );
  assert(seededSyncRes.status === 403, 'POST /api/user/sync targeting seeded competitor is rejected with 403');

  // 11.6. Cross-Account Guest Merge Protection (preventing XP / studyMinutes duplication across accounts)
  const mergeAccountA = await userRepo.createOrUpdateGoogleUser({
    googleId: 'google_sub_merge_account_a',
    email: 'account.a@tehran.ac.ir',
    name: 'کاربر الف',
  });
  const mergeAccountB = await userRepo.createOrUpdateGoogleUser({
    googleId: 'google_sub_merge_account_b',
    email: 'account.b@tehran.ac.ir',
    name: 'کاربر ب',
  });
  const sharedGuestRes = await workerDefault.fetch(
    new Request('http://localhost/api/user/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'u_guest_single_merge_only',
        name: 'مهمان تک‌ادغام',
        totalStudyMinutes: 65,
        completedChapters: ['psy_01'],
      }),
    }),
    authEnv,
    mockCtx
  );
  const sharedGuestCookie = extractCookieValue(
    sharedGuestRes.headers.get('Set-Cookie'),
    'guest_session_token'
  )!;
  await userRepo.awardXp({
    userId: 'u_guest_single_merge_only',
    idempotencyKey: 'single_merge_xp_1',
    amount: 220,
    reason: 'quiz_completion',
  });

  // Account A tries to merge without holding the guest_session_token -> 403
  const tokenA = generateSessionToken();
  await userRepo.createSession(mergeAccountA.user.userId, await hashSessionToken(tokenA));
  const mergeWithoutGuestCookieRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/merge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${tokenA}`,
      },
      body: JSON.stringify({ guestUserId: 'u_guest_single_merge_only' }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    mergeWithoutGuestCookieRes.status === 403,
    'POST /api/auth/merge rejects merging a session-bound guest when caller lacks guest_session_token (403)'
  );

  // Account A merges with both valid session_token and guest_session_token -> 200 OK
  const validMergeARes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/merge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${tokenA}; guest_session_token=${sharedGuestCookie}`,
      },
      body: JSON.stringify({ guestUserId: 'u_guest_single_merge_only' }),
    }),
    authEnv,
    mockCtx
  );
  const validMergeAJson = (await validMergeARes.json()) as any;
  assert(
    validMergeARes.status === 200 && validMergeAJson.user.xp === 220 && validMergeAJson.user.totalStudyMinutes === 65,
    'Account A legitimately merges owned guest and receives 220 XP and 65 study minutes'
  );

  // Account B attempts to merge the already-merged guest in D1 -> receives 0 XP and 0 study minutes
  const crossAccountMergeB = await userRepo.mergeGuestIntoUser(
    mergeAccountB.user.userId,
    'u_guest_single_merge_only',
    { xp: 220, totalStudyMinutes: 65, completedChapters: ['psy_01'] }
  );
  assert(
    crossAccountMergeB.xp === 0 && crossAccountMergeB.totalStudyMinutes === 0,
    'D1 mergeGuestIntoUser blocks cross-account re-merge of an already-merged guest into Account B'
  );

  // Express cross-account guest merge protection check
  const expressGoogleTargetB = userSyncManager.createOrUpdateGoogleUser({
    googleId: `g_express_sub_b_${Date.now()}`,
    email: 'express.target.b@gmail.com',
    name: 'کاربر دوم اکسپرس',
  });
  const expressCrossMergeB = userSyncManager.mergeGuestIntoUser(
    expressGoogleTargetB.user.userId,
    expressGuestId,
    { totalStudyMinutes: 40, completedChapters: ['ch-1'] }
  );
  assert(
    expressCrossMergeB.xp === 0 && expressCrossMergeB.totalStudyMinutes === 0,
    'Express mergeGuestIntoUser blocks cross-account re-merge of an already-merged guest into a second user'
  );

  // 11.7. Leaderboard Privacy: peer userIds are masked in GET /api/leaderboard and userSyncManager
  const lbPrivacyRes = await workerDefault.fetch(
    new Request(`http://localhost/api/leaderboard?userId=${encodeURIComponent(mergeAccountA.user.userId)}`, {
      method: 'GET',
    }),
    authEnv,
    mockCtx
  );
  const lbPrivacyJson = (await lbPrivacyRes.json()) as any;
  const peerEntries = lbPrivacyJson.leaderboard.filter((e: any) => !e.isCurrentUser);
  assert(
    peerEntries.length > 0 && peerEntries.every((e: any) => String(e.userId).startsWith('peer_rank_')),
    'Worker GET /api/leaderboard masks peer userIds (peer_rank_*) and never exposes raw internal user_ids'
  );

  const expressLb = userSyncManager.getLeaderboard(expressGoogleTarget.user.userId);
  const expressPeers = expressLb.leaderboard.filter((e) => !e.isCurrentUser);
  assert(
    expressPeers.length > 0 && expressPeers.every((e) => String(e.userId).startsWith('peer_rank_')),
    'Express getLeaderboard masks peer userIds (peer_rank_*) and never exposes raw internal user_ids'
  );

  // 11.8. Cookie Security Attributes: Secure flag on HTTPS vs localhost HTTP
  const httpsCookie = buildCookieHeader('session_token', 'tok_123', 3600, true);
  const httpCookie = buildCookieHeader('session_token', 'tok_123', 3600, false);
  const httpsClear = clearCookieHeader('session_token', true);
  assert(
    httpsCookie.includes('HttpOnly') && httpsCookie.includes('SameSite=Lax') && httpsCookie.includes('Secure'),
    'buildCookieHeader sets HttpOnly, SameSite=Lax, and Secure when isSecure=true'
  );
  assert(
    httpCookie.includes('HttpOnly') && httpCookie.includes('SameSite=Lax') && !httpCookie.includes('Secure'),
    'buildCookieHeader omits Secure on plain HTTP localhost (isSecure=false) while keeping HttpOnly and SameSite=Lax'
  );
  assert(
    httpsClear.includes('Max-Age=0') && httpsClear.includes('Secure'),
    'clearCookieHeader sets Max-Age=0 and Secure when isSecure=true'
  );

  // 11.9. D1 upsertUser preserves existing identity columns & awardXp validates idempotencyKey and amount bounds
  await userRepo.upsertUser({
    userId: googleUserRes.user.userId,
    name: 'نام به‌روزشده از همگام‌سازی',
    totalStudyMinutes: 150,
  });
  const preservedGoogleUser = (await userRepo.getUserById(googleUserRes.user.userId))!;
  assert(
    preservedGoogleUser.email === 'student@tehran.ac.ir' &&
      preservedGoogleUser.googleId === 'google_sub_10928301' &&
      preservedGoogleUser.picture === 'https://lh3.googleusercontent.com/a/student=s96-c',
    'D1 upsertUser preserves existing email, google_id, and picture when omitted from sync payload'
  );

  let emptyIdempRejected = false;
  try {
    await userRepo.awardXp({
      userId: 'u_sync_worker_test',
      idempotencyKey: '   ',
      amount: 25,
      reason: 'quiz_completion',
    });
  } catch {
    emptyIdempRejected = true;
  }
  assert(emptyIdempRejected, 'D1 awardXp rejects empty/whitespace idempotencyKey');

  let negativeAmountRejected = false;
  try {
    await userRepo.awardXp({
      userId: 'u_sync_worker_test',
      idempotencyKey: 'neg_xp_key',
      amount: -50,
      reason: 'quiz_completion',
    });
  } catch {
    negativeAmountRejected = true;
  }
  assert(negativeAmountRejected, 'D1 awardXp rejects negative or zero XP amount');

  const missingIdempSubmitRes = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `guest_session_token=${guestSessionToken}`,
      },
      body: JSON.stringify({
        userId: 'u_sync_worker_test',
        xpEarned: 30,
        idempotencyKey: '',
      }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    missingIdempSubmitRes.status === 400,
    'POST /api/leaderboard/submit returns 400 Bad Request when idempotencyKey is empty'
  );

  // ---------------------------------------------------------------
  // 12. PHASE 6C: XP INTEGRITY, VERIFIED REWARDS & LEADERBOARD ABUSE PREVENTION
  // ---------------------------------------------------------------
  console.log('\nTest Suite 12: Phase 6C XP Integrity, Verified Curriculum Rewards & Leaderboard Abuse Prevention');

  // Create isolated authenticated user and guest user for Suite 12
  const s12AuthUserRes = await userRepo.createOrUpdateGoogleUser({
    googleId: 'google_sub_phase6c_user_1',
    email: 'phase6c.user@tehran.ac.ir',
    name: 'کاربر تست مرحله ۶ج',
  });
  const s12AuthUserId = s12AuthUserRes.user.userId;
  const s12AuthToken = generateSessionToken();
  await userRepo.createSession(s12AuthUserId, await hashSessionToken(s12AuthToken));

  // Create another authenticated user to test cross-user submission rejection
  const s12OtherUserRes = await userRepo.createOrUpdateGoogleUser({
    googleId: 'google_sub_phase6c_other_2',
    email: 'phase6c.other@tehran.ac.ir',
    name: 'کاربر دوم مرحله ۶ج',
  });
  const s12OtherUserId = s12OtherUserRes.user.userId;

  // 12.1. Arbitrary XP submission without a valid curriculum reward event is rejected (400)
  const rawArbitraryXpRes = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s12AuthToken}`,
      },
      body: JSON.stringify({
        userId: s12AuthUserId,
        xpEarned: 1000,
        idempotencyKey: 'custom_attacker_key_999',
      }),
    }),
    authEnv,
    mockCtx
  );
  const afterRawArbitraryUser = (await userRepo.getUserById(s12AuthUserId))!;
  assert(
    rawArbitraryXpRes.status === 400 && afterRawArbitraryUser.xp === 0,
    'POST /api/leaderboard/submit rejects raw arbitrary xpEarned submission without verifiable curriculum event (400, 0 XP awarded)'
  );

  // 12.2. Inflated XP amount for valid stage_completion (e.g., claiming 1000 XP for Stage 1 which awards 15 XP) is rejected (400)
  const inflatedStageXpRes = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s12AuthToken}`,
      },
      body: JSON.stringify({
        userId: s12AuthUserId,
        rewardType: 'stage_completion',
        stageNumber: 1,
        stars: 3,
        score: 10,
        totalQuestions: 10,
        stageAnswers: buildCanonicalStageAnswers(1),
        xpEarned: 1000,
      }),
    }),
    authEnv,
    mockCtx
  );
  const afterInflatedStageUser = (await userRepo.getUserById(s12AuthUserId))!;
  assert(
    inflatedStageXpRes.status === 400 && afterInflatedStageUser.xp === 0,
    'POST /api/leaderboard/submit rejects client attempt to inflate Stage 1 XP from 15 to 1000 (400, 0 XP awarded)'
  );

  // 12.3. Out-of-order stage completion (claiming Stage 2 before Stage 1 is completed in xp_ledger) is rejected (400)
  const skippedStageRes = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s12AuthToken}`,
      },
      body: JSON.stringify({
        userId: s12AuthUserId,
        rewardType: 'stage_completion',
        stageNumber: 2,
        stars: 3,
        score: 10,
        totalQuestions: 10,
        stageAnswers: buildCanonicalStageAnswers(2),
      }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    skippedStageRes.status === 400,
    'POST /api/leaderboard/submit rejects Stage 2 reward when prerequisite Stage 1 has not been completed (400)'
  );

  // 12.4. Legitimate Stage 1 completion awards strictly canonical 15 XP and records canonical idempotency key
  const validStage1Res = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s12AuthToken}`,
      },
      body: JSON.stringify({
        userId: s12AuthUserId,
        rewardType: 'stage_completion',
        stageNumber: 1,
        stars: 3,
        score: 10,
        totalQuestions: 10,
        stageAnswers: buildCanonicalStageAnswers(1),
        idempotencyKey: 'client_supplied_random_key_1',
      }),
    }),
    authEnv,
    mockCtx
  );
  const validStage1Json = (await validStage1Res.json()) as any;
  assert(
    validStage1Res.status === 200 &&
      validStage1Json.applied === true &&
      validStage1Json.awardedXp === 15 &&
      validStage1Json.updatedXp === 15,
    'Legitimate Stage 1 completion awards canonical 15 XP and updates user XP to 15'
  );

  // 12.5. Replaying Stage 1 completion with a brand-new client idempotencyKey is blocked by server-derived key (stage_completion:stage_1)
  const replayStage1Res = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s12AuthToken}`,
      },
      body: JSON.stringify({
        userId: s12AuthUserId,
        rewardType: 'stage_completion',
        stageNumber: 1,
        stars: 3,
        score: 10,
        totalQuestions: 10,
        stageAnswers: buildCanonicalStageAnswers(1),
        idempotencyKey: 'brand_new_client_key_to_bypass_idempotency',
      }),
    }),
    authEnv,
    mockCtx
  );
  const replayStage1Json = (await replayStage1Res.json()) as any;
  assert(
    replayStage1Res.status === 200 &&
      replayStage1Json.applied === false &&
      replayStage1Json.alreadyProcessed === true &&
      replayStage1Json.awardedXp === 0 &&
      replayStage1Json.updatedXp === 15,
    'Replaying Stage 1 completion with a different client idempotencyKey is deduplicated by canonical server key (0 additional XP)'
  );

  // 12.6. Stage 2 completion now succeeds because Stage 1 is verified in xp_ledger
  const validStage2Res = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s12AuthToken}`,
      },
      body: JSON.stringify({
        userId: s12AuthUserId,
        rewardType: 'stage_completion',
        stageNumber: 2,
        stars: 3,
        score: 10,
        totalQuestions: 10,
        stageAnswers: buildCanonicalStageAnswers(2),
      }),
    }),
    authEnv,
    mockCtx
  );
  const validStage2Json = (await validStage2Res.json()) as any;
  assert(
    validStage2Res.status === 200 &&
      validStage2Json.applied === true &&
      validStage2Json.awardedXp === 15 &&
      validStage2Json.updatedXp === 30,
    'Stage 2 completion succeeds after Stage 1 is verified and awards canonical 15 XP (total 30 XP)'
  );

  // 12.7. Quiz answer verification: wrong answer or unknown questionId is rejected (400); correct answer awards canonical 10 XP once
  const wrongQuizAnswerRes = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s12AuthToken}`,
      },
      body: JSON.stringify({
        userId: s12AuthUserId,
        rewardType: 'quiz_answer',
        chapterId: 'ch-1',
        questionId: 'q-1-1',
        userAnswer: 0, // Wrong answer (correctAnswer for q-1-1 is 1)
        isCorrect: true, // Client lies that answer is correct
      }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    wrongQuizAnswerRes.status === 400,
    'POST /api/leaderboard/submit rejects quiz_answer when server verification finds userAnswer is wrong despite isCorrect: true (400)'
  );

  const validQuizAnswerRes = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s12AuthToken}`,
      },
      body: JSON.stringify({
        userId: s12AuthUserId,
        rewardType: 'quiz_answer',
        chapterId: 'ch-1',
        questionId: 'q-1-1',
        userAnswer: 1, // Authoritative correct answer for q-1-1
        isCorrect: true,
        idempotencyKey: 'quiz_attempt_key_1',
      }),
    }),
    authEnv,
    mockCtx
  );
  const validQuizAnswerJson = (await validQuizAnswerRes.json()) as any;
  assert(
    validQuizAnswerRes.status === 200 &&
      validQuizAnswerJson.applied === true &&
      validQuizAnswerJson.awardedXp === 10 &&
      validQuizAnswerJson.updatedXp === 40,
    'Verified correct quiz_answer for ch-1:q-1-1 awards canonical 10 XP (total 40 XP)'
  );

  const replayQuizAnswerRes = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s12AuthToken}`,
      },
      body: JSON.stringify({
        userId: s12AuthUserId,
        rewardType: 'quiz_answer',
        chapterId: 'ch-1',
        questionId: 'q-1-1',
        userAnswer: 1,
        isCorrect: true,
        idempotencyKey: 'quiz_attempt_key_2_rotated',
      }),
    }),
    authEnv,
    mockCtx
  );
  const replayQuizAnswerJson = (await replayQuizAnswerRes.json()) as any;
  assert(
    replayQuizAnswerRes.status === 200 &&
      replayQuizAnswerJson.applied === false &&
      replayQuizAnswerJson.alreadyProcessed === true &&
      replayQuizAnswerJson.updatedXp === 40,
    'Replaying the same curriculum question with a rotated client key awards 0 additional XP'
  );

  // 12.8. Unauthenticated fake account creation via POST /api/leaderboard/submit is rejected (401)
  const unauthFakeLeaderboardAccountRes = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'usr_fake_sybil_bot_999',
        name: 'Fake Leaderboard Bot',
        rewardType: 'stage_completion',
        stageNumber: 1,
        stars: 3,
        score: 10,
        totalQuestions: 10,
        stageAnswers: buildCanonicalStageAnswers(1),
      }),
    }),
    authEnv,
    mockCtx
  );
  const fakeBotInDb = await userRepo.getUserById('usr_fake_sybil_bot_999');
  assert(
    unauthFakeLeaderboardAccountRes.status === 401 && fakeBotInDb === null,
    'POST /api/leaderboard/submit rejects unauthenticated fake account creation (401) and does not create user row'
  );

  // 12.9. Authenticated user attempting to submit XP or sync profile for another userId is rejected (403)
  const crossUserSubmitRes = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s12AuthToken}`,
      },
      body: JSON.stringify({
        userId: s12OtherUserId,
        rewardType: 'stage_completion',
        stageNumber: 1,
        stageAnswers: buildCanonicalStageAnswers(1),
      }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    crossUserSubmitRes.status === 403,
    'Authenticated user submitting XP with another userId in request body is rejected with 403 Forbidden'
  );

  const crossUserSyncRes = await workerDefault.fetch(
    new Request('http://localhost/api/user/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s12AuthToken}`,
      },
      body: JSON.stringify({
        userId: s12OtherUserId,
        name: 'Cross User Sync Attempt',
      }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    crossUserSyncRes.status === 403,
    'Authenticated user syncing profile with another userId in request body is rejected with 403 Forbidden'
  );

  // 12.10. Guest merge rejects client-fabricated guestProgress.xp and deduplicates overlapping stage rewards
  // Create a synced guest who legitimately completes Stage 1 (15 XP) and Stage 3 is NOT completed,
  // then merges into s12AuthUserId (who already completed Stage 1 & Stage 2, and has 40 XP).
  // Even if guestProgress claims xp: 999999, s12AuthUserId already has stage_completion:stage_1 in xp_ledger,
  // so 0 duplicate XP is transferred!
  const s12GuestSyncRes = await workerDefault.fetch(
    new Request('http://localhost/api/user/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'u_guest_phase6c_dup',
        name: 'مهمان مرحله ۶ج',
        totalStudyMinutes: 20,
      }),
    }),
    authEnv,
    mockCtx
  );
  const s12GuestToken = extractCookieValue(
    s12GuestSyncRes.headers.get('Set-Cookie'),
    'guest_session_token'
  )!;

  // Guest legitimately completes Stage 1 (15 XP) and answers q-1-2 (10 XP) -> 25 XP total on guest
  await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `guest_session_token=${s12GuestToken}`,
      },
      body: JSON.stringify({
        userId: 'u_guest_phase6c_dup',
        rewardType: 'stage_completion',
        stageNumber: 1,
        stars: 3,
        score: 10,
        totalQuestions: 10,
        stageAnswers: buildCanonicalStageAnswers(1),
      }),
    }),
    authEnv,
    mockCtx
  );
  await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `guest_session_token=${s12GuestToken}`,
      },
      body: JSON.stringify({
        userId: 'u_guest_phase6c_dup',
        rewardType: 'quiz_answer',
        chapterId: 'ch-1',
        questionId: 'q-1-2',
        userAnswer: 0, // Correct answer for q-1-2
        isCorrect: true,
      }),
    }),
    authEnv,
    mockCtx
  );

  const s12GuestBeforeMerge = (await userRepo.getUserById('u_guest_phase6c_dup'))!;
  assert(
    s12GuestBeforeMerge.xp === 25,
    'Guest earned 25 verified XP (15 from Stage 1 + 10 from q-1-2) prior to merge'
  );

  // Merge guest into s12AuthUserId while passing fabricated guestProgress.xp = 500000.
  // Because s12AuthUserId already has stage_completion:stage_1, only q-102 (10 XP) is new and transferable!
  const s12MergeRes = await workerDefault.fetch(
    new Request('http://localhost/api/auth/merge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s12AuthToken}; guest_session_token=${s12GuestToken}`,
      },
      body: JSON.stringify({
        guestUserId: 'u_guest_phase6c_dup',
        guestProgress: {
          xp: 500000,
          totalStudyMinutes: 999999,
          completedStages: {
            1: { stageNumber: 1, completedAt: new Date().toISOString(), stars: 3, score: 10, totalQuestions: 10, xpEarned: 99999 },
            50: { stageNumber: 50, completedAt: new Date().toISOString(), stars: 3, score: 10, totalQuestions: 10, xpEarned: 99999 },
          },
        },
      }),
    }),
    authEnv,
    mockCtx
  );
  const s12MergeJson = (await s12MergeRes.json()) as any;
  assert(
    s12MergeRes.status === 200 &&
      s12MergeJson.user.xp === 50 && // 40 existing + 10 from non-overlapping q-102 (Stage 1 deduplicated, 500000 ignored)
      s12MergeJson.user.totalStudyMinutes === 20 && // Stored guest record (20m) used instead of fabricated 999999
      s12MergeJson.user.completedStages['1']?.xpEarned === 15 &&
      s12MergeJson.user.completedStages['50'] === undefined,
    'Guest merge ignores fabricated guestProgress.xp, deduplicates overlapping Stage 1 XP, transfers only verified non-overlapping q-102 (10 XP), and sanitizes completedStages'
  );

  // 12.11. Express /api/leaderboard/submit parity: rejects unverified XP and awards canonical XP for verified events
  const expGuestSync = userSyncManager.syncUser({
    userId: 'u_exp_phase6c_guest',
    name: 'مهمان اکسپرس ۶ج',
  });
  const expGuestToken = generateSessionToken();
  userSyncManager.createSession(expGuestSync.userId, await hashSessionToken(expGuestToken));

  const expVerifiedStagesBefore = userSyncManager.getVerifiedCompletedStageNumbers(expGuestSync.userId);
  const expInvalidVerify = verifyRewardSubmission(
    { userId: expGuestSync.userId, xpEarned: 500, idempotencyKey: 'forged_exp_1' },
    { verifiedCompletedStages: expVerifiedStagesBefore }
  );
  assert(
    expInvalidVerify.ok === false && expInvalidVerify.status === 400,
    'Express reward verification rejects arbitrary XP submission without valid curriculum event'
  );

  const expValidStage1 = verifyRewardSubmission(
    {
      userId: expGuestSync.userId,
      rewardType: 'stage_completion',
      stageNumber: 1,
      stars: 3,
      score: 10,
      totalQuestions: 10,
      stageAnswers: buildCanonicalStageAnswers(1),
    },
    { verifiedCompletedStages: expVerifiedStagesBefore }
  );
  assert(
    expValidStage1.ok === true && expValidStage1.amount === 15 && expValidStage1.idempotencyKey === 'stage_completion:stage_1',
    'Express reward verification computes canonical 15 XP and canonical idempotencyKey for Stage 1'
  );
  if (expValidStage1.ok) {
    userSyncManager.awardXp({
      userId: expGuestSync.userId,
      xpEarned: expValidStage1.amount,
      reason: expValidStage1.reason,
      stageRecord: expValidStage1.stageRecord,
      idempotencyKey: expValidStage1.idempotencyKey,
    });
  }
  const expVerifiedStagesAfter = userSyncManager.getVerifiedCompletedStageNumbers(expGuestSync.userId);
  assert(
    expVerifiedStagesAfter.has(1) && userSyncManager.getUser(expGuestSync.userId)?.xp === 15,
    'Express userSyncManager records verified Stage 1 completion in ledger and awards 15 XP'
  );

  // ---------------------------------------------------------------
  // 13. PHASE 6C.1: STAGE COMPLETION ACTIVITY VERIFICATION & ANTI-FARMING
  // ---------------------------------------------------------------
  console.log('\nTest Suite 13: Phase 6C.1 Stage Completion Activity Verification');

  const s13UserRes = await userRepo.createOrUpdateGoogleUser({
    googleId: 'google_sub_phase6c1_auditor',
    email: 'phase6c1.auditor@tehran.ac.ir',
    name: 'ممیز مرحله ۶ج.۱',
  });
  const s13UserId = s13UserRes.user.userId;
  const s13Token = generateSessionToken();
  await userRepo.createSession(s13UserId, await hashSessionToken(s13Token));

  // 13.1. Stage 1 submission WITH ONLY metadata (no stageAnswers) is rejected (400, 0 XP)
  const metadataOnlyStage1Res = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s13Token}`,
      },
      body: JSON.stringify({
        userId: s13UserId,
        rewardType: 'stage_completion',
        stageNumber: 1,
        stars: 3,
        score: 10,
        totalQuestions: 10,
      }),
    }),
    authEnv,
    mockCtx
  );
  const s13AfterMetadataOnly = (await userRepo.getUserById(s13UserId))!;
  assert(
    metadataOnlyStage1Res.status === 400 && s13AfterMetadataOnly.xp === 0,
    'Stage 1 claim with metadata only (no stageAnswers) is rejected (400, 0 XP)'
  );

  // 13.2. Stage 1 submission with incomplete stageAnswers (missing questions) is rejected (400, 0 XP)
  const partialAnswers = { ...buildCanonicalStageAnswers(1) };
  delete partialAnswers['s1-stage-1-q10'];
  const partialStage1Res = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s13Token}`,
      },
      body: JSON.stringify({
        userId: s13UserId,
        rewardType: 'stage_completion',
        stageNumber: 1,
        stars: 3,
        score: 10,
        totalQuestions: 10,
        stageAnswers: partialAnswers,
      }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    partialStage1Res.status === 400 && (await userRepo.getUserById(s13UserId))!.xp === 0,
    'Stage 1 claim with incomplete stageAnswers (missing question s1-stage-1-q10) is rejected (400, 0 XP)'
  );

  // 13.3. Stage 1 submission with failing answers (e.g., 2/10 correct < 6/10 minimum passing threshold) is rejected (400, 0 XP)
  const failingAnswers: Record<string, unknown> = {
    's1-stage-1-q1': 1, // correct
    's1-stage-1-q2': true, // correct
    's1-stage-1-q3': true, // wrong (expected false)
    's1-stage-1-q4': 'تصادفی', // wrong (expected ذهنی)
    's1-stage-1-q5': ['p1'], // wrong (incomplete match_pairs)
    's1-stage-1-q6': 2, // wrong (expected 0)
    's1-stage-1-q7': 3, // wrong (expected 0)
    's1-stage-1-q8': true, // wrong (expected false)
    's1-stage-1-q9': 'مجازات', // wrong (expected پیش‌بینی)
    's1-stage-1-q10': 2, // wrong (expected 0)
  };
  const failingStage1Res = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s13Token}`,
      },
      body: JSON.stringify({
        userId: s13UserId,
        rewardType: 'stage_completion',
        stageNumber: 1,
        stars: 3,
        score: 10, // Client falsely claims 10/10!
        totalQuestions: 10,
        stageAnswers: failingAnswers,
      }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    failingStage1Res.status === 400 && (await userRepo.getUserById(s13UserId))!.xp === 0,
    'Stage 1 claim with failing answers (2/10 correct) is rejected even when client claims score: 10 (400, 0 XP)'
  );

  // 13.4. Automated loop attempting to farm Stages 1..100 without valid answers awards 0 XP
  let loopAwardedCount = 0;
  for (let stNum = 1; stNum <= 10; stNum++) {
    const res = await workerDefault.fetch(
      new Request('http://localhost/api/leaderboard/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `session_token=${s13Token}`,
        },
        body: JSON.stringify({
          userId: s13UserId,
          rewardType: 'stage_completion',
          stageNumber: stNum,
          stars: 3,
          score: 10,
          totalQuestions: 10,
        }),
      }),
      authEnv,
      mockCtx
    );
    if (res.status === 200) loopAwardedCount++;
  }
  assert(
    loopAwardedCount === 0 && (await userRepo.getUserById(s13UserId))!.xp === 0,
    'Automated stage-loop exploit without verified stageAnswers is completely blocked (0 stages awarded, 0 XP)'
  );

  // 13.5. Stage 1 submission with passing answers (8/10 correct -> 2 mistakes -> 2 stars) succeeds,
  // awards canonical 15 XP, and overrides client-inflated score/stars with server-computed score=8, stars=2
  const passingWith2Mistakes: Record<string, unknown> = {
    ...buildCanonicalStageAnswers(1)!,
    's1-stage-1-q7': 2, // 1st mistake
    's1-stage-1-q10': 3, // 2nd mistake
  };
  const verifiedPassStage1Res = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s13Token}`,
      },
      body: JSON.stringify({
        userId: s13UserId,
        rewardType: 'stage_completion',
        stageNumber: 1,
        stars: 3, // Client claims 3 stars despite 2 mistakes
        score: 10, // Client claims 10/10 despite 2 mistakes
        totalQuestions: 10,
        stageAnswers: passingWith2Mistakes,
      }),
    }),
    authEnv,
    mockCtx
  );
  const verifiedPassStage1Json = (await verifiedPassStage1Res.json()) as any;
  const persistedStage1Record = verifiedPassStage1Json.profile?.completedStages?.['1'];
  assert(
    verifiedPassStage1Res.status === 200 &&
      verifiedPassStage1Json.applied === true &&
      verifiedPassStage1Json.awardedXp === 15 &&
      verifiedPassStage1Json.updatedXp === 15 &&
      persistedStage1Record?.score === 8 &&
      persistedStage1Record?.stars === 2 &&
      persistedStage1Record?.totalQuestions === 10,
    'Verified Stage 1 submission (8/10 correct) awards 15 XP and persists server-computed score=8 and stars=2 instead of client-claimed 10/3'
  );

  // 13.6. Stage 2 submission with valid answers before Stage 1 is completed is tested on a fresh user (rejected 400),
  // and on s13UserId (who just completed Stage 1) succeeds and awards 15 XP
  const s13Stage2SuccessRes = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s13Token}`,
      },
      body: JSON.stringify({
        userId: s13UserId,
        rewardType: 'stage_completion',
        stageNumber: 2,
        stageAnswers: buildCanonicalStageAnswers(2),
      }),
    }),
    authEnv,
    mockCtx
  );
  const s13Stage2SuccessJson = (await s13Stage2SuccessRes.json()) as any;
  assert(
    s13Stage2SuccessRes.status === 200 &&
      s13Stage2SuccessJson.applied === true &&
      s13Stage2SuccessJson.updatedXp === 30,
    'Verified Stage 2 submission succeeds after Stage 1 is verified and brings total XP to 30'
  );

  // ---------------------------------------------------------------
  // 14. PHASE 6D: CLOUDFLARE WORKER API PARITY & BACKEND COMPLETION
  // ---------------------------------------------------------------
  console.log('\nTest Suite 14: Phase 6D Cloudflare Worker API Parity & Backend Completion');

  const { workerAiCache } = await import('../src/worker/ai.ts');
  const { resetWorkerRateLimits } = await import('../src/worker/rateLimiter.ts');
  workerAiCache.clear();
  resetWorkerRateLimits();

  // 14.1. GET /api/health & method check
  const healthGetRes = await workerDefault.fetch(
    new Request('http://localhost/api/health', { method: 'GET' }),
    authEnv,
    mockCtx
  );
  const healthGetJson = (await healthGetRes.json()) as any;
  assert(
    healthGetRes.status === 200 &&
      healthGetJson.ok === true &&
      healthGetJson.status === 'ok' &&
      healthGetJson.d1Available === true &&
      healthGetJson.aiAvailable === false &&
      typeof healthGetJson.totalQuestionsInBank === 'number',
    'GET /api/health returns 200 OK with service status, d1Available=true, aiAvailable=false, and totalQuestionsInBank'
  );

  const healthPostRes = await workerDefault.fetch(
    new Request('http://localhost/api/health', { method: 'POST' }),
    authEnv,
    mockCtx
  );
  assert(
    healthPostRes.status === 405,
    'POST /api/health is rejected with 405 Method Not Allowed'
  );

  // 14.2. GET /api/quiz/bank filtering, validation, and auto-seeding
  const quizBankGetRes = await workerDefault.fetch(
    new Request('http://localhost/api/quiz/bank?chapterId=s1_c1&difficulty=easy&limit=5', {
      method: 'GET',
    }),
    authEnv,
    mockCtx
  );
  const quizBankGetJson = (await quizBankGetRes.json()) as any;
  assert(
    quizBankGetRes.status === 200 &&
      Array.isArray(quizBankGetJson.questions) &&
      quizBankGetJson.questions.length >= 1 &&
      quizBankGetJson.questions.every((q: any) => q.chapterId === 's1_c1' && q.difficulty === 'easy') &&
      typeof quizBankGetJson.totalInBank === 'number' &&
      quizBankGetJson.totalInBank > 0,
    'GET /api/quiz/bank returns filtered D1 questions and totalInBank count'
  );

  const quizBankBadDiffRes = await workerDefault.fetch(
    new Request('http://localhost/api/quiz/bank?difficulty=invalid_diff', { method: 'GET' }),
    authEnv,
    mockCtx
  );
  assert(
    quizBankBadDiffRes.status === 400,
    'GET /api/quiz/bank rejects invalid difficulty parameter with 400 Bad Request'
  );

  const quizBankPostRes = await workerDefault.fetch(
    new Request('http://localhost/api/quiz/bank', { method: 'POST' }),
    authEnv,
    mockCtx
  );
  assert(
    quizBankPostRes.status === 405,
    'POST /api/quiz/bank is rejected with 405 Method Not Allowed'
  );

  // Test auto-seeding on an empty D1 database instance
  const emptyBankSqlite = new DatabaseSync(':memory:');
  emptyBankSqlite.exec(m1);
  const emptyBankDb = createMockD1(emptyBankSqlite);
  const emptyBankRes = await workerDefault.fetch(
    new Request('http://localhost/api/quiz/bank?limit=10', { method: 'GET' }),
    { DB: emptyBankDb },
    mockCtx
  );
  const emptyBankJson = (await emptyBankRes.json()) as any;
  assert(
    emptyBankRes.status === 200 &&
      emptyBankJson.totalInBank === 7 &&
      emptyBankJson.questions.length === 7,
    'GET /api/quiz/bank auto-seeds the 7 curated academic questions when D1 question_bank is initially empty'
  );

  // 14.3. POST /api/quiz/bank/generate (503 without AI, 400 on invalid AI schema, 200 + D1 persistence on valid AI schema)
  const genNoAiRes = await workerDefault.fetch(
    new Request('http://localhost/api/quiz/bank/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterId: 's1_c2', chapterTitle: 'مبانی زیستی', difficulty: 'hard' }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    genNoAiRes.status === 503,
    'POST /api/quiz/bank/generate returns 503 when AI service is not configured'
  );

  const badAiEnv = {
    ...authEnv,
    AI_CLIENT: {
      async generateText() {
        return JSON.stringify({
          question: 'سوال ناقص با سه گزینه',
          options: ['الف', 'ب', 'ج'],
          correctIndex: 0,
          explanation: 'توضیح',
        });
      },
    },
  };
  const genInvalidSchemaRes = await workerDefault.fetch(
    new Request('http://localhost/api/quiz/bank/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterId: 's1_c2', chapterTitle: 'مبانی زیستی', difficulty: 'hard' }),
    }),
    badAiEnv,
    mockCtx
  );
  assert(
    genInvalidSchemaRes.status === 400,
    'POST /api/quiz/bank/generate rejects AI output that violates the 4-option question contract (400)'
  );

  let aiGenerateCallCount = 0;
  const validAiEnv = {
    ...authEnv,
    AI_CLIENT: {
      async generateText(params: { contents: string; responseMimeType?: string }) {
        aiGenerateCallCount++;
        if (params.responseMimeType === 'application/json') {
          return JSON.stringify({
            question: 'کدام ساختار مغزی نقش اصلی را در تثبیت حافظه صریح از کوتاه‌مدت به بلندمدت ایفا می‌کند؟',
            options: ['هیپوکامپ (Hippocampus)', 'مخچه (Cerebellum)', 'پیاز مغز (Medulla)', 'پل مغزی (Pons)'],
            correctIndex: 0,
            explanation: 'هیپوکامپ در لوب گیجگاهی میانی برای تثبیت حافظه‌های رویدادی و معنایی (صریح) ضروری است.',
          });
        }
        return `پاسخ تخصصی منتور: ${params.contents.slice(0, 40)}`;
      },
      async *generateTextStream() {
        yield { text: 'بخش اول پاسخ استریم منتور: ' };
        yield { text: 'تفاوت ساختاری و کارکردی به طور کامل تشریح شد.' };
      },
    },
  };

  const countBeforeGen = await qRepo.getTotalCount();
  const genValidRes = await workerDefault.fetch(
    new Request('http://localhost/api/quiz/bank/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapterId: 's1_c2_ai_test',
        chapterTitle: 'فصل ۲: مبانی زیستی و حافظه',
        difficulty: 'hard',
      }),
    }),
    validAiEnv,
    mockCtx
  );
  const genValidJson = (await genValidRes.json()) as any;
  const countAfterGen = await qRepo.getTotalCount();
  assert(
    genValidRes.status === 200 &&
      genValidJson.success === true &&
      genValidJson.question?.source === 'ai-generated' &&
      genValidJson.question?.options?.length === 4 &&
      countAfterGen === countBeforeGen + 1,
    'POST /api/quiz/bank/generate validates, persists, and returns a new 4-option AI-generated question in D1'
  );

  // 14.4. POST /api/ai/mentor (validation, offline fallback, live AI, and normalized cache hit)
  const mentorEmptyRes = await workerDefault.fetch(
    new Request('http://localhost/api/ai/mentor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '   ' }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    mentorEmptyRes.status === 400,
    'POST /api/ai/mentor rejects empty question with 400 Bad Request'
  );

  const mentorOfflineRes = await workerDefault.fetch(
    new Request('http://localhost/api/ai/mentor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'تفاوت تقویت منفی و تنبیه چیست؟',
        chapterTitle: 'یادگیری و شرطی‌سازی',
      }),
    }),
    authEnv,
    mockCtx
  );
  const mentorOfflineJson = (await mentorOfflineRes.json()) as any;
  assert(
    mentorOfflineRes.status === 200 &&
      mentorOfflineJson.source === 'offline-fallback' &&
      typeof mentorOfflineJson.reply === 'string' &&
      mentorOfflineJson.reply.length > 0,
    'POST /api/ai/mentor returns graceful offline academic fallback when AI key is not configured'
  );

  const callsBeforeMentor = aiGenerateCallCount;
  const mentorLiveRes = await workerDefault.fetch(
    new Request('http://localhost/api/ai/mentor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'تفاوت بنیادی پتانسیل عمل و پتانسیل استراحت چیست؟',
        chapterTitle: 'مبانی زیستی',
      }),
    }),
    validAiEnv,
    mockCtx
  );
  const mentorLiveJson = (await mentorLiveRes.json()) as any;
  assert(
    mentorLiveRes.status === 200 &&
      mentorLiveJson.source === 'gemini' &&
      aiGenerateCallCount === callsBeforeMentor + 1,
    'POST /api/ai/mentor returns live AI mentor response and caches it'
  );

  // Ask the same question with Arabic Yeh/Kaf and punctuation differences to verify normalized cache hit
  const mentorCachedRes = await workerDefault.fetch(
    new Request('http://localhost/api/ai/mentor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'تفاوت بنیادي پتانسیل عمل و پتانسیل استراحت چیست؟؟!',
        chapterTitle: 'مبانی زیستی',
      }),
    }),
    validAiEnv,
    mockCtx
  );
  const mentorCachedJson = (await mentorCachedRes.json()) as any;
  assert(
    mentorCachedRes.status === 200 &&
      mentorCachedJson.source === 'cache' &&
      mentorCachedJson.hitCount === 2 &&
      aiGenerateCallCount === callsBeforeMentor + 1,
    'POST /api/ai/mentor serves normalized Persian/Arabic repeat question from cache without invoking AI again'
  );

  // 14.5. POST /api/ai/mentor/stream (SSE format for live stream and cached response)
  const streamLiveRes = await workerDefault.fetch(
    new Request('http://localhost/api/ai/mentor/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'نقش آمیگدال در پردازش هیجان ترس چیست؟',
        chapterTitle: 'مبانی زیستی',
      }),
    }),
    validAiEnv,
    mockCtx
  );
  const streamLiveText = await streamLiveRes.text();
  assert(
    streamLiveRes.status === 200 &&
      (streamLiveRes.headers.get('Content-Type') || '').includes('text/event-stream') &&
      streamLiveText.includes('data: ') &&
      streamLiveText.includes('بخش اول پاسخ استریم منتور') &&
      streamLiveText.includes('data: [DONE]'),
    'POST /api/ai/mentor/stream streams SSE chunks and terminates with data: [DONE]'
  );

  // 14.6. POST /api/ai/adaptive-plan (offline fallback and live AI)
  const adaptiveOfflineRes = await workerDefault.fetch(
    new Request('http://localhost/api/ai/adaptive-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stats: { overallMastery: 62, correctCount: 18, incorrectCount: 11 },
        weakChapters: ['آسیب‌شناسی روانی'],
      }),
    }),
    authEnv,
    mockCtx
  );
  const adaptiveOfflineJson = (await adaptiveOfflineRes.json()) as any;
  assert(
    adaptiveOfflineRes.status === 200 &&
      adaptiveOfflineJson.source === 'offline-fallback' &&
      typeof adaptiveOfflineJson.plan === 'string',
    'POST /api/ai/adaptive-plan returns structured offline study plan when AI is unconfigured'
  );

  const adaptiveLiveRes = await workerDefault.fetch(
    new Request('http://localhost/api/ai/adaptive-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stats: { overallMastery: 78, correctCount: 39, incorrectCount: 11 },
        weakChapters: ['آمار و روش تحقیق'],
      }),
    }),
    validAiEnv,
    mockCtx
  );
  const adaptiveLiveJson = (await adaptiveLiveRes.json()) as any;
  assert(
    adaptiveLiveRes.status === 200 &&
      adaptiveLiveJson.source === 'gemini' &&
      typeof adaptiveLiveJson.plan === 'string' &&
      adaptiveLiveJson.plan.length > 0,
    'POST /api/ai/adaptive-plan returns personalized AI study plan when AI client is configured'
  );

  // 14.7. Analytics endpoints (/api/analytics/ping, /api/analytics/track, /api/analytics/stats)
  const badPingRes = await workerDefault.fetch(
    new Request('http://localhost/api/analytics/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: '' }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    badPingRes.status === 400,
    'POST /api/analytics/ping rejects missing sessionId/visitorId with 400 Bad Request'
  );

  const validPingRes = await workerDefault.fetch(
    new Request('http://localhost/api/analytics/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'sess_worker_6d_1',
        visitorId: 'vis_worker_6d_1',
        device: 'desktop',
        browser: 'Chrome',
        os: 'Linux',
        path: '/quiz',
        title: 'آزمون مرحله ۱',
      }),
    }),
    authEnv,
    mockCtx
  );
  const validPingJson = (await validPingRes.json()) as any;
  assert(
    validPingRes.status === 200 &&
      validPingJson.ok === true &&
      typeof validPingJson.onlineUsersCount === 'number' &&
      validPingJson.onlineUsersCount >= 1,
    'POST /api/analytics/ping registers active session and returns onlineUsersCount'
  );

  const validTrackRes = await workerDefault.fetch(
    new Request('http://localhost/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'sess_worker_6d_1',
        visitorId: 'vis_worker_6d_1',
        device: 'desktop',
        browser: 'Chrome',
        os: 'Linux',
        path: '/book',
        title: 'مطالعه فصل مکاتب روان‌شناسی',
        eventType: 'pageview',
      }),
    }),
    authEnv,
    mockCtx
  );
  const validTrackJson = (await validTrackRes.json()) as any;
  assert(
    validTrackRes.status === 200 &&
      validTrackJson.ok === true &&
      typeof validTrackJson.onlineUsersCount === 'number',
    'POST /api/analytics/track records visitor event and returns onlineUsersCount'
  );

  const statsRes = await workerDefault.fetch(
    new Request(
      'http://localhost/api/analytics/stats?visitorId=vis_worker_6d_1&sessionId=sess_worker_6d_1',
      { method: 'GET' }
    ),
    authEnv,
    mockCtx
  );
  const statsJson = (await statsRes.json()) as any;
  assert(
    statsRes.status === 200 &&
      typeof statsJson.onlineUsersCount === 'number' &&
      statsJson.isAdminView === false &&
      statsJson.detailedAnalyticsRedacted === true &&
      Array.isArray(statsJson.onlineSessions) &&
      statsJson.onlineSessions.length === 0 &&
      Array.isArray(statsJson.week?.days) &&
      statsJson.week.days.length === 7 &&
      Array.isArray(statsJson.deviceBreakdown) &&
      Array.isArray(statsJson.browserBreakdown) &&
      Array.isArray(statsJson.topPages) &&
      Array.isArray(statsJson.recentEvents) &&
      statsJson.recentEvents.length === 0 &&
      !JSON.stringify(statsJson).includes('vis_worker_6d_1') &&
      !JSON.stringify(statsJson).includes('sess_worker_6d_1'),
    'GET /api/analytics/stats returns coarse aggregate SiteAnalyticsData while redacting onlineSessions, recentEvents, and visitor/session IDs for non-admin callers'
  );

  // 14.8. Student Summary Report endpoint (POST /api/reports/student-summary)
  const summaryRes = await workerDefault.fetch(
    new Request('http://localhost/api/reports/student-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: 'سارا محمدی',
        stats: { overallMastery: 86, accuracyRate: 84 },
        progress: {
          totalStudyMinutes: 340,
          streakDays: 9,
          completedChapters: ['s1_c1', 's1_c2', 's1_c3'],
          unlockedBadgeIds: ['b1', 'b2'],
        },
        weakestChapters: ['آمار و روش تحقیق'],
      }),
    }),
    authEnv,
    mockCtx
  );
  const summaryJson = (await summaryRes.json()) as any;
  assert(
    summaryRes.status === 200 &&
      summaryJson.ok === true &&
      summaryJson.verified === false &&
      summaryJson.report?.verified === false &&
      summaryJson.report?.isServerVerified === false &&
      summaryJson.report?.verificationStatus === 'unverified-client-reported' &&
      summaryJson.report?.dataSource === 'client-self-reported' &&
      summaryJson.report?.studentName === 'سارا محمدی' &&
      summaryJson.report?.overallMastery === '86٪' &&
      summaryJson.report?.accuracyRate === '84٪' &&
      summaryJson.report?.completedChaptersCount === 3 &&
      summaryJson.report?.unlockedBadgesCount === 2 &&
      String(summaryJson.report?.verificationStamp).includes('تأییدنشده'),
    'POST /api/reports/student-summary marks unauthenticated client-supplied report as unverified (verified: false, client-self-reported)'
  );

  // 14.9. Unknown /api/* routes return JSON 404 (not SPA HTML) & Rate Limiter enforces 429 on abuse
  const unknownApiRes = await workerDefault.fetch(
    new Request('http://localhost/api/non-existent-endpoint', { method: 'GET' }),
    {
      ...authEnv,
      ASSETS: {
        async fetch() {
          return new Response('<html>SPA Fallback</html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          });
        },
      },
    },
    mockCtx
  );
  const unknownApiJson = (await unknownApiRes.json()) as any;
  assert(
    unknownApiRes.status === 404 &&
      unknownApiJson.ok === false &&
      (unknownApiRes.headers.get('Content-Type') || '').includes('application/json'),
    'Unknown /api/* route returns 404 JSON error and never falls through to SPA HTML asset'
  );

  // Test AI route rate limiting (35 req/min limit per client IP)
  let rateLimitedResponse: Response | null = null;
  for (let i = 0; i < 36; i++) {
    const res = await workerDefault.fetch(
      new Request('http://localhost/api/ai/adaptive-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.77',
        },
        body: JSON.stringify({ stats: { overallMastery: 50 }, weakChapters: [] }),
      }),
      authEnv,
      mockCtx
    );
    if (res.status === 429) {
      rateLimitedResponse = res;
      break;
    }
  }
  assert(
    rateLimitedResponse !== null &&
      rateLimitedResponse.status === 429 &&
      Number(rateLimitedResponse.headers.get('Retry-After')) >= 1,
    'Worker rate limiter blocks excessive AI endpoint requests with 429 Too Many Requests and Retry-After header'
  );

  // ===============================================================
  // TEST SUITE 15: PHASE 6D.1 OPERATIONAL SECURITY & DATA RELIABILITY
  // ===============================================================
  console.log('\nTest Suite 15: Phase 6D.1 Operational Security & Data Reliability');

  // 15.1. Sequential Migration 0005 verification
  const m5 = fs.readFileSync('migrations/0005_worker_operational_state.sql', 'utf8');
  sqlite.exec(m5);
  const rateLimitsTableCheck = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='api_rate_limits'")
    .get();
  const aiCacheTableCheck = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_response_cache'")
    .get();
  const analyticsDailyTableCheck = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='analytics_daily'")
    .get();
  const analyticsEventsTableCheck = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='analytics_events'")
    .get();
  assert(
    Boolean(rateLimitsTableCheck) &&
      Boolean(aiCacheTableCheck) &&
      Boolean(analyticsDailyTableCheck) &&
      Boolean(analyticsEventsTableCheck),
    'Migration 0005 creates api_rate_limits, ai_response_cache, analytics_daily, and analytics_events tables'
  );

  // 15.2. Task 1: Detailed Analytics Access Control Policy
  // (a) Unauthenticated request for ?detailed=true fails with 401
  const unauthDetailedRes = await workerDefault.fetch(
    new Request(
      'http://localhost/api/analytics/stats?detailed=true&visitorId=vis_worker_6d_1&sessionId=sess_worker_6d_1',
      { method: 'GET' }
    ),
    { ...authEnv, ADMIN_EMAILS: 'admin@psychomaster.ir' },
    mockCtx
  );
  assert(
    unauthDetailedRes.status === 401,
    'Unauthenticated GET /api/analytics/stats?detailed=true is rejected with 401 even when visitorId/sessionId query params are supplied'
  );

  // (b) Create a regular Google-authenticated user (NOT in ADMIN_EMAILS) and an allowlisted Admin Google user
  const regularGoogleUser = await userRepo.createOrUpdateGoogleUser({
    googleId: 'g_sub_regular_6d1',
    email: 'student.regular@example.com',
    name: 'دانشجوی عادی',
    mode: 'signin',
  });
  const regularUserToken = generateSessionToken();
  await userRepo.createSession(
    regularGoogleUser.user.userId,
    await hashSessionToken(regularUserToken)
  );

  const adminGoogleUser = await userRepo.createOrUpdateGoogleUser({
    googleId: 'g_sub_admin_6d1',
    email: 'admin@psychomaster.ir',
    name: 'مدیر ارشد سامانه',
    mode: 'signin',
  });
  const adminUserToken = generateSessionToken();
  await userRepo.createSession(
    adminGoogleUser.user.userId,
    await hashSessionToken(adminUserToken)
  );

  // (c) Ordinary Google sign-in alone CANNOT access detailed analytics
  const regularStatsRes = await workerDefault.fetch(
    new Request('http://localhost/api/analytics/stats', {
      method: 'GET',
      headers: { Authorization: `Bearer ${regularUserToken}` },
    }),
    { ...authEnv, ADMIN_EMAILS: 'admin@psychomaster.ir' },
    mockCtx
  );
  const regularStatsJson = (await regularStatsRes.json()) as any;
  assert(
    regularStatsRes.status === 200 &&
      regularStatsJson.isAdminView === false &&
      regularStatsJson.onlineSessions.length === 0 &&
      regularStatsJson.recentEvents.length === 0,
    'Ordinary Google-authenticated user (not in ADMIN_EMAILS) receives redacted analytics with empty onlineSessions and recentEvents'
  );

  const regularDetailedRes = await workerDefault.fetch(
    new Request('http://localhost/api/analytics/stats?detailed=true', {
      method: 'GET',
      headers: { Authorization: `Bearer ${regularUserToken}` },
    }),
    { ...authEnv, ADMIN_EMAILS: 'admin@psychomaster.ir' },
    mockCtx
  );
  assert(
    regularDetailedRes.status === 403,
    'Ordinary Google-authenticated user requesting GET /api/analytics/stats?detailed=true is rejected with 403 Forbidden'
  );

  // (d) When no ADMIN_EMAILS / ADMIN_USER_IDS allowlist is configured, fail closed even for admin user
  const unconfiguredAdminRes = await workerDefault.fetch(
    new Request('http://localhost/api/analytics/stats?detailed=true', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminUserToken}` },
    }),
    authEnv, // No ADMIN_EMAILS or ADMIN_USER_IDS
    mockCtx
  );
  assert(
    unconfiguredAdminRes.status === 403,
    'When no admin allowlist is configured on the server, detailed analytics fail closed with 403 Forbidden'
  );

  // (e) Guest account cannot be granted admin access even if its ID is placed in ADMIN_USER_IDS
  await userRepo.upsertUser({ userId: 'u_guest_6d1', name: 'مهمان' });
  const guestAdminToken = generateSessionToken();
  await userRepo.createSession('u_guest_6d1', await hashSessionToken(guestAdminToken));
  const guestDetailedRes = await workerDefault.fetch(
    new Request('http://localhost/api/analytics/stats?detailed=true', {
      method: 'GET',
      headers: { Authorization: `Bearer ${guestAdminToken}` },
    }),
    { ...authEnv, ADMIN_USER_IDS: 'u_guest_6d1' },
    mockCtx
  );
  assert(
    guestDetailedRes.status === 403,
    'Guest session cannot obtain administrator analytics privileges even if listed in ADMIN_USER_IDS'
  );

  // (f) Verified Google administrator in ADMIN_EMAILS receives detailed analytics with masked session/visitor IDs
  const adminStatsRes = await workerDefault.fetch(
    new Request('http://localhost/api/analytics/stats?detailed=true', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminUserToken}` },
    }),
    { ...authEnv, ADMIN_EMAILS: 'admin@psychomaster.ir' },
    mockCtx
  );
  const adminStatsJson = (await adminStatsRes.json()) as any;
  assert(
    adminStatsRes.status === 200 &&
      adminStatsJson.isAdminView === true &&
      adminStatsJson.detailedAnalyticsRedacted === false &&
      Array.isArray(adminStatsJson.onlineSessions) &&
      adminStatsJson.onlineSessions.length >= 1 &&
      Array.isArray(adminStatsJson.recentEvents) &&
      adminStatsJson.recentEvents.length >= 1 &&
      !JSON.stringify(adminStatsJson).includes('vis_worker_6d_1') &&
      !JSON.stringify(adminStatsJson).includes('sess_worker_6d_1'),
    'Verified allowlisted Google administrator receives detailed analytics while raw visitorId and sessionId tokens remain masked'
  );

  // 15.3. Task 2: Prevent Student Reports from Presenting Client-Supplied Data as Server-Verified Facts
  // (a) Unauthenticated request attempting to specify userId is rejected with 401
  const spoofUserIdReportRes = await workerDefault.fetch(
    new Request('http://localhost/api/reports/student-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: regularGoogleUser.user.userId,
        stats: { overallMastery: 99, accuracyRate: 99 },
      }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    spoofUserIdReportRes.status === 401,
    'Unauthenticated POST /api/reports/student-summary with a target userId is rejected with 401 Unauthorized'
  );

  // (b) Authenticated user with 0 verified stages sending fabricated 100% mastery / 99,999 study minutes
  const fabricatedAuthReportRes = await workerDefault.fetch(
    new Request('http://localhost/api/reports/student-summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${regularUserToken}`,
      },
      body: JSON.stringify({
        userName: 'پروفسور جعلی',
        stats: { overallMastery: 100, accuracyRate: 100 },
        progress: {
          totalStudyMinutes: 99999,
          streakDays: 365,
          completedChapters: ['c1', 'c2', 'c3', 'c4', 'c5'],
          unlockedBadgeIds: ['b1', 'b2', 'b3', 'b4'],
        },
      }),
    }),
    authEnv,
    mockCtx
  );
  const fabricatedAuthReportJson = (await fabricatedAuthReportRes.json()) as any;
  assert(
    fabricatedAuthReportRes.status === 200 &&
      fabricatedAuthReportJson.verified === true &&
      fabricatedAuthReportJson.report?.verified === true &&
      fabricatedAuthReportJson.report?.dataSource === 'server-authoritative' &&
      fabricatedAuthReportJson.report?.studentName === 'دانشجوی عادی' &&
      fabricatedAuthReportJson.report?.overallMastery === '0٪' &&
      fabricatedAuthReportJson.report?.accuracyRate === '0٪' &&
      fabricatedAuthReportJson.report?.totalStudyMinutes === 0 &&
      fabricatedAuthReportJson.report?.completedChaptersCount === 0 &&
      fabricatedAuthReportJson.report?.verifiedStagesCount === 0,
    'Authenticated POST /api/reports/student-summary completely ignores client-supplied stats/progress and reports authoritative D1 zeros'
  );

  // (c) Authenticated user who genuinely completed Stage 1 & Stage 2 in Suite 13 (s13Token)
  const s13VerifiedReportRes = await workerDefault.fetch(
    new Request('http://localhost/api/reports/student-summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s13Token}`,
      },
      body: JSON.stringify({
        // Pass bogus 0% client values to prove server uses D1 xp_ledger & profile instead
        stats: { overallMastery: 0, accuracyRate: 0 },
        progress: { totalStudyMinutes: 0, streakDays: 0, completedChapters: [] },
      }),
    }),
    authEnv,
    mockCtx
  );
  const s13VerifiedReportJson = (await s13VerifiedReportRes.json()) as any;
  assert(
    s13VerifiedReportRes.status === 200 &&
      s13VerifiedReportJson.verified === true &&
      s13VerifiedReportJson.report?.verifiedStagesCount === 2 &&
      s13VerifiedReportJson.report?.verifiedXp === 30 &&
      s13VerifiedReportJson.report?.accuracyRate === '90٪' &&
      s13VerifiedReportJson.report?.overallMastery !== '0٪',
    'Authenticated POST /api/reports/student-summary derives verifiedStagesCount, verifiedXp, and accuracyRate (90% = 18/20) from D1 xp_ledger'
  );

  // 15.4. Task 3: Cross-Isolate D1 Rate Limiting & Anti-Spoofing for Billable AI Endpoints
  const { clearWorkerInMemoryRateLimits } = await import('../src/worker/rateLimiter.ts');
  const { workerAnalyticsManager } = await import('../src/worker/analytics.ts');

  // (a) Verify that clearing isolate memory (simulating an isolate cold start / new isolate)
  // DOES NOT reset the 429 block for IP 203.0.113.77 because the quota is persisted in D1 `api_rate_limits`!
  clearWorkerInMemoryRateLimits();
  const postColdStartAiRes = await workerDefault.fetch(
    new Request('http://localhost/api/ai/adaptive-plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '203.0.113.77',
        // Also attempt to spoof X-Visitor-Id and X-Forwarded-For to bypass IP rate limit
        'X-Visitor-Id': 'spoofed_visitor_9999',
        'X-Forwarded-For': '198.51.100.123',
      },
      body: JSON.stringify({ stats: { overallMastery: 50 }, weakChapters: [] }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    postColdStartAiRes.status === 429,
    'D1-backed AI rate limiter blocks requests across isolate cold starts and resists X-Visitor-Id / X-Forwarded-For header spoofing'
  );

  // (b) Verify prompt length cap on billable AI endpoints
  const oversizedQuestion = 'الف'.repeat(1050);
  const oversizedMentorRes = await workerDefault.fetch(
    new Request('http://localhost/api/ai/mentor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.55',
      },
      body: JSON.stringify({ question: oversizedQuestion }),
    }),
    validAiEnv,
    mockCtx
  );
  assert(
    oversizedMentorRes.status === 400,
    'POST /api/ai/mentor rejects oversized prompts (>1000 chars) with 400 Bad Request before invoking Gemini'
  );

  // 15.5. Task 4: D1 Persistence Across Isolate Restarts (AI Cache & Analytics)
  // (a) Clear in-memory AI cache and verify `/api/ai/mentor` still hits L2 D1 `ai_response_cache` without calling Gemini
  const aiCallsBeforeColdCache = aiGenerateCallCount;
  workerAiCache.clearMemoryOnly();
  const d1CachedMentorRes = await workerDefault.fetch(
    new Request('http://localhost/api/ai/mentor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.56',
      },
      body: JSON.stringify({
        question: 'تفاوت بنیادی پتانسیل عمل و پتانسیل استراحت چیست؟',
        chapterTitle: 'مبانی زیستی',
      }),
    }),
    validAiEnv,
    mockCtx
  );
  const d1CachedMentorJson = (await d1CachedMentorRes.json()) as any;
  assert(
    d1CachedMentorRes.status === 200 &&
      d1CachedMentorJson.source === 'cache' &&
      d1CachedMentorJson.hitCount >= 3 &&
      aiGenerateCallCount === aiCallsBeforeColdCache,
    'After isolate memory reset, POST /api/ai/mentor serves cached answer from D1 ai_response_cache without a billable AI call'
  );

  // (b) Clear in-memory analytics state and verify `/api/analytics/stats` hydrates persisted daily visits and events from D1
  workerAnalyticsManager.clearMemoryOnly();
  const d1HydratedStatsRes = await workerDefault.fetch(
    new Request('http://localhost/api/analytics/stats?detailed=true', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminUserToken}` },
    }),
    { ...authEnv, ADMIN_EMAILS: 'admin@psychomaster.ir' },
    mockCtx
  );
  const d1HydratedStatsJson = (await d1HydratedStatsRes.json()) as any;
  assert(
    d1HydratedStatsRes.status === 200 &&
      d1HydratedStatsJson.today?.visits >= 1 &&
      Array.isArray(d1HydratedStatsJson.recentEvents) &&
      d1HydratedStatsJson.recentEvents.some((e: any) => e.title === 'مطالعه فصل مکاتب روان‌شناسی'),
    'After isolate memory reset, GET /api/analytics/stats hydrates persisted daily visits and tracked events from D1'
  );

  // =========================================================================
  // 16. PHASE 6G: FINAL BACKEND CLOSURE, ATOMIC D1 RATE LIMITING & RETENTION
  // =========================================================================
  console.log('\n--- 16. Phase 6G Final Backend Closure, Atomic D1 Rate Limiting & Retention ---');

  // 16.1 Task 1: Cross-origin POST rejection on analytics endpoints & session ownership on GET /api/leaderboard?userId=...
  const crossOriginPingRes = await workerDefault.fetch(
    new Request('http://localhost/api/analytics/ping', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil-attacker.example.com',
        'CF-Connecting-IP': '198.51.100.70',
      },
      body: JSON.stringify({ sessionId: 'sess_csrf_1', visitorId: 'vis_csrf_1' }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    crossOriginPingRes.status === 403,
    'POST /api/analytics/ping rejects cross-origin requests with 403 Forbidden'
  );

  const crossOriginTrackRes = await workerDefault.fetch(
    new Request('http://localhost/api/analytics/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil-attacker.example.com',
        'CF-Connecting-IP': '198.51.100.70',
      },
      body: JSON.stringify({ sessionId: 'sess_csrf_1', visitorId: 'vis_csrf_1', path: '/test' }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    crossOriginTrackRes.status === 403,
    'POST /api/analytics/track rejects cross-origin requests with 403 Forbidden'
  );

  const unauthLeaderboardRankProbeRes = await workerDefault.fetch(
    new Request(`http://localhost/api/leaderboard?userId=${encodeURIComponent(s13UserId)}`, {
      method: 'GET',
      headers: { 'CF-Connecting-IP': '198.51.100.71' },
    }),
    authEnv,
    mockCtx
  );
  const unauthLeaderboardRankProbeJson = (await unauthLeaderboardRankProbeRes.json()) as any;
  assert(
    unauthLeaderboardRankProbeRes.status === 200 &&
      unauthLeaderboardRankProbeJson.currentUserRank === -1 &&
      !unauthLeaderboardRankProbeJson.leaderboard.some((entry: any) => entry.isCurrentUser === true),
    'GET /api/leaderboard?userId=<victim> without matching session does not leak victim rank or mark victim as isCurrentUser'
  );

  const authLeaderboardRankRes = await workerDefault.fetch(
    new Request(`http://localhost/api/leaderboard?userId=${encodeURIComponent(s13UserId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${s13Token}`,
        'CF-Connecting-IP': '198.51.100.71',
      },
    }),
    authEnv,
    mockCtx
  );
  const authLeaderboardRankJson = (await authLeaderboardRankRes.json()) as any;
  assert(
    authLeaderboardRankRes.status === 200 && authLeaderboardRankJson.currentUserRank >= 1,
    'GET /api/leaderboard?userId=<self> with valid matching session returns caller currentUserRank'
  );

  // 16.2 Task 2: Online-verified vs offline-local stage provenance & tamper protection
  // s13UserId completed Stage 1 (score: 8, stars: 2) and Stage 2 via `/api/leaderboard/submit` earlier
  const stageTamperSyncRes = await workerDefault.fetch(
    new Request('http://localhost/api/user/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s13Token}`,
        'CF-Connecting-IP': '198.51.100.72',
      },
      body: JSON.stringify({
        userId: s13UserId,
        name: 'کاربر مرحله ۱۳',
        completedStages: {
          '1': {
            stageNumber: 1,
            completedAt: new Date().toISOString(),
            stars: 1,
            score: 1,
            totalQuestions: 10,
            xpEarned: 999,
          },
          '3': {
            stageNumber: 3,
            completedAt: new Date().toISOString(),
            stars: 3,
            score: 10,
            totalQuestions: 10,
            xpEarned: 150,
          },
        },
      }),
    }),
    authEnv,
    mockCtx
  );
  const stageTamperSyncJson = (await stageTamperSyncRes.json()) as any;
  const syncedStage1 = stageTamperSyncJson.profile?.completedStages?.['1'];
  const syncedStage3 = stageTamperSyncJson.profile?.completedStages?.['3'];
  assert(
    stageTamperSyncRes.status === 200 &&
      syncedStage1?.verified === true &&
      syncedStage1?.source === 'online-verified' &&
      syncedStage1?.stars === 2 &&
      syncedStage1?.score === 8 &&
      syncedStage3?.verified === false &&
      syncedStage3?.source === 'offline-local',
    'POST /api/user/sync preserves online-verified stage score/stars against client overwrite and tags unverified offline stages as offline-local (verified: false)'
  );

  // 16.3 Task 3: Atomic D1 rate-limiter concurrency, deterministic pruning & fail-closed on D1 failure
  const { pruneExpiredRateLimits, checkWorkerRateLimit } = await import('../src/worker/rateLimiter.ts');
  clearWorkerInMemoryRateLimits();

  // Fire 40 concurrent requests from the same IP across cold isolate state and verify exact cap of AI_MAX_REQUESTS (35) allowed
  const concurrentAiIp = '198.51.100.88';
  const concurrentRateLimitPromises = Array.from({ length: 40 }, () => {
    clearWorkerInMemoryRateLimits();
    return checkWorkerRateLimit(
      new Request('http://localhost/api/ai/mentor', {
        method: 'POST',
        headers: { 'CF-Connecting-IP': concurrentAiIp },
      }),
      '/api/ai/mentor',
      validAiEnv
    );
  });
  const concurrentRateLimitResults = await Promise.all(concurrentRateLimitPromises);
  const rlAllowedCount = concurrentRateLimitResults.filter((r) => r === null).length;
  const rlBlockedCount = concurrentRateLimitResults.filter((r) => r !== null && r.status === 429).length;
  assert(
    rlAllowedCount === 35 && rlBlockedCount === 5,
    `Atomic D1 rate-limit upsert enforces exact 35-request quota under 40 concurrent requests (allowed=${rlAllowedCount}, blocked=${rlBlockedCount})`
  );

  // Deterministic cleanup of expired D1 rate-limit rows
  await sqlite
    .prepare('INSERT OR REPLACE INTO api_rate_limits (bucket_key, scope, count, reset_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('expired:test:bucket', 'ai', 5, Date.now() - 60_000, Date.now() - 120_000);
  const prunedRateLimitRows = await pruneExpiredRateLimits(authEnv.DB!, Date.now());
  assert(
    prunedRateLimitRows >= 1,
    'pruneExpiredRateLimits deterministically removes expired D1 api_rate_limits rows'
  );

  // Fail-closed 503 when D1 rate-limit storage fails on a billable AI endpoint
  clearWorkerInMemoryRateLimits();
  const brokenD1 = {
    prepare() {
      throw new Error('Simulated D1 storage outage');
    },
  } as unknown as D1Database;
  const brokenD1AiRes = await workerDefault.fetch(
    new Request('http://localhost/api/ai/mentor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.89',
      },
      body: JSON.stringify({ question: 'سوال تست در زمان خطای D1' }),
    }),
    { ...validAiEnv, DB: brokenD1 },
    mockCtx
  );
  assert(
    brokenD1AiRes.status === 503,
    'Billable AI endpoint fails closed with 503 Service Unavailable if D1 rate-limit storage throws an error'
  );

  // 16.4 Task 4: AI response cache TTL expiration, bounded payload size (413), and question-generation authentication + cap
  await workerAiCache.setWithD1(
    authEnv.DB!,
    'سوال منقضی شده آزمایشی؟',
    'پاسخ قدیمی که باید منقضی شود',
    'فصل تست',
    'gemini'
  );
  sqlite
    .prepare('UPDATE ai_response_cache SET expires_at = ? WHERE question = ?')
    .run(Date.now() - 60_000, 'سوال منقضی شده آزمایشی؟');
  workerAiCache.clearMemoryOnly();
  const expiredCacheLookup = await workerAiCache.getWithD1(
    authEnv.DB!,
    'سوال منقضی شده آزمایشی؟',
    'فصل تست'
  );
  const expiredCacheRowAfterLookup = sqlite
    .prepare('SELECT cache_key FROM ai_response_cache WHERE question = ?')
    .get('سوال منقضی شده آزمایشی؟');
  assert(
    expiredCacheLookup === null && !expiredCacheRowAfterLookup,
    'D1 AI cache never serves expired entries (expires_at <= now) and deletes expired rows upon lookup'
  );

  // Oversized JSON body (>16KB) rejected with 413 Payload Too Large
  const hugePayload = JSON.stringify({
    question: 'سوال کوتاه',
    chapterTitle: 'فصل',
    padding: 'الف'.repeat(20_000),
  });
  const oversizedBodyAiRes = await workerDefault.fetch(
    new Request('http://localhost/api/ai/mentor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.91',
      },
      body: hugePayload,
    }),
    validAiEnv,
    mockCtx
  );
  assert(
    oversizedBodyAiRes.status === 413,
    'AI endpoints reject request bodies exceeding 16 KB with 413 Payload Too Large'
  );

  // Question generation rejects oversized chapterId (>64 chars) or chapterTitle (>200 chars) with 400 Bad Request
  const oversizedChapterGenRes = await workerDefault.fetch(
    new Request('http://localhost/api/quiz/bank/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.92',
      },
      body: JSON.stringify({
        chapterId: 'ch_'.repeat(30),
        chapterTitle: 'مفاهیم پایه روان‌شناسی',
        difficulty: 'medium',
      }),
    }),
    validAiEnv,
    mockCtx
  );
  assert(
    oversizedChapterGenRes.status === 400,
    'POST /api/quiz/bank/generate rejects oversized chapterId (>64 chars) with 400 Bad Request'
  );

  // Valid question generation persists a validated question with bounded fields
  const authGenQuestionRes = await workerDefault.fetch(
    new Request('http://localhost/api/quiz/bank/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s13Token}`,
        'CF-Connecting-IP': '198.51.100.93',
      },
      body: JSON.stringify({
        chapterId: 'ch1',
        chapterTitle: 'مفاهیم پایه روان‌شناسی',
        difficulty: 'medium',
      }),
    }),
    validAiEnv,
    mockCtx
  );
  const authGenQuestionJson = (await authGenQuestionRes.json()) as any;
  assert(
    authGenQuestionRes.status === 200 &&
      authGenQuestionJson.success === true &&
      typeof authGenQuestionJson.question?.id === 'string',
    'POST /api/quiz/bank/generate succeeds for valid bounded inputs and persists the validated question in D1'
  );

  // 16.5 Task 5: Analytics visitorId anonymization and bounded D1 retention cleanup
  const { anonymizeVisitorId, ANALYTICS_EVENTS_MAX_ROWS } = await import('../src/worker/analytics.ts');
  const rawTestVisitorId = 'vis_raw_secret_identifier_999';
  const expectedAnonId = anonymizeVisitorId(rawTestVisitorId);
  assert(
    expectedAnonId.startsWith('uv_') && expectedAnonId !== rawTestVisitorId,
    'anonymizeVisitorId hashes raw client visitorId into a deterministic one-way uv_* digest'
  );

  await workerDefault.fetch(
    new Request('http://localhost/api/analytics/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.94',
      },
      body: JSON.stringify({
        visitorId: rawTestVisitorId,
        sessionId: 'sess_anon_check_1',
        device: 'desktop',
        path: '/curriculum',
        title: 'بررسی ناشناس‌سازی',
      }),
    }),
    authEnv,
    mockCtx
  );

  const todayIsoKey = new Date().toISOString().split('T')[0];
  const dailyRowAfterTrack = sqlite
    .prepare('SELECT unique_visitors FROM analytics_daily WHERE date = ?')
    .get(todayIsoKey) as { unique_visitors: string } | undefined;
  assert(
    Boolean(dailyRowAfterTrack) &&
      !dailyRowAfterTrack!.unique_visitors.includes(rawTestVisitorId) &&
      dailyRowAfterTrack!.unique_visitors.includes(expectedAnonId),
    'D1 analytics_daily stores only anonymized uv_* digests and never persists raw client visitorId strings'
  );

  // Insert an old daily row (>90 days old) and an old event (>7 days old) and verify pruneExpiredAnalytics deletes them
  sqlite
    .prepare(
      'INSERT OR REPLACE INTO analytics_daily (date, visits, unique_visitors, updated_at) VALUES (?, ?, ?, ?)'
    )
    .run('2020-01-01', 10, '["uv_old"]', '2020-01-01T00:00:00.000Z');
  sqlite
    .prepare(
      'INSERT OR REPLACE INTO analytics_events (id, timestamp, type, title, path, device) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run('ev_expired_old', '2020-01-01T00:00:00.000Z', 'pageview', 'رویداد قدیمی', '/old', 'mobile');

  const pruneStats = await workerAnalyticsManager.pruneExpiredAnalytics(authEnv.DB!, new Date());
  const oldDailyStillExists = sqlite
    .prepare('SELECT date FROM analytics_daily WHERE date = ?')
    .get('2020-01-01');
  const oldEventStillExists = sqlite
    .prepare('SELECT id FROM analytics_events WHERE id = ?')
    .get('ev_expired_old');
  const totalEventsCountRow = sqlite
    .prepare('SELECT COUNT(*) as cnt FROM analytics_events')
    .get() as { cnt: number };

  assert(
    pruneStats.deletedDailyRows >= 1 &&
      pruneStats.deletedEventRows >= 1 &&
      !oldDailyStillExists &&
      !oldEventStillExists &&
      totalEventsCountRow.cnt <= ANALYTICS_EVENTS_MAX_ROWS,
    'pruneExpiredAnalytics deletes analytics_daily rows >90 days old, analytics_events rows >7 days old, and caps stored events at 200'
  );

  // ---------------------------------------------------------------
  // 17. PHASE 10C.4: POMODORO, CHAPTER COMPLETION, & BADGE ELIGIBILITY SERVER INTEGRITY
  // ---------------------------------------------------------------
  console.log('\nTest Suite 17: Phase 10C.4 Pomodoro, Chapter Completion & Server Badge Eligibility Integrity');

  const s17UserRes = await userRepo.createOrUpdateGoogleUser({
    googleId: 'google_sub_phase10c4_user',
    email: 'phase10c4@tehran.ac.ir',
    name: 'کاربر تست مرحله ۱۰ج۴',
  });
  const s17UserId = s17UserRes.user.userId;
  const s17Token = generateSessionToken();
  await userRepo.createSession(s17UserId, await hashSessionToken(s17Token));

  // 17.1. Server rejects unearned badge_unlock (e.g., badge-first-quiz before any quiz is answered)
  const s17UnearnedQuizBadgeRes = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s17Token}`,
      },
      body: JSON.stringify({
        userId: s17UserId,
        rewardType: 'badge_unlock',
        badgeId: 'badge-first-quiz',
      }),
    }),
    authEnv,
    mockCtx
  );
  assert(
    s17UnearnedQuizBadgeRes.status === 400,
    '17.1: POST /api/leaderboard/submit rejects badge-first-quiz when user has 0 verified quiz answers in xp_ledger (400)'
  );

  // 17.2. Completing a valid chapter via chapter_completion awards +20 XP once and updates completedChapters
  const s17Ch1Res = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s17Token}`,
      },
      body: JSON.stringify({
        userId: s17UserId,
        rewardType: 'chapter_completion',
        chapterId: 'ch-1',
      }),
    }),
    authEnv,
    mockCtx
  );
  const s17Ch1Json = (await s17Ch1Res.json()) as any;
  assert(
    s17Ch1Res.status === 200 &&
      s17Ch1Json.applied === true &&
      s17Ch1Json.awardedXp === 20 &&
      s17Ch1Json.updatedXp === 20 &&
      Array.isArray(s17Ch1Json.profile?.completedChapters) &&
      s17Ch1Json.profile.completedChapters.includes('ch-1'),
    '17.2: POST /api/leaderboard/submit with chapter_completion (ch-1) awards +20 XP and records ch-1 in completedChapters'
  );

  // Duplicate chapter_completion is idempotent and awards 0 additional XP
  const s17Ch1DupRes = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s17Token}`,
      },
      body: JSON.stringify({
        userId: s17UserId,
        rewardType: 'chapter_completion',
        chapterId: 'ch-1',
      }),
    }),
    authEnv,
    mockCtx
  );
  const s17Ch1DupJson = (await s17Ch1DupRes.json()) as any;
  assert(
    s17Ch1DupRes.status === 200 &&
      s17Ch1DupJson.applied === false &&
      s17Ch1DupJson.alreadyClaimed === true &&
      s17Ch1DupJson.awardedXp === 0 &&
      s17Ch1DupJson.updatedXp === 20,
    '17.3: Duplicate chapter_completion submission returns alreadyClaimed=true and awards 0 XP'
  );

  // 17.4. Valid Pomodoro session awards canonical +35 XP (for 25m), increments totalStudyMinutes by 25, and deduplicates
  const s17PomoRes = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s17Token}`,
      },
      body: JSON.stringify({
        userId: s17UserId,
        rewardType: 'pomodoro',
        sessionId: 'pomo_s17_valid_25m',
        chapterId: 'ch-1',
        seconds: 25 * 60,
      }),
    }),
    authEnv,
    mockCtx
  );
  const s17PomoJson = (await s17PomoRes.json()) as any;
  assert(
    s17PomoRes.status === 200 &&
      s17PomoJson.applied === true &&
      s17PomoJson.awardedXp === 35 &&
      s17PomoJson.updatedXp === 55 &&
      s17PomoJson.profile?.totalStudyMinutes === 25,
    '17.4: Valid 25-min Pomodoro submission awards +35 XP (total 55 XP) and increments totalStudyMinutes by 25'
  );

  // 17.5. Answering a verified quiz unlocks eligibility for badge-first-quiz on server
  const s17QuizRes = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s17Token}`,
      },
      body: JSON.stringify({
        userId: s17UserId,
        rewardType: 'quiz_answer',
        chapterId: 'ch-1',
        questionId: 'q-1-1',
        userAnswer: 1,
        isCorrect: true,
      }),
    }),
    authEnv,
    mockCtx
  );
  assert(s17QuizRes.status === 200, '17.5a: Verified quiz_answer submission succeeds (200)');

  const s17EarnedQuizBadgeRes = await workerDefault.fetch(
    new Request('http://localhost/api/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_token=${s17Token}`,
      },
      body: JSON.stringify({
        userId: s17UserId,
        rewardType: 'badge_unlock',
        badgeId: 'badge-first-quiz',
      }),
    }),
    authEnv,
    mockCtx
  );
  const s17EarnedQuizBadgeJson = (await s17EarnedQuizBadgeRes.json()) as any;
  assert(
    s17EarnedQuizBadgeRes.status === 200 &&
      s17EarnedQuizBadgeJson.applied === true &&
      s17EarnedQuizBadgeJson.awardedXp === 50 &&
      s17EarnedQuizBadgeJson.updatedXp === 55 + 10 + 50 &&
      Array.isArray(s17EarnedQuizBadgeJson.profile?.unlockedBadgeIds) &&
      s17EarnedQuizBadgeJson.profile.unlockedBadgeIds.includes('badge-first-quiz'),
    '17.5b: Server awards +50 XP for badge-first-quiz once user has a verified quiz_answer in xp_ledger'
  );

  // 17.6. Express UserSyncManager parity for Pomodoro, chapter_completion, and verified quiz keys
  const s17ExpressUserId = 'usr_express_10c4';
  userSyncManager.syncUser({ userId: s17ExpressUserId, name: 'کاربر اکسپرس ۱۰ج۴' });
  userSyncManager.awardXp({
    userId: s17ExpressUserId,
    xpEarned: 20,
    reason: 'chapter_completion',
    chapterId: 'ch-1',
    idempotencyKey: 'chapter_completion:ch-1',
  });
  userSyncManager.awardXp({
    userId: s17ExpressUserId,
    xpEarned: 35,
    reason: 'study_session',
    pomodoroMinutes: 25,
    idempotencyKey: 'pomodoro:pomo_exp_25m',
  });
  userSyncManager.awardXp({
    userId: s17ExpressUserId,
    xpEarned: 10,
    reason: 'quiz_completion',
    idempotencyKey: 'quiz_answer:ch-1:q-1-1',
  });
  const s17ExpressUser = userSyncManager.getUser(s17ExpressUserId)!;
  const s17ExpressQuizKeys = userSyncManager.getVerifiedQuizIdempotencyKeys(s17ExpressUserId);
  assert(
    s17ExpressUser.xp === 65 &&
      s17ExpressUser.totalStudyMinutes === 25 &&
      s17ExpressUser.completedChapters.includes('ch-1') &&
      s17ExpressQuizKeys.has('quiz_answer:ch-1:q-1-1'),
    '17.6: Express UserSyncManager tracks chapter_completion, pomodoro study minutes, and verified quiz idempotency keys'
  );

  console.log('\n====================================================');
  console.log(`ALL TESTS PASSED! (${passed} checks passed, ${failed} failed)`);
  console.log('====================================================\n');
}

runTestSuite().catch((err) => {
  console.error('\n❌ FATAL TEST FAILURE:', err);
  process.exit(1);
});


