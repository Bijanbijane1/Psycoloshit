/**
 * Reusable D1 Entrance Exam Simulator Repository
 * Project: PsychoMaster (روان‌لینگو) - Phase 10B
 *
 * Implements exam blueprint management, timed attempt lifecycle, per-question answer/flag persistence,
 * Konkoor negative-marking & weighted scoring, idempotent XP awards, and historical exam analytics.
 * Strictly prevents pre-submission answer/explanation leakage on in-progress attempts.
 */

import type { D1Database } from '../types.ts';
import {
  type BankQuestion,
  type ExamAttemptAnswerDbRow,
  type ExamAttemptAnswerRecord,
  type ExamAttemptDbRow,
  type ExamAttemptQuestionPublic,
  type ExamAttemptQuestionReview,
  type ExamAttemptRecord,
  type ExamBlueprint,
  type ExamBlueprintDbRow,
  type ExamSectionBreakdown,
  type QuestionDbRow,
  type SyncedUserProfile,
  rowToBankQuestion,
  rowToExamAttemptAnswerRecord,
  rowToExamAttemptRecord,
  rowToExamBlueprint,
} from './schema.ts';
import { D1UserRepository } from './userRepository.ts';
import {
  DEFAULT_EXAM_BLUEPRINTS,
  calculateExamScoreAndBreakdown,
} from '../../data/examBlueprintsData.ts';
import { buildServerExamQuestionPool } from '../examQuestionsServerPool.ts';

export interface ActiveExamAttemptPayload {
  attempt: ExamAttemptRecord;
  blueprint: ExamBlueprint;
  questions: ExamAttemptQuestionPublic[];
  answers: Record<string, ExamAttemptAnswerRecord>;
  remainingSeconds: number;
}

export interface SubmittedExamAttemptPayload {
  attempt: ExamAttemptRecord;
  blueprint: ExamBlueprint;
  questions: ExamAttemptQuestionReview[];
  answers: Record<string, ExamAttemptAnswerRecord>;
  alreadySubmitted: boolean;
  xpAwarded: number;
  updatedProfile?: SyncedUserProfile | null;
}

export interface UserExamHistorySummary {
  attempts: Array<
    ExamAttemptRecord & {
      blueprintTitle: string;
      blueprintSlug: string;
      examType: ExamBlueprint['examType'];
      negativeMarking: boolean;
      negativeWeight: number;
      totalQuestions: number;
    }
  >;
  stats: {
    totalCompletedExams: number;
    inProgressCount: number;
    averageRawScorePercent: number;
    averageWeightedScorePercent: number;
    bestRawScorePercent: number;
    totalExamQuestionsAnswered: number;
    totalCorrectAnswers: number;
    totalWrongAnswers: number;
    strongestSectionTitle: string | null;
    weakestSectionTitle: string | null;
    recentTrendDelta: number;
  };
}

export class D1ExamRepository {
  private db: D1Database;
  private static seededDbs = new WeakSet<object>();

  constructor(db: D1Database) {
    this.db = db;
  }

  static clearSeededCache(): void {
    D1ExamRepository.seededDbs = new WeakSet<object>();
  }

