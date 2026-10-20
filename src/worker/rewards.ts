/**
 * Authoritative Server-Side Curriculum Reward Catalog & Verification Engine
 * Project: PsychoMaster (روان‌لینگو) - Phase 6C XP Integrity & Anti-Abuse
 *
 * Ensures that:
 * 1. Clients can NEVER choose arbitrary XP amounts, reward types, event IDs, or idempotency keys.
 * 2. Every reward submission must correspond to a verifiable curriculum event:
 *    - `stage_completion`: Stages 1..100 in Section 1, enforcing sequential stage prerequisites
 *      (stage N > 1 requires stage N - 1 to have been completed in `xp_ledger`) and awarding
 *      strictly the canonical `stage.xpReward` (15, 35, 50, or 100 XP) with canonical server
 *      idempotency key `stage_completion:stage_${stageNumber}`.
 *    - `quiz_answer` (or `quiz_completion`): Curriculum questions in `CHAPTER_QUESTIONS_RECORD`
 *      or `SECTION_1_STAGES`, verifying the submitted `userAnswer` against the authoritative
 *      question definition and awarding strictly `question.points` (10 or 15 XP) once per question
 *      with canonical server idempotency key `quiz_answer:${chapterId}:${questionId}`.
 * 3. Progress fields (`completedStages`, `completedChapters`, `totalStudyMinutes`, `streakDays`)
 *    are sanitized and bounded so client sync or guest merge cannot inject fabricated stage XP
 *    or out-of-bounds progress values.
 */

import type { DuolingoStage, Question, StageCompletionRecord } from '../types/psychology.ts';
import { SECTION_1_STAGES } from '../data/section1Stages.ts';
import { CHAPTER_QUESTIONS_RECORD } from '../data/curriculumQuestionsBank.ts';

export type VerifiedRewardType = 'stage_completion' | 'quiz_answer';

export const ALLOWED_REWARD_REASONS = new Set<string>([
  'stage_completion',
  'stage_passed',
  'quiz_answer',
  'quiz_completion',
  'exam_completion',
  'daily_streak',
  'badge_unlock',
]);

// Build authoritative lookup maps once at module load
const STAGE_BY_NUMBER = new Map<number, DuolingoStage>();
for (const stage of SECTION_1_STAGES) {
  STAGE_BY_NUMBER.set(stage.stageNumber, stage);
}

const QUESTION_BY_CHAPTER_AND_ID = new Map<string, Question>();
const QUESTION_BY_ID = new Map<string, { chapterId: string; question: Question }>();

for (const [chapterId, questions] of Object.entries(CHAPTER_QUESTIONS_RECORD)) {
  for (const q of questions) {
    QUESTION_BY_CHAPTER_AND_ID.set(`${chapterId}:${q.id}`, q);
    if (!QUESTION_BY_ID.has(q.id)) {
      QUESTION_BY_ID.set(q.id, { chapterId, question: q });
    }
  }
}

for (const stage of SECTION_1_STAGES) {
  for (const q of stage.questions) {
    const key = `${stage.chapterId}:${q.id}`;
    if (!QUESTION_BY_CHAPTER_AND_ID.has(key)) {
      QUESTION_BY_CHAPTER_AND_ID.set(key, q);
    }
    if (!QUESTION_BY_ID.has(q.id)) {
      QUESTION_BY_ID.set(q.id, { chapterId: stage.chapterId, question: q });
    }
  }
}

export const VALID_USER_ID_REGEX = /^[a-zA-Z0-9_-]{3,64}$/;
export const MAX_TOTAL_STUDY_MINUTES = 100_000;
export const MAX_SINGLE_SYNC_MINUTES_DELTA = 600;
export const MAX_STREAK_DAYS = 3650;

export function isValidUserIdFormat(userId: string): boolean {
  if (!userId || typeof userId !== 'string') return false;
  return VALID_USER_ID_REGEX.test(userId.trim());
}