  /**
   * Ensure migrations 0006, 0007, and 0008 tables, columns, and indexes exist, and default blueprints + question pool are seeded.
   */
  async ensureTablesAndSeeded(): Promise<void> {
    if (this.db && typeof this.db === 'object' && D1ExamRepository.seededDbs.has(this.db)) {
      return;
    }

    await this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS exam_blueprints (
          id TEXT PRIMARY KEY NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          exam_type TEXT NOT NULL CHECK (exam_type IN ('diagnostic', 'subject', 'comprehensive', 'timed_drill')),
          duration_minutes INTEGER NOT NULL,
          total_questions INTEGER NOT NULL,
          negative_marking INTEGER NOT NULL DEFAULT 1,
          negative_weight REAL NOT NULL DEFAULT 0.3333,
          sections_json TEXT NOT NULL DEFAULT '[]',
          is_published INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      )
      .run();

    await this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS exam_attempts (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          blueprint_id TEXT NOT NULL REFERENCES exam_blueprints(id) ON DELETE RESTRICT,
          status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'expired', 'abandoned')),
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT NOT NULL,
          submitted_at TEXT,
          duration_seconds_used INTEGER NOT NULL DEFAULT 0,
          question_ids_json TEXT NOT NULL DEFAULT '[]',
          raw_score_percent REAL,
          weighted_score_percent REAL,
          correct_count INTEGER NOT NULL DEFAULT 0,
          wrong_count INTEGER NOT NULL DEFAULT 0,
          unanswered_count INTEGER NOT NULL DEFAULT 0,
          section_breakdown_json TEXT NOT NULL DEFAULT '[]',
          xp_awarded INTEGER NOT NULL DEFAULT 0,
          idempotency_key TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      )
      .run();

    await this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS exam_attempt_answers (
          attempt_id TEXT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
          question_id TEXT NOT NULL,
          section_id TEXT NOT NULL DEFAULT 'general',
          selected_index INTEGER,
          is_flagged INTEGER NOT NULL DEFAULT 0,
          time_spent_seconds INTEGER NOT NULL DEFAULT 0,
          is_correct INTEGER,
          revision INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (attempt_id, question_id)
        )`
      )
      .run();

    try {
      await this.db
        .prepare('ALTER TABLE exam_attempt_answers ADD COLUMN revision INTEGER NOT NULL DEFAULT 0')
        .run();
    } catch {
      // Column already exists
    }

    await this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS exam_question_bank (
          id TEXT PRIMARY KEY NOT NULL,
          chapter_id TEXT NOT NULL,
          chapter_title TEXT NOT NULL,
          difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
          question TEXT NOT NULL,
          options TEXT NOT NULL,
          correct_index INTEGER NOT NULL CHECK (correct_index >= 0 AND correct_index <= 3),
          explanation TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'academic-curated' CHECK (source IN ('academic-curated', 'ai-generated')),
          times_answered INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`
      )
      .run();

    // Create required indexes to guarantee runtime parity with migrations 0006 & 0007
    await this.db
      .prepare(
        'CREATE INDEX IF NOT EXISTS idx_exam_blueprints_published ON exam_blueprints(is_published, exam_type)'
      )
      .run();

    await this.db
      .prepare(
        'CREATE INDEX IF NOT EXISTS idx_exam_attempts_user_status ON exam_attempts(user_id, status, created_at DESC)'
      )
      .run();

    await this.db
      .prepare(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attempts_idempotency ON exam_attempts(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL'
      )
      .run();

    await this.db
      .prepare(
        'CREATE INDEX IF NOT EXISTS idx_exam_attempt_answers_attempt ON exam_attempt_answers(attempt_id)'
      )
      .run();

    await this.db
      .prepare(
        'CREATE INDEX IF NOT EXISTS idx_exam_question_bank_chapter ON exam_question_bank(chapter_id, difficulty)'
      )
      .run();

    // Ensure default blueprints are seeded or updated idempotently
    for (const bp of DEFAULT_EXAM_BLUEPRINTS) {
      await this.db
        .prepare(
          `INSERT INTO exam_blueprints (
            id, slug, title, description, exam_type, duration_minutes, total_questions,
            negative_marking, negative_weight, sections_json, is_published, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            slug = excluded.slug,
            title = excluded.title,
            description = excluded.description,
            exam_type = excluded.exam_type,
            duration_minutes = excluded.duration_minutes,
            total_questions = excluded.total_questions,
            negative_marking = excluded.negative_marking,
            negative_weight = excluded.negative_weight,
            sections_json = excluded.sections_json,
            is_published = excluded.is_published`
        )
        .bind(
          bp.id,
          bp.slug,
          bp.title,
          bp.description,
          bp.examType,
          bp.durationMinutes,
          bp.totalQuestions,
          bp.negativeMarking ? 1 : 0,
          bp.negativeWeight,
          JSON.stringify(bp.sections),
          bp.isPublished ? 1 : 0,
          bp.createdAt
        )
        .run();
    }

    // Ensure dedicated server-only Konkoor question pool is seeded into exam_question_bank
    const pool = buildServerExamQuestionPool();
    const countRow = await this.db
      .prepare('SELECT COUNT(*) as cnt FROM exam_question_bank')
      .first<{ cnt: number }>();

    if (!countRow || (Number(countRow.cnt) || 0) < pool.length) {
      const nowIso = new Date().toISOString();
      for (const q of pool) {
        await this.db
          .prepare(
            `INSERT OR IGNORE INTO exam_question_bank (
              id, chapter_id, chapter_title, difficulty, question, options,
              correct_index, explanation, source, times_answered, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            q.id,
            q.chapterId,
            q.chapterTitle,
            q.difficulty,
            q.question,
            JSON.stringify(q.options),
            q.correctIndex,
            q.explanation,
            q.source,
            q.timesAnswered ?? 10,
            nowIso
          )
          .run();
      }
    }

    if (this.db && typeof this.db === 'object') {
      D1ExamRepository.seededDbs.add(this.db);
    }
  }

  /**
   * List all published exam blueprints ordered by exam layout priority.
   */
  async listBlueprints(): Promise<ExamBlueprint[]> {
    await this.ensureTablesAndSeeded();
    const res = await this.db
      .prepare('SELECT * FROM exam_blueprints WHERE is_published = 1 ORDER BY created_at ASC, id ASC')
      .all<ExamBlueprintDbRow>();
    const rows = res.results || [];
    return rows.map(rowToExamBlueprint);
  }

  /**
   * Retrieve a blueprint by ID or slug.
   */
  async getBlueprintByIdOrSlug(idOrSlug: string): Promise<ExamBlueprint | null> {
    if (!idOrSlug || typeof idOrSlug !== 'string' || !idOrSlug.trim()) return null;
    await this.ensureTablesAndSeeded();
    const clean = idOrSlug.trim();
    const row = await this.db
      .prepare('SELECT * FROM exam_blueprints WHERE id = ? OR slug = ? LIMIT 1')
      .bind(clean, clean)
      .first<ExamBlueprintDbRow>();
    if (!row) return null;
    return rowToExamBlueprint(row);
  }

  /**
   * Create or upsert a custom blueprint (useful for custom drills and tests).
   */
  async upsertBlueprint(blueprint: ExamBlueprint): Promise<ExamBlueprint> {
    await this.ensureTablesAndSeeded();
    await this.db
      .prepare(
        `INSERT INTO exam_blueprints (
          id, slug, title, description, exam_type, duration_minutes, total_questions,
          negative_marking, negative_weight, sections_json, is_published, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          slug = excluded.slug,
          title = excluded.title,
          description = excluded.description,
          exam_type = excluded.exam_type,
          duration_minutes = excluded.duration_minutes,
          total_questions = excluded.total_questions,
          negative_marking = excluded.negative_marking,
          negative_weight = excluded.negative_weight,
          sections_json = excluded.sections_json,
          is_published = excluded.is_published`
      )
      .bind(
        blueprint.id,
        blueprint.slug,
        blueprint.title,
        blueprint.description,
        blueprint.examType,
        blueprint.durationMinutes,
        blueprint.totalQuestions,
        blueprint.negativeMarking ? 1 : 0,
        blueprint.negativeWeight,
        JSON.stringify(blueprint.sections || []),
        blueprint.isPublished ? 1 : 0,
        blueprint.createdAt || new Date().toISOString()
      )
      .run();
    return blueprint;
  }

  /**
   * Start a new timed exam attempt (or resume an existing idempotent in-progress attempt).
   * Returns active attempt with questions stripped of `correctIndex` and `explanation`.
   */
  async startAttempt(params: {
    userId: string;
    blueprintId: string;
    idempotencyKey?: string;
  }): Promise<
    | { ok: true; status: 200 | 201; data: ActiveExamAttemptPayload }
    | { ok: false; status: number; error: string }
  > {
    const cleanUserId = typeof params.userId === 'string' ? params.userId.trim() : '';
    const cleanBlueprintId = typeof params.blueprintId === 'string' ? params.blueprintId.trim() : '';
    let cleanIdempotencyKey =
      typeof params.idempotencyKey === 'string' && params.idempotencyKey.trim()
        ? params.idempotencyKey.trim().slice(0, 128)
        : null;

    if (!cleanUserId) {
      return { ok: false, status: 401, error: 'Unauthorized: Valid userId is required' };
    }
    if (!cleanBlueprintId) {
      return { ok: false, status: 400, error: 'شناسنامه آزمون (blueprintId) الزامی است.' };
    }

    await this.ensureTablesAndSeeded();

    const blueprint = await this.getBlueprintByIdOrSlug(cleanBlueprintId);
    if (!blueprint || !blueprint.isPublished) {
      return { ok: false, status: 404, error: 'آزمون مورد نظر یافت نشد یا غیرفعال است.' };
    }

    // If an idempotencyKey was provided, check if an attempt already exists for this user + key
    if (cleanIdempotencyKey) {
      const existingAttemptRow = await this.db
        .prepare('SELECT * FROM exam_attempts WHERE user_id = ? AND idempotency_key = ? LIMIT 1')
        .bind(cleanUserId, cleanIdempotencyKey)
        .first<ExamAttemptDbRow>();

      if (existingAttemptRow) {
        if (existingAttemptRow.status === 'in_progress') {
          const nowMs = Date.now();
          const expiresMs = new Date(existingAttemptRow.expires_at).getTime();
          if (Number.isFinite(expiresMs) && nowMs > expiresMs) {
            await this.db
              .prepare("UPDATE exam_attempts SET status = 'expired', updated_at = ? WHERE id = ?")
              .bind(new Date(nowMs).toISOString(), existingAttemptRow.id)
              .run();
            return {
              ok: false,
              status: 409,
              error: 'مهلت زمانی این تلاش آزمون به پایان رسیده است.',
            };
          }
          const loaded = await this.getAttemptForUser(existingAttemptRow.id, cleanUserId);
          if (loaded.ok && loaded.mode === 'active') {
            return { ok: true, status: 200, data: loaded.data };
          }
        } else {
          return {
            ok: false,
            status: 409,
            error: 'این تلاش آزمون قبلاً ثبت نهایی یا منقضی شده است. لطفاً با شناسه درخواست جدید اقدام فرمایید.',
          };
        }
      }
    }

    // Fetch all available questions from dedicated exam_question_bank to select per section
    const allQRes = await this.db
      .prepare('SELECT * FROM exam_question_bank ORDER BY id ASC')
      .all<QuestionDbRow>();
    const allQuestions = (allQRes.results || []).map(rowToBankQuestion);

    if (allQuestions.length === 0) {
      return { ok: false, status: 503, error: 'بانک سوالات آزمون در حال حاضر خالی است.' };
    }

    const usedQuestionIds = new Set<string>();
    const selectedQuestionsWithSection: Array<{
      question: BankQuestion;
      sectionId: string;
      sectionTitle: string;
    }> = [];

    const sectionsToFill =
      blueprint.sections && blueprint.sections.length > 0
        ? blueprint.sections
        : [
            {
              id: 'general',
              title: 'دفترچه عمومی آزمون',
              questionCount: blueprint.totalQuestions,
              weight: 1,
              chapterIds: [],
            },
          ];

    for (const sec of sectionsToFill) {
      const targetCount = Math.max(1, Number(sec.questionCount) || 5);
      const chapterSet = new Set((sec.chapterIds || []).map((c) => c.trim()));

      // Filter unused questions strictly matching section's chapters
      const matchingPool = allQuestions.filter(
        (q) => !usedQuestionIds.has(q.id) && (chapterSet.size === 0 || chapterSet.has(q.chapterId))
      );

      const pickedForSection: BankQuestion[] = [];

      // Step 1: If section specifies difficultyMix, pick according to target difficulty distribution first
      if (sec.difficultyMix) {
        const diffLevels: Array<'easy' | 'medium' | 'hard'> = ['easy', 'medium', 'hard'];
        for (const diff of diffLevels) {
          const quota = Number(sec.difficultyMix[diff]) || 0;
          if (quota <= 0) continue;
          const matchingByDiff = matchingPool
            .filter((q) => q.difficulty === diff && !usedQuestionIds.has(q.id))
            .sort(() => 0.5 - Math.random());
          for (const q of matchingByDiff) {
            const countOfThisDiff = pickedForSection.filter((p) => p.difficulty === diff).length;
            if (countOfThisDiff >= quota) break;
            if (pickedForSection.length >= targetCount) break;
            pickedForSection.push(q);
            usedQuestionIds.add(q.id);
          }
        }
      }

      // Step 2: If section still needs questions, draw only from remaining unused questions in matching chapters
      if (pickedForSection.length < targetCount) {
        const remainingMatching = matchingPool
          .filter((q) => !usedQuestionIds.has(q.id))
          .sort(() => 0.5 - Math.random());
        for (const q of remainingMatching) {
          if (pickedForSection.length >= targetCount) break;
          pickedForSection.push(q);
          usedQuestionIds.add(q.id);
        }
      }

      // Enforce strict section capacity: NEVER draw from foreign chapters or general bank
      if (pickedForSection.length < targetCount) {
        return {
          ok: false,
          status: 503,
          error: `تعداد سوالات کافی در بانک اختصاصی آزمون برای بخش «${sec.title}» موجود نیست (مورد نیاز: ${targetCount}، موجود: ${pickedForSection.length}).`,
        };
      }

      for (const q of pickedForSection) {
        if (chapterSet.size > 0 && !chapterSet.has(q.chapterId)) {
          return {
            ok: false,
            status: 500,
            error: `خطای یکپارچگی انتخاب سوال: سوال ${q.id} خارج از فصول مجاز بخش «${sec.title}» است.`,
          };
        }
        selectedQuestionsWithSection.push({
          question: q,
          sectionId: sec.id,
          sectionTitle: sec.title,
        });
      }
    }

    // Ensure total questions exactly matches declared blueprint.totalQuestions
    if (selectedQuestionsWithSection.length !== blueprint.totalQuestions) {
      return {
        ok: false,
        status: 500,
        error: `خطای یکپارچگی آزمون: مجموع سوالات بخش‌ها (${selectedQuestionsWithSection.length}) با کل سوالات شناسنامه (${blueprint.totalQuestions}) همخوانی ندارد.`,
      };
    }

    const finalSelection = selectedQuestionsWithSection;
    const questionIds = finalSelection.map((item) => item.question.id);

    // Verify duplicate question prevention invariant
    if (new Set(questionIds).size !== questionIds.length) {
      return {
        ok: false,
        status: 500,
        error: 'خطای یکپارچگی آزمون: سوال تکراری در این تلاش یافت شد.',
      };
    }

    const attemptId = `ex_att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const nowMs = Date.now();
    const startedAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + blueprint.durationMinutes * 60 * 1000).toISOString();

    const insertAttemptStmt = this.db
      .prepare(
        `INSERT INTO exam_attempts (
          id, user_id, blueprint_id, status, started_at, expires_at,
          duration_seconds_used, question_ids_json, correct_count, wrong_count,
          unanswered_count, section_breakdown_json, xp_awarded, idempotency_key,
          created_at, updated_at
        ) VALUES (?, ?, ?, 'in_progress', ?, ?, 0, ?, 0, 0, ?, '[]', 0, ?, ?, ?)`
      )
      .bind(
        attemptId,
        cleanUserId,
        blueprint.id,
        startedAt,
        expiresAt,
        JSON.stringify(questionIds),
        questionIds.length,
        cleanIdempotencyKey,
        startedAt,
        startedAt
      );

    const insertAnswerStmts = finalSelection.map((item) =>
      this.db
        .prepare(
          `INSERT INTO exam_attempt_answers (
            attempt_id, question_id, section_id, selected_index, is_flagged,
            time_spent_seconds, is_correct, revision, updated_at
          ) VALUES (?, ?, ?, NULL, 0, 0, NULL, 0, ?)`
        )
        .bind(attemptId, item.question.id, item.sectionId, startedAt)
    );

    try {
      if (typeof this.db.batch === 'function') {
        await this.db.batch([insertAttemptStmt, ...insertAnswerStmts]);
      } else {
        await insertAttemptStmt.run();
        for (const s of insertAnswerStmts) {
          await s.run();
        }
      }
    } catch (batchErr: any) {
      if (
        cleanIdempotencyKey &&
        (String(batchErr?.message || '').includes('UNIQUE') ||
          String(batchErr?.message || '').includes('idx_exam_attempts_idempotency'))
      ) {
        const existingRow = await this.db
          .prepare('SELECT * FROM exam_attempts WHERE user_id = ? AND idempotency_key = ? LIMIT 1')
          .bind(cleanUserId, cleanIdempotencyKey)
          .first<ExamAttemptDbRow>();
        if (existingRow) {
          if (existingRow.status === 'in_progress') {
            const loaded = await this.getAttemptForUser(existingRow.id, cleanUserId);
            if (loaded.ok && loaded.mode === 'active') {
              return { ok: true, status: 200, data: loaded.data };
            }
          } else {
            return {
              ok: false,
              status: 409,
              error: 'این تلاش آزمون قبلاً ثبت نهایی یا منقضی شده است. لطفاً با شناسه درخواست جدید اقدام فرمایید.',
            };
          }
        }
      }
      throw batchErr;
    }

    // Initialize answer records in exam_attempt_answers
    const answersMap: Record<string, ExamAttemptAnswerRecord> = {};
    for (const item of finalSelection) {
      answersMap[item.question.id] = {
        attemptId,
        questionId: item.question.id,
        sectionId: item.sectionId,
        selectedIndex: null,
        isFlagged: false,
        timeSpentSeconds: 0,
        isCorrect: null,
        revision: 0,
        updatedAt: startedAt,
      };
    }

    const publicQuestions: ExamAttemptQuestionPublic[] = finalSelection.map((item, idx) => ({
      id: item.question.id,
      questionNumber: idx + 1,
      sectionId: item.sectionId,
      sectionTitle: item.sectionTitle,
      chapterId: item.question.chapterId,
      chapterTitle: item.question.chapterTitle,
      difficulty: item.question.difficulty,
      question: item.question.question,
      options: item.question.options,
    }));

    const attemptRecord: ExamAttemptRecord = {
      id: attemptId,
      userId: cleanUserId,
      blueprintId: blueprint.id,
      status: 'in_progress',
      startedAt,
      expiresAt,
      submittedAt: null,
      durationSecondsUsed: 0,
      questionIds,
      rawScorePercent: null,
      weightedScorePercent: null,
      correctCount: 0,
      wrongCount: 0,
      unansweredCount: questionIds.length,
      sectionBreakdown: [],
      xpAwarded: 0,
      idempotencyKey: cleanIdempotencyKey,
      createdAt: startedAt,
      updatedAt: startedAt,
    };

    return {
      ok: true,
      status: 201,
      data: {
        attempt: attemptRecord,
        blueprint,
        questions: publicQuestions,
        answers: answersMap,
        remainingSeconds: blueprint.durationMinutes * 60,
      },
    };
  }

  /**
   * Load an exam attempt for a specific user.
   * - Enforces ownership (returns 403 Forbidden if owned by another user).
   * - If status === 'in_progress', returns active payload WITHOUT correctIndex or explanation.
   * - If status === 'submitted' | 'expired', returns review payload WITH correctIndex and explanation.
   */
  async getAttemptForUser(
    attemptId: string,
    requestingUserId: string
  ): Promise<
    | { ok: true; status: 200; mode: 'active'; data: ActiveExamAttemptPayload }
    | { ok: true; status: 200; mode: 'submitted'; data: SubmittedExamAttemptPayload }
    | { ok: false; status: number; error: string }
  > {
    if (!attemptId || typeof attemptId !== 'string' || !attemptId.trim()) {
      return { ok: false, status: 400, error: 'شناسه تلاش آزمون نامعتبر است.' };
    }
    if (!requestingUserId || typeof requestingUserId !== 'string' || !requestingUserId.trim()) {
      return { ok: false, status: 401, error: 'Unauthorized' };
    }

    await this.ensureTablesAndSeeded();

    const row = await this.db
      .prepare('SELECT * FROM exam_attempts WHERE id = ? LIMIT 1')
      .bind(attemptId.trim())
      .first<ExamAttemptDbRow>();

    if (!row) {
      return { ok: false, status: 404, error: 'آزمون مورد نظر یافت نشد.' };
    }

    if (row.user_id !== requestingUserId.trim()) {
      return {
        ok: false,
        status: 403,
        error: 'Forbidden: شما مجاز به مشاهده یا تغییر آزمون کاربر دیگر نیستید.',
      };
    }

    const attempt = rowToExamAttemptRecord(row);
    const blueprint =
      (await this.getBlueprintByIdOrSlug(attempt.blueprintId)) || DEFAULT_EXAM_BLUEPRINTS[0];

    const answerRowsRes = await this.db
      .prepare('SELECT * FROM exam_attempt_answers WHERE attempt_id = ?')
      .bind(attempt.id)
      .all<ExamAttemptAnswerDbRow>();
    const answerRows = (answerRowsRes.results || []).map(rowToExamAttemptAnswerRecord);
    const answersMap: Record<string, ExamAttemptAnswerRecord> = {};
    for (const a of answerRows) {
      answersMap[a.questionId] = a;
    }

    // Load questions in the exact order stored in attempt.questionIds from dedicated exam_question_bank
    const allQRes = await this.db
      .prepare('SELECT * FROM exam_question_bank')
      .all<QuestionDbRow>();
    const questionById = new Map<string, BankQuestion>();
    for (const qRow of allQRes.results || []) {
      const bq = rowToBankQuestion(qRow);
      questionById.set(bq.id, bq);
    }

    const sectionTitleById = new Map<string, string>();
    for (const sec of blueprint.sections || []) {
      sectionTitleById.set(sec.id, sec.title);
    }

    if (attempt.status === 'in_progress') {
      const publicQuestions: ExamAttemptQuestionPublic[] = [];
      attempt.questionIds.forEach((qid, idx) => {
        const bq = questionById.get(qid);
        if (!bq) return;
        const ans = answersMap[qid];
        const secId = ans?.sectionId || blueprint.sections[0]?.id || 'general';
        const secTitle = sectionTitleById.get(secId) || 'دفترچه عمومی آزمون';
        publicQuestions.push({
          id: bq.id,
          questionNumber: idx + 1,
          sectionId: secId,
          sectionTitle: secTitle,
          chapterId: bq.chapterId,
          chapterTitle: bq.chapterTitle,
          difficulty: bq.difficulty,
          question: bq.question,
          options: bq.options,
        });
      });

      const remainingSeconds = Math.max(
        0,
        Math.floor((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000)
      );

      return {
        ok: true,
        status: 200,
        mode: 'active',
        data: {
          attempt,
          blueprint,
          questions: publicQuestions,
          answers: answersMap,
          remainingSeconds,
        },
      };
    }

    // Submitted or expired attempt -> include full review fields (correctIndex & explanation)
    const reviewQuestions: ExamAttemptQuestionReview[] = [];
    attempt.questionIds.forEach((qid, idx) => {
      const bq = questionById.get(qid);
      if (!bq) return;
      const ans = answersMap[qid];
      const secId = ans?.sectionId || blueprint.sections[0]?.id || 'general';
      const secTitle = sectionTitleById.get(secId) || 'دفترچه عمومی آزمون';
      reviewQuestions.push({
        id: bq.id,
        questionNumber: idx + 1,
        sectionId: secId,
        sectionTitle: secTitle,
        chapterId: bq.chapterId,
        chapterTitle: bq.chapterTitle,
        difficulty: bq.difficulty,
        question: bq.question,
        options: bq.options,
        correctIndex: bq.correctIndex,
        explanation: bq.explanation,
        selectedIndex: ans ? ans.selectedIndex : null,
        isCorrect: ans ? ans.isCorrect : null,
        isFlagged: ans ? ans.isFlagged : false,
        timeSpentSeconds: ans ? ans.timeSpentSeconds : 0,
      });
    });

    return {
      ok: true,
      status: 200,
      mode: 'submitted',
      data: {
        attempt,
        blueprint,
        questions: reviewQuestions,
        answers: answersMap,
        alreadySubmitted: true,
        xpAwarded: attempt.xpAwarded,
      },
    };
  }

  /**
   * Save or clear a user's selected answer and/or review flag for a question in an active attempt.
   */
  async saveAnswer(params: {
    attemptId: string;
    userId: string;
    questionId: string;
    selectedIndex?: number | null;
    isFlagged?: boolean;
    timeSpentSeconds?: number;
    clientUpdatedAt?: string;
  }): Promise<
    | { ok: true; status: 200; answer: ExamAttemptAnswerRecord; remainingSeconds: number }
    | { ok: false; status: number; code?: string; error: string }
  > {
    const cleanAttemptId = typeof params.attemptId === 'string' ? params.attemptId.trim() : '';
    const cleanUserId = typeof params.userId === 'string' ? params.userId.trim() : '';
    const cleanQuestionId = typeof params.questionId === 'string' ? params.questionId.trim() : '';

    if (!cleanUserId) {
      return { ok: false, status: 401, error: 'Unauthorized' };
    }
    if (!cleanAttemptId || !cleanQuestionId) {
      return { ok: false, status: 400, error: 'شناسه آزمون و شناسه سوال الزامی است.' };
    }

    await this.ensureTablesAndSeeded();

    const row = await this.db
      .prepare('SELECT * FROM exam_attempts WHERE id = ? LIMIT 1')
      .bind(cleanAttemptId)
      .first<ExamAttemptDbRow>();

    if (!row) {
      return { ok: false, status: 404, error: 'آزمون مورد نظر یافت نشد.' };
    }

    if (row.user_id !== cleanUserId) {
      return {
        ok: false,
        status: 403,
        error: 'Forbidden: شما مجاز به ثبت پاسخ برای آزمون کاربر دیگر نیستید.',
      };
    }

    if (row.status !== 'in_progress') {
      return {
        ok: false,
        status: 409,
        code: 'ATTEMPT_ALREADY_FINALIZED',
        error: 'این آزمون قبلاً ثبت نهایی شده و امکان تغییر پاسخ‌ها وجود ندارد.',
      };
    }

    const expiresMs = new Date(row.expires_at).getTime();
    const nowMs = Date.now();
    if (nowMs > expiresMs) {
      return {
        ok: false,
        status: 409,
        code: 'EXAM_TIME_EXPIRED',
        error: 'زمان قانونی آزمون به پایان رسیده است. لطفاً آزمون را ثبت نهایی کنید.',
      };
    }

    const attempt = rowToExamAttemptRecord(row);
    if (!attempt.questionIds.includes(cleanQuestionId)) {
      return {
        ok: false,
        status: 400,
        error: 'سوال ارسال‌شده متعلق به این آزمون نیست.',
      };
    }

    // Validate selectedIndex: must be undefined, null, or integer 0..3
    if (params.selectedIndex !== undefined && params.selectedIndex !== null) {
      if (
        typeof params.selectedIndex !== 'number' ||
        !Number.isInteger(params.selectedIndex) ||
        params.selectedIndex < 0 ||
        params.selectedIndex > 3
      ) {
        return {
          ok: false,
          status: 400,
          error: 'گزینه انتخاب‌شده نامعتبر است (باید عددی بین ۰ تا ۳ یا خالی باشد).',
        };
      }
    }

    const existingAnsRow = await this.db
      .prepare(
        'SELECT * FROM exam_attempt_answers WHERE attempt_id = ? AND question_id = ? LIMIT 1'
      )
      .bind(cleanAttemptId, cleanQuestionId)
      .first<ExamAttemptAnswerDbRow>();

    const nowIso = new Date(nowMs).toISOString();

    // Prevent stale or out-of-order updates from overwriting newer persisted choices
    if (existingAnsRow && params.clientUpdatedAt) {
      const incomingTs = Date.parse(params.clientUpdatedAt);
      const existingTs = Date.parse(existingAnsRow.updated_at);
      if (Number.isFinite(incomingTs) && Number.isFinite(existingTs) && incomingTs < existingTs) {
        const remainingSeconds = Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
        return {
          ok: true,
          status: 200,
          answer: rowToExamAttemptAnswerRecord(existingAnsRow),
          remainingSeconds,
        };
      }
    }

    const currentAns = existingAnsRow
      ? rowToExamAttemptAnswerRecord(existingAnsRow)
      : {
          attemptId: cleanAttemptId,
          questionId: cleanQuestionId,
          sectionId: 'general',
          selectedIndex: null,
          isFlagged: false,
          timeSpentSeconds: 0,
          isCorrect: null,
          revision: 0,
          updatedAt: nowIso,
        };

    const nextSelectedIndex =
      params.selectedIndex !== undefined ? params.selectedIndex : currentAns.selectedIndex;
    const nextIsFlagged =
      typeof params.isFlagged === 'boolean' ? params.isFlagged : currentAns.isFlagged;
    const nextTimeSpent =
      typeof params.timeSpentSeconds === 'number' &&
      Number.isFinite(params.timeSpentSeconds) &&
      params.timeSpentSeconds >= 0
        ? Math.min(7200, Math.round(params.timeSpentSeconds))
        : currentAns.timeSpentSeconds;

    const incomingTs = params.clientUpdatedAt ? Date.parse(params.clientUpdatedAt) : NaN;
    // Guard against future timestamps (> 10s skew) poisoning the record's updated_at
    const effectiveUpdatedAt =
      Number.isFinite(incomingTs)
        ? incomingTs > nowMs + 10000
          ? nowIso
          : params.clientUpdatedAt!
        : nowIso;

    const nextRevision = (existingAnsRow?.revision ? Number(existingAnsRow.revision) : 0) + 1;

    await this.db
      .prepare(
        `INSERT INTO exam_attempt_answers (
          attempt_id, question_id, section_id, selected_index, is_flagged,
          time_spent_seconds, is_correct, revision, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
        ON CONFLICT(attempt_id, question_id) DO UPDATE SET
          selected_index = excluded.selected_index,
          is_flagged = excluded.is_flagged,
          time_spent_seconds = excluded.time_spent_seconds,
          revision = excluded.revision,
          updated_at = excluded.updated_at`
      )
      .bind(
        cleanAttemptId,
        cleanQuestionId,
        currentAns.sectionId,
        nextSelectedIndex,
        nextIsFlagged ? 1 : 0,
        nextTimeSpent,
        nextRevision,
        effectiveUpdatedAt
      )
      .run();

    await this.db
      .prepare('UPDATE exam_attempts SET updated_at = ? WHERE id = ?')
      .bind(nowIso, cleanAttemptId)
      .run();

    const updatedAnswer: ExamAttemptAnswerRecord = {
      attemptId: cleanAttemptId,
      questionId: cleanQuestionId,
      sectionId: currentAns.sectionId,
      selectedIndex: nextSelectedIndex,
      isFlagged: nextIsFlagged,
      timeSpentSeconds: nextTimeSpent,
      isCorrect: null,
      revision: nextRevision,
      updatedAt: effectiveUpdatedAt,
    };

    const remainingSeconds = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));

    return {
      ok: true,
      status: 200,
      answer: updatedAnswer,
      remainingSeconds,
    };
  }

  /**
   * Finalize and grade an exam attempt idempotently.
   * - Calculates Konkoor raw score (with or without negative marking) and section-weighted score.
   * - Awards server-verified XP once per attempt via D1UserRepository.awardXp.
   * - Reveals correctIndex and explanation ONLY in the post-submission response.
   */
  async submitAttempt(params: {
    attemptId: string;
    userId: string;
    answers?: Array<{
      questionId: string;
      selectedIndex?: number | null;
      isFlagged?: boolean;
      timeSpentSeconds?: number;
    }>;
    durationSecondsUsed?: number;
  }): Promise<
    | { ok: true; status: 200; data: SubmittedExamAttemptPayload }
    | { ok: false; status: number; error: string }
  > {
    const cleanAttemptId = typeof params.attemptId === 'string' ? params.attemptId.trim() : '';
    const cleanUserId = typeof params.userId === 'string' ? params.userId.trim() : '';

    if (!cleanUserId) {
      return { ok: false, status: 401, error: 'Unauthorized' };
    }
    if (!cleanAttemptId) {
      return { ok: false, status: 400, error: 'شناسه آزمون الزامی است.' };
    }

    await this.ensureTablesAndSeeded();

    const row = await this.db
      .prepare('SELECT * FROM exam_attempts WHERE id = ? LIMIT 1')
      .bind(cleanAttemptId)
      .first<ExamAttemptDbRow>();

    if (!row) {
      return { ok: false, status: 404, error: 'آزمون مورد نظر یافت نشد.' };
    }

    if (row.user_id !== cleanUserId) {
      return {
        ok: false,
        status: 403,
        error: 'Forbidden: شما مجاز به ثبت نهایی آزمون کاربر دیگر نیستید.',
      };
    }

    // Idempotent return if already submitted or expired
    if (row.status === 'submitted' || row.status === 'expired') {
      const existingLoaded = await this.getAttemptForUser(cleanAttemptId, cleanUserId);
      if (existingLoaded.ok && existingLoaded.mode === 'submitted') {
        return {
          ok: true,
          status: 200,
          data: {
            ...existingLoaded.data,
            alreadySubmitted: true,
          },
        };
      }
    }

    const attempt = rowToExamAttemptRecord(row);
    const blueprint =
      (await this.getBlueprintByIdOrSlug(attempt.blueprintId)) || DEFAULT_EXAM_BLUEPRINTS[0];
    const validQuestionIds = new Set(attempt.questionIds);

    const nowMs = Date.now();
    const expiresMs = new Date(row.expires_at).getTime();
    const isPastDeadline = Number.isFinite(expiresMs) && nowMs > expiresMs;
    const finalStatus: 'submitted' | 'expired' = isPastDeadline ? 'expired' : 'submitted';

    // Enforce deadline: Only apply final answer updates if submitted BEFORE or AT the deadline
    if (!isPastDeadline && Array.isArray(params.answers)) {
      const nowIso = new Date(nowMs).toISOString();
      for (const item of params.answers) {
        if (!item || typeof item.questionId !== 'string') continue;
        const qid = item.questionId.trim();
        if (!validQuestionIds.has(qid)) continue;

        const sel =
          item.selectedIndex === null || item.selectedIndex === undefined
            ? null
            : typeof item.selectedIndex === 'number' &&
              Number.isInteger(item.selectedIndex) &&
              item.selectedIndex >= 0 &&
              item.selectedIndex <= 3
            ? item.selectedIndex
            : undefined;

        if (sel === undefined) continue;

        const flagged = typeof item.isFlagged === 'boolean' ? (item.isFlagged ? 1 : 0) : null;
        const timeSpent =
          typeof item.timeSpentSeconds === 'number' &&
          Number.isFinite(item.timeSpentSeconds) &&
          item.timeSpentSeconds >= 0
            ? Math.min(7200, Math.round(item.timeSpentSeconds))
            : null;

        await this.db
          .prepare(
            `UPDATE exam_attempt_answers
             SET
               selected_index = ?,
               is_flagged = COALESCE(?, is_flagged),
               time_spent_seconds = COALESCE(?, time_spent_seconds),
               updated_at = ?
             WHERE attempt_id = ? AND question_id = ?`
          )
          .bind(sel, flagged, timeSpent, nowIso, cleanAttemptId, qid)
          .run();
      }
    }

    // Load all saved answers for this attempt
    const answerRowsRes = await this.db
      .prepare('SELECT * FROM exam_attempt_answers WHERE attempt_id = ?')
      .bind(cleanAttemptId)
      .all<ExamAttemptAnswerDbRow>();
    const answerRows = (answerRowsRes.results || []).map(rowToExamAttemptAnswerRecord);
    const answersByQuestionId = new Map<string, ExamAttemptAnswerRecord>();
    for (const a of answerRows) {
      answersByQuestionId.set(a.questionId, a);
    }

    // Load authoritative questions from dedicated exam_question_bank
    const allQRes = await this.db
      .prepare('SELECT * FROM exam_question_bank')
      .all<QuestionDbRow>();
    const questionById = new Map<string, BankQuestion>();
    for (const qRow of allQRes.results || []) {
      const bq = rowToBankQuestion(qRow);
      questionById.set(bq.id, bq);
    }

    const orderedQuestionsForScoring: Array<{
      id: string;
      sectionId: string;
      chapterId: string;
      correctIndex: number;
      bankQuestion: BankQuestion;
    }> = [];

    for (const qid of attempt.questionIds) {
      const bq = questionById.get(qid);
      if (!bq) continue;
      const savedAns = answersByQuestionId.get(qid);
      const secId = savedAns?.sectionId || blueprint.sections[0]?.id || 'general';
      orderedQuestionsForScoring.push({
        id: bq.id,
        sectionId: secId,
        chapterId: bq.chapterId,
        correctIndex: bq.correctIndex,
        bankQuestion: bq,
      });
    }

    const scoreResult = calculateExamScoreAndBreakdown({
      blueprint,
      questions: orderedQuestionsForScoring,
      answersByQuestionId,
      totalQuestionsDenominator: attempt.questionIds.length || blueprint.totalQuestions,
    });

    // Anti-farming: only award XP on the first rewarded completion per blueprint per user
    let xpToAward = scoreResult.xpToAward;
    if (xpToAward > 0) {
      const priorRewardedRow = await this.db
        .prepare(
          `SELECT COUNT(*) as cnt FROM exam_attempts
           WHERE user_id = ? AND blueprint_id = ? AND id != ?
             AND status IN ('submitted', 'expired') AND xp_awarded > 0`
        )
        .bind(cleanUserId, attempt.blueprintId, cleanAttemptId)
        .first<{ cnt: number }>();

      if (Number(priorRewardedRow?.cnt || 0) > 0) {
        xpToAward = 0;
      }
    }

    const submittedAt = new Date(nowMs).toISOString();
    const startedMs = new Date(attempt.startedAt).getTime();
    const maxDurationSec = blueprint.durationMinutes * 60;
    const effectiveEndMs = isPastDeadline && Number.isFinite(expiresMs) ? expiresMs : nowMs;
    const elapsedSec = Math.max(
      1,
      Math.min(maxDurationSec, Math.round((effectiveEndMs - startedMs) / 1000))
    );
    const durationSecondsUsed =
      !isPastDeadline &&
      typeof params.durationSecondsUsed === 'number' &&
      Number.isFinite(params.durationSecondsUsed) &&
      params.durationSecondsUsed > 0
        ? Math.min(maxDurationSec, Math.round(params.durationSecondsUsed))
        : elapsedSec;

    // Award server-owned XP idempotently if user exists in users table BEFORE marking attempt finalized
    let xpAwarded = 0;
    let updatedProfile: SyncedUserProfile | null = null;
    if (xpToAward > 0) {
      const userRepo = new D1UserRepository(this.db);
      const existingUser = await userRepo.getUserById(cleanUserId);
      if (existingUser) {
        try {
          const awardRes = await userRepo.awardXp({
            userId: cleanUserId,
            idempotencyKey: `exam_completion:${attempt.id}`,
            amount: xpToAward,
            reason: 'exam_completion',
          });
          xpAwarded = xpToAward;
          updatedProfile = awardRes.profile;
        } catch (err) {
          console.error('Exam XP award error:', err);
          return {
            ok: false,
            status: 500,
            error:
              'خطا در ثبت امتیاز (XP) آزمون در دفتر کل. وضعیت آزمون باز باقی ماند تا مجدداً تلاش کنید.',
          };
        }
      }
    }

    // Atomically update each answer's is_correct status, question times_answered, and attempt status
    const finalizationBatch = [
      ...orderedQuestionsForScoring.map((qItem) => {
        const isCorr = scoreResult.perQuestionCorrectness.get(qItem.id);
        const isCorrInt = isCorr === true ? 1 : isCorr === false ? 0 : null;
        return this.db
          .prepare(
            `UPDATE exam_attempt_answers
             SET is_correct = ?, updated_at = ?
             WHERE attempt_id = ? AND question_id = ?`
          )
          .bind(isCorrInt, submittedAt, cleanAttemptId, qItem.id);
      }),
      ...orderedQuestionsForScoring
        .filter((qItem) => {
          const isCorr = scoreResult.perQuestionCorrectness.get(qItem.id);
          return isCorr !== null && isCorr !== undefined;
        })
        .map((qItem) =>
          this.db
            .prepare('UPDATE exam_question_bank SET times_answered = times_answered + 1 WHERE id = ?')
            .bind(qItem.id)
        ),
      this.db
        .prepare(
          `UPDATE exam_attempts
           SET
             status = ?,
             submitted_at = ?,
             duration_seconds_used = ?,
             raw_score_percent = ?,
             weighted_score_percent = ?,
             correct_count = ?,
             wrong_count = ?,
             unanswered_count = ?,
             section_breakdown_json = ?,
             xp_awarded = ?,
             updated_at = ?
           WHERE id = ?`
        )
        .bind(
          finalStatus,
          submittedAt,
          durationSecondsUsed,
          scoreResult.rawScorePercent,
          scoreResult.weightedScorePercent,
          scoreResult.correctCount,
          scoreResult.wrongCount,
          scoreResult.unansweredCount,
          JSON.stringify(scoreResult.sectionBreakdown),
          xpAwarded,
          submittedAt,
          cleanAttemptId
        ),
    ];

    if (typeof this.db.batch === 'function') {
      await this.db.batch(finalizationBatch);
    } else {
      for (const stmt of finalizationBatch) {
        await stmt.run();
      }
    }

    const finalizedLoaded = await this.getAttemptForUser(cleanAttemptId, cleanUserId);
    if (finalizedLoaded.ok && finalizedLoaded.mode === 'submitted') {
      return {
        ok: true,
        status: 200,
        data: {
          ...finalizedLoaded.data,
          alreadySubmitted: false,
          xpAwarded,
          updatedProfile,
        },
      };
    }

    return { ok: false, status: 500, error: 'خطا در بازیابی کارنامه نهایی آزمون.' };
  }

  /**
   * Retrieve a user's exam attempt history and aggregated long-term exam performance metrics.
   */
  async getUserExamHistory(userId: string, limit = 20): Promise<UserExamHistorySummary> {
    await this.ensureTablesAndSeeded();
    const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));

    const blueprints = await this.listBlueprints();
    const bpMap = new Map<string, ExamBlueprint>();
    for (const bp of blueprints) {
      bpMap.set(bp.id, bp);
    }

    const rowsRes = await this.db
      .prepare(
        'SELECT * FROM exam_attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
      )
      .bind(cleanUserId, safeLimit)
      .all<ExamAttemptDbRow>();

    const rawAttempts = (rowsRes.results || []).map(rowToExamAttemptRecord);
    const enrichedAttempts = rawAttempts.map((att) => {
      const bp = bpMap.get(att.blueprintId);
      return {
        ...att,
        blueprintTitle: bp?.title || 'آزمون شبیه‌ساز روان‌شناسی',
        blueprintSlug: bp?.slug || att.blueprintId,
        examType: bp?.examType || ('comprehensive' as const),
        negativeMarking: bp ? bp.negativeMarking : true,
        negativeWeight: bp ? bp.negativeWeight : 0.3333,
        totalQuestions: att.questionIds.length || bp?.totalQuestions || 10,
      };
    });

    const submittedAttempts = enrichedAttempts.filter(
      (a) => a.status === 'submitted' || a.status === 'expired'
    );
    const inProgressCount = enrichedAttempts.filter((a) => a.status === 'in_progress').length;

    let sumRaw = 0;
    let sumWeighted = 0;
    let bestRaw = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalAnswered = 0;

    const sectionStatsMap = new Map<
      string,
      { title: string; sumPercent: number; count: number }
    >();

    for (const att of submittedAttempts) {
      const raw = att.rawScorePercent ?? 0;
      const weighted = att.weightedScorePercent ?? raw;
      sumRaw += raw;
      sumWeighted += weighted;
      if (raw > bestRaw || submittedAttempts.indexOf(att) === 0) {
        bestRaw = Math.max(bestRaw, raw);
      }
      totalCorrect += att.correctCount;
      totalWrong += att.wrongCount;
      totalAnswered += att.correctCount + att.wrongCount;

      for (const sec of att.sectionBreakdown || []) {
        const prev = sectionStatsMap.get(sec.sectionId) || {
          title: sec.sectionTitle,
          sumPercent: 0,
          count: 0,
        };
        prev.sumPercent += sec.rawScorePercent;
        prev.count += 1;
        sectionStatsMap.set(sec.sectionId, prev);
      }
    }

    const totalCompletedExams = submittedAttempts.length;
    const averageRawScorePercent =
      totalCompletedExams > 0 ? Math.round((sumRaw / totalCompletedExams) * 10) / 10 : 0;
    const averageWeightedScorePercent =
      totalCompletedExams > 0 ? Math.round((sumWeighted / totalCompletedExams) * 10) / 10 : 0;

    let strongestSectionTitle: string | null = null;
    let weakestSectionTitle: string | null = null;
    let maxSecAvg = -Infinity;
    let minSecAvg = Infinity;

    for (const secStat of sectionStatsMap.values()) {
      if (secStat.count === 0) continue;
      const avg = secStat.sumPercent / secStat.count;
      if (avg > maxSecAvg) {
        maxSecAvg = avg;
        strongestSectionTitle = secStat.title;
      }
      if (avg < minSecAvg) {
        minSecAvg = avg;
        weakestSectionTitle = secStat.title;
      }
    }

    // Calculate trend between latest exam and previous exam
    let recentTrendDelta = 0;
    if (submittedAttempts.length >= 2) {
      const latest = submittedAttempts[0].rawScorePercent ?? 0;
      const previous = submittedAttempts[1].rawScorePercent ?? 0;
      recentTrendDelta = Math.round((latest - previous) * 10) / 10;
    }

    return {
      attempts: enrichedAttempts,
      stats: {
        totalCompletedExams,
        inProgressCount,
        averageRawScorePercent,
        averageWeightedScorePercent,
        bestRawScorePercent: totalCompletedExams > 0 ? Math.round(bestRaw * 10) / 10 : 0,
        totalExamQuestionsAnswered: totalAnswered,
        totalCorrectAnswers: totalCorrect,
        totalWrongAnswers: totalWrong,
        strongestSectionTitle,
        weakestSectionTitle,
        recentTrendDelta,
      },
    };
  }
}