export function getAuthoritativeStage(stageNumber: number): DuolingoStage | null {
  if (!Number.isInteger(stageNumber) || stageNumber < 1 || stageNumber > 100) {
    return null;
  }
  return STAGE_BY_NUMBER.get(stageNumber) || null;
}

export function getCanonicalStageReward(stageNumber: number): number | null {
  const stage = getAuthoritativeStage(stageNumber);
  return stage ? stage.xpReward : null;
}

export function getCanonicalStageIdempotencyKey(stageNumber: number): string {
  return `stage_completion:stage_${stageNumber}`;
}

export function getCanonicalQuizIdempotencyKey(chapterId: string, questionId: string): string {
  return `quiz_answer:${chapterId.trim()}:${questionId.trim()}`;
}

export function parseCompletedStageNumberFromKey(idempotencyKey: string | null | undefined): number | null {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') return null;
  const match = /^stage_completion:stage_(\d+)$/.exec(idempotencyKey.trim());
  if (!match) return null;
  const stageNum = Number(match[1]);
  if (!Number.isInteger(stageNum) || stageNum < 1 || stageNum > 100) return null;
  return stageNum;
}

function normalizePersianText(str: string): string {
  return String(str || '')
    .replace(/[\u200C\u200B\s]/g, '')
    .replace(/[یي]/g, 'ی')
    .replace(/[کك]/g, 'ک')
    .replace(/[ةه]/g, 'ه')
    .replace(/[.,،؛:!؟?"'«»()[\]]/g, '')
    .trim()
    .toLowerCase();
}

export function evaluateCurriculumQuestionAnswer(question: Question, userAnswer: unknown): boolean {
  if (userAnswer === undefined || userAnswer === null) return false;

  if (question.type === 'multiple_choice' || question.type === 'case_study') {
    return (
      typeof userAnswer === 'number' &&
      Number.isInteger(userAnswer) &&
      userAnswer === question.correctAnswer
    );
  }

  if (question.type === 'true_false') {
    const expected =
      typeof question.isTrue === 'boolean'
        ? question.isTrue
        : typeof question.correctAnswer === 'boolean'
        ? question.correctAnswer
        : question.correctAnswer === 0 || question.correctAnswer === '0'
        ? true
        : question.correctAnswer === 1 || question.correctAnswer === '1'
        ? false
        : String(question.correctAnswer).toLowerCase() === 'true';
    return typeof userAnswer === 'boolean' && userAnswer === expected;
  }

  if (question.type === 'fill_blank') {
    if (typeof userAnswer !== 'string' || !userAnswer.trim()) return false;
    const correctWord = normalizePersianText(String(question.correctAnswer));
    const userInput = normalizePersianText(userAnswer);
    if (!correctWord || !userInput) return false;
    return (
      userInput === correctWord ||
      userInput.includes(correctWord) ||
      correctWord.includes(userInput)
    );
  }

  if (question.type === 'sentence_order') {
    const assembled = Array.isArray(userAnswer)
      ? userAnswer.map(String).join(' ')
      : typeof userAnswer === 'string'
      ? userAnswer
      : '';
    const target = String(question.correctAnswer || question.correctSentence || '');
    if (!assembled.trim() || !target.trim()) return false;
    return normalizePersianText(assembled) === normalizePersianText(target);
  }

  if (question.type === 'match_pairs') {
    const expectedPairs = question.matchPairs || [];
    if (expectedPairs.length === 0) return false;
    if (userAnswer === 'matched_all') return true;
    if (!Array.isArray(userAnswer)) return false;
    const expectedIds = new Set(expectedPairs.map((p) => p.id));
    if (userAnswer.length !== expectedIds.size) return false;
    return userAnswer.every((id) => typeof id === 'string' && expectedIds.has(id));
  }

  return false;
}

export interface VerifiedRewardResult {
  ok: true;
  rewardType: VerifiedRewardType;
  reason: string;
  amount: number;
  idempotencyKey: string;
  stageNumber?: number;
  stageRecord?: StageCompletionRecord;
  chapterId?: string;
  questionId?: string;
}

export interface RejectedRewardResult {
  ok: false;
  status: number;
  error: string;
}

export const MIN_STAGE_PASSING_RATIO = 0.6;

/**
 * Helper to construct a deterministic map of canonical correct answers for a stage's questions.
 */
export function buildCanonicalStageAnswers(stageNumber: number): Record<string, unknown> | null {
  const stage = getAuthoritativeStage(stageNumber);
  if (!stage) return null;

  const answers: Record<string, unknown> = {};
  for (const q of stage.questions) {
    if (q.type === 'multiple_choice' || q.type === 'case_study') {
      answers[q.id] = q.correctAnswer;
    } else if (q.type === 'true_false') {
      const expected =
        typeof q.isTrue === 'boolean'
          ? q.isTrue
          : typeof q.correctAnswer === 'boolean'
          ? q.correctAnswer
          : q.correctAnswer === 0 || q.correctAnswer === '0'
          ? true
          : q.correctAnswer === 1 || q.correctAnswer === '1'
          ? false
          : String(q.correctAnswer).toLowerCase() === 'true';
      answers[q.id] = expected;
    } else if (q.type === 'fill_blank') {
      answers[q.id] = String(q.correctAnswer);
    } else if (q.type === 'sentence_order') {
      answers[q.id] = String(q.correctAnswer || q.correctSentence || '');
    } else if (q.type === 'match_pairs') {
      answers[q.id] = (q.matchPairs || []).map((p) => p.id);
    }
  }
  return answers;
}

export function verifyRewardSubmission(
  body: Record<string, unknown>,
  context: {
    verifiedCompletedStages: Set<number>;
  }
): VerifiedRewardResult | RejectedRewardResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'Invalid request body' };
  }

  // If caller explicitly passed idempotencyKey as empty/whitespace, reject immediately
  if (
    body.idempotencyKey !== undefined &&
    (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.trim() === '')
  ) {
    return { ok: false, status: 400, error: 'idempotencyKey must be a non-empty string' };
  }

  const rawRewardType =
    typeof body.rewardType === 'string' && body.rewardType.trim()
      ? body.rewardType.trim()
      : typeof body.reason === 'string' && body.reason.trim()
      ? body.reason.trim()
      : '';

  let resolvedType: VerifiedRewardType | null = null;
  if (rawRewardType === 'stage_completion') {
    resolvedType = 'stage_completion';
  } else if (rawRewardType === 'quiz_answer' || rawRewardType === 'quiz_completion') {
    resolvedType = 'quiz_answer';
  } else if (rawRewardType === '' && body.stageNumber !== undefined) {
    resolvedType = 'stage_completion';
  } else if (rawRewardType === '' && body.questionId !== undefined) {
    resolvedType = 'quiz_answer';
  }

  if (!resolvedType) {
    return {
      ok: false,
      status: 400,
      error:
        'Unverified XP submission rejected: a valid curriculum rewardType (stage_completion or quiz_answer) and event identifier are required',
    };
  }

  if (resolvedType === 'stage_completion') {
    const stageNumber = Number(body.stageNumber);
    const stage = getAuthoritativeStage(stageNumber);
    if (!stage) {
      return {
        ok: false,
        status: 400,
        error: 'Invalid stageNumber: must be an integer between 1 and 100',
      };
    }

    // Sequential curriculum prerequisite enforcement against verified server ledger
    if (stageNumber > 1 && !context.verifiedCompletedStages.has(stageNumber - 1)) {
      return {
        ok: false,
        status: 400,
        error: `Prerequisite stage ${stageNumber - 1} must be completed before claiming reward for stage ${stageNumber}`,
      };
    }

    // Extract and validate stageAnswers against authoritative stage questions
    const rawAnswers = body.stageAnswers ?? body.answers;
    if (
      !rawAnswers ||
      typeof rawAnswers !== 'object' ||
      Array.isArray(rawAnswers)
    ) {
      return {
        ok: false,
        status: 400,
        error:
          'Stage completion verification failed: stageAnswers object mapping every stage questionId to the submitted answer is required',
      };
    }

    const answerMap = rawAnswers as Record<string, unknown>;
    const authoritativeQuestions = stage.questions;
    const authoritativeTotalQuestions = authoritativeQuestions.length;

    let verifiedScore = 0;
    for (const q of authoritativeQuestions) {
      if (!(q.id in answerMap) || answerMap[q.id] === undefined || answerMap[q.id] === null) {
        return {
          ok: false,
          status: 400,
          error: `Stage completion verification failed: missing submitted answer for stage question '${q.id}'`,
        };
      }
      if (evaluateCurriculumQuestionAnswer(q, answerMap[q.id])) {
        verifiedScore += 1;
      }
    }

    const minPassingScore = Math.ceil(authoritativeTotalQuestions * MIN_STAGE_PASSING_RATIO);
    if (verifiedScore < minPassingScore) {
      return {
        ok: false,
        status: 400,
        error: `Stage completion verification failed: verified score ${verifiedScore}/${authoritativeTotalQuestions} is below the minimum passing threshold (${minPassingScore}/${authoritativeTotalQuestions})`,
      };
    }

    const verifiedMistakes = authoritativeTotalQuestions - verifiedScore;
    const verifiedStars = verifiedMistakes === 0 ? 3 : verifiedMistakes <= 2 ? 2 : 1;

    if (body.totalQuestions !== undefined) {
      const clientTotal = Number(body.totalQuestions);
      if (!Number.isInteger(clientTotal) || clientTotal !== authoritativeTotalQuestions) {
        return {
          ok: false,
          status: 400,
          error: `Invalid totalQuestions: stage ${stageNumber} has ${authoritativeTotalQuestions} questions, not ${String(body.totalQuestions)}`,
        };
      }
    }

    if (body.score !== undefined) {
      const clientScore = Number(body.score);
      if (!Number.isInteger(clientScore) || clientScore < 0 || clientScore > authoritativeTotalQuestions) {
        return {
          ok: false,
          status: 400,
          error: 'Invalid score for stage completion',
        };
      }
    }

    if (body.stars !== undefined) {
      const clientStars = Number(body.stars);
      if (!Number.isInteger(clientStars) || clientStars < 1 || clientStars > 3) {
        return {
          ok: false,
          status: 400,
          error: 'Invalid stars for stage completion: must be 1, 2, or 3',
        };
      }
    }

    const canonicalAmount = stage.xpReward;

    // Reject client attempts to override or inflate the stage's canonical XP reward
    if (body.xpEarned !== undefined && Number(body.xpEarned) !== canonicalAmount) {
      return {
        ok: false,
        status: 400,
        error: `Invalid xpEarned: stage ${stageNumber} awards ${canonicalAmount} XP, not ${String(body.xpEarned)}`,
      };
    }
    if (body.amount !== undefined && Number(body.amount) !== canonicalAmount) {
      return {
        ok: false,
        status: 400,
        error: `Invalid amount: stage ${stageNumber} awards ${canonicalAmount} XP`,
      };
    }

    const canonicalKey = getCanonicalStageIdempotencyKey(stageNumber);

    const stageRecord: StageCompletionRecord = {
      stageNumber,
      completedAt: new Date().toISOString(),
      stars: verifiedStars,
      score: verifiedScore,
      totalQuestions: authoritativeTotalQuestions,
      xpEarned: canonicalAmount,
      verified: true,
      source: 'online-verified',
    };

    return {
      ok: true,
      rewardType: 'stage_completion',
      reason: 'stage_completion',
      amount: canonicalAmount,
      idempotencyKey: canonicalKey,
      stageNumber,
      stageRecord,
    };
  }

  // resolvedType === 'quiz_answer'
  const rawQuestionId = typeof body.questionId === 'string' ? body.questionId.trim() : '';
  if (!rawQuestionId) {
    return {
      ok: false,
      status: 400,
      error: 'questionId is required for quiz_answer reward',
    };
  }

  const rawChapterId = typeof body.chapterId === 'string' ? body.chapterId.trim() : '';
  let matchedQuestion: Question | undefined;
  let resolvedChapterId = rawChapterId;

  if (rawChapterId) {
    matchedQuestion = QUESTION_BY_CHAPTER_AND_ID.get(`${rawChapterId}:${rawQuestionId}`);
  }
  if (!matchedQuestion) {
    const fallback = QUESTION_BY_ID.get(rawQuestionId);
    if (fallback && (!rawChapterId || rawChapterId === fallback.chapterId)) {
      matchedQuestion = fallback.question;
      resolvedChapterId = fallback.chapterId;
    }
  }

  if (!matchedQuestion || !resolvedChapterId) {
    return {
      ok: false,
      status: 400,
      error: 'Unknown chapterId or questionId: not found in curriculum question bank',
    };
  }

  if (body.isCorrect === false) {
    return {
      ok: false,
      status: 400,
      error: 'Incorrect quiz answer does not qualify for XP',
    };
  }

  if (!evaluateCurriculumQuestionAnswer(matchedQuestion, body.userAnswer)) {
    return {
      ok: false,
      status: 400,
      error: 'Quiz answer verification failed: submitted userAnswer is missing or incorrect',
    };
  }

  const canonicalAmount =
    typeof matchedQuestion.points === 'number' &&
    Number.isInteger(matchedQuestion.points) &&
    matchedQuestion.points > 0
      ? matchedQuestion.points
      : 10;

  if (body.xpEarned !== undefined && Number(body.xpEarned) !== canonicalAmount) {
    return {
      ok: false,
      status: 400,
      error: `Invalid xpEarned: question ${rawQuestionId} awards ${canonicalAmount} XP, not ${String(body.xpEarned)}`,
    };
  }
  if (body.amount !== undefined && Number(body.amount) !== canonicalAmount) {
    return {
      ok: false,
      status: 400,
      error: `Invalid amount: question ${rawQuestionId} awards ${canonicalAmount} XP`,
    };
  }

  const canonicalKey = getCanonicalQuizIdempotencyKey(resolvedChapterId, rawQuestionId);

  return {
    ok: true,
    rewardType: 'quiz_answer',
    reason: 'quiz_answer',
    amount: canonicalAmount,
    idempotencyKey: canonicalKey,
    chapterId: resolvedChapterId,
    questionId: rawQuestionId,
  };
}

/**
 * Sanitize and merge completedStages so client sync / guest merge can never inject
 * out-of-range stage numbers, non-sequential stage unlocks, or inflated xpEarned values.
 *
 * Also enforces Phase 6G Task 2 separation between:
 * - `online-verified` stages (backed by `xp_ledger` or `awardXp`, whose server-verified
 *   `score` and `stars` cannot be overwritten by unverified client `/api/user/sync` payloads).
 * - `offline-local` stages (recorded locally for PWA continuity, marked `verified: false`,
 *   `source: 'offline-local'`, and never treated as verified online rewards).
 */
export function sanitizeCompletedStages(
  existingStages: Record<string, any> | undefined,
  incomingStages: Record<string, any> | undefined,
  options?: {
    verifiedStageNumbers?: Set<number>;
    markIncomingVerified?: boolean;
  }
): Record<string, StageCompletionRecord> {
  const existingMap: Record<number, any> = {};
  const combinedRaw: Record<number, any> = {};
  const verifiedSet = options?.verifiedStageNumbers;
  const markIncomingVerified = Boolean(options?.markIncomingVerified);

  if (existingStages && typeof existingStages === 'object' && !Array.isArray(existingStages)) {
    for (const [key, val] of Object.entries(existingStages)) {
      const num = Number(key);
      if (Number.isInteger(num) && num >= 1 && num <= 100 && val && typeof val === 'object') {
        existingMap[num] = val;
        combinedRaw[num] = val;
      }
    }
  }

  if (incomingStages && typeof incomingStages === 'object' && !Array.isArray(incomingStages)) {
    for (const [key, val] of Object.entries(incomingStages)) {
      const num = Number(key);
      if (Number.isInteger(num) && num >= 1 && num <= 100 && val && typeof val === 'object') {
        const prev = existingMap[num];
        const prevIsVerified = Boolean(
          prev && (prev.verified === true || prev.source === 'online-verified' || verifiedSet?.has(num))
        );
        if (prevIsVerified && !markIncomingVerified) {
          // Preserve server-verified score, stars, and timestamps against unverified client sync overwrites
          combinedRaw[num] = {
            ...val,
            ...prev,
            verified: true,
            source: 'online-verified',
          };
        } else {
          combinedRaw[num] = {
            ...(prev || {}),
            ...val,
            verified: markIncomingVerified ? true : Boolean(verifiedSet?.has(num)),
            source:
              markIncomingVerified || verifiedSet?.has(num)
                ? 'online-verified'
                : 'offline-local',
          };
        }
      }
    }
  }

  const sanitized: Record<string, StageCompletionRecord> = {};
  for (let stageNum = 1; stageNum <= 100; stageNum++) {
    const rec = combinedRaw[stageNum];
    if (!rec) {
      // Enforce consecutive sequential stage completion chain
      break;
    }
    const stage = getAuthoritativeStage(stageNum);
    if (!stage) break;

    const totalQuestions = stage.questions.length;
    const rawStars = Number(rec.stars);
    const stars = Number.isInteger(rawStars) && rawStars >= 1 && rawStars <= 3 ? rawStars : 3;
    const rawScore = Number(rec.score);
    const score =
      Number.isInteger(rawScore) && rawScore >= 1 && rawScore <= totalQuestions
        ? rawScore
        : totalQuestions;
    const completedAt =
      typeof rec.completedAt === 'string' && rec.completedAt.trim()
        ? rec.completedAt.trim()
        : new Date().toISOString();

    const isOnlineVerified = Boolean(
      verifiedSet ? verifiedSet.has(stageNum) : (rec.verified === true || rec.source === 'online-verified')
    );

    sanitized[String(stageNum)] = {
      stageNumber: stageNum,
      completedAt,
      stars,
      score,
      totalQuestions,
      xpEarned: stage.xpReward,
      verified: isOnlineVerified,
      source: isOnlineVerified ? 'online-verified' : 'offline-local',
    };
  }

  return sanitized;
}

export function sanitizeStudyMinutes(
  existingMinutes: number | undefined,
  incomingMinutes: unknown
): number {
  const base =
    typeof existingMinutes === 'number' && Number.isFinite(existingMinutes) && existingMinutes >= 0
      ? Math.min(MAX_TOTAL_STUDY_MINUTES, Math.round(existingMinutes))
      : 0;

  if (typeof incomingMinutes !== 'number' || !Number.isFinite(incomingMinutes) || incomingMinutes < 0) {
    return base;
  }

  const roundedIncoming = Math.min(
    MAX_TOTAL_STUDY_MINUTES,
    Math.max(0, Math.round(incomingMinutes))
  );
  const cappedIncoming = Math.min(roundedIncoming, base + MAX_SINGLE_SYNC_MINUTES_DELTA);
  return Math.max(base, cappedIncoming);
}

export function sanitizeStreakDays(
  existingStreak: number | undefined,
  incomingStreak: unknown
): number {
  const base =
    typeof existingStreak === 'number' && Number.isFinite(existingStreak) && existingStreak >= 1
      ? Math.min(MAX_STREAK_DAYS, Math.round(existingStreak))
      : 1;

  if (typeof incomingStreak !== 'number' || !Number.isFinite(incomingStreak) || incomingStreak < 1) {
    return base;
  }

  const roundedIncoming = Math.min(MAX_STREAK_DAYS, Math.max(1, Math.round(incomingStreak)));
  return Math.max(base, roundedIncoming);
}
