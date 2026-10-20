/**
 * Entrance Exam Simulator Client Service
 * Project: PsychoMaster (روان‌لینگو) - Phase 10B
 *
 * Manages communication with /api/exams/* endpoints, automatic guest/account session
 * bootstrapping, local storage resilience for active attempts, and offline fallback.
 */

import type {
  ExamAttemptAnswerRecord,
  ExamAttemptQuestionPublic,
  ExamAttemptQuestionReview,
  ExamAttemptRecord,
  ExamBlueprint,
} from '../worker/db/schema.ts';
import type {
  ActiveExamAttemptPayload,
  SubmittedExamAttemptPayload,
  UserExamHistorySummary,
} from '../worker/db/examRepository.ts';
import { DEFAULT_EXAM_BLUEPRINTS } from '../data/examBlueprintsData.ts';
import {
  getGuestSessionToken,
  getOrCreateUserId,
  syncProgressToCloud,
} from '../utils/cloudSync.ts';
import { loadUserProgress } from '../utils/storage.ts';

export type {
  ExamBlueprint,
  ExamAttemptRecord,
  ExamAttemptAnswerRecord,
  ExamAttemptQuestionPublic,
  ExamAttemptQuestionReview,
  ActiveExamAttemptPayload,
  SubmittedExamAttemptPayload,
  UserExamHistorySummary,
};

const ACTIVE_ATTEMPT_CACHE_PREFIX = 'psychomaster_exam_active_session_';
const ATTEMPT_ANSWERS_BACKUP_PREFIX = 'psychomaster_exam_answers_backup_';
const LOCAL_EXAM_HISTORY_KEY = 'psychomaster_exam_local_history_v1';

export interface StartExamRequest {
  blueprintId: string;
  forceNew?: boolean;
}

export interface SaveExamAnswerRequest {
  attemptId: string;
  questionId: string;
  selectedIndex: number | null;
  isFlagged?: boolean;
  timeSpentSeconds?: number;
  clientUpdatedAt?: string;
}

export interface SubmitExamRequest {
  attemptId: string;
  answers?: Array<{
    questionId: string;
    selectedIndex: number | null;
    isFlagged?: boolean;
    timeSpentSeconds?: number;
  }>;
  durationSecondsUsed?: number;
}

function buildExamRequestHeaders(extra?: Record<string, string>): Record<string, string> {
  const guestToken = getGuestSessionToken();
  return {
    'Content-Type': 'application/json',
    ...(guestToken
      ? {
          'X-Guest-Token': guestToken,
          'X-Guest-Session-Token': guestToken,
        }
      : {}),
    ...(extra || {}),
  };
}

/**
 * Ensures the current user (Google or Guest) has an active backend session cookie / token
 * before invoking authenticated exam endpoints.
 */
async function ensureAuthenticatedExamSession(): Promise<void> {
  try {
    const userId = getOrCreateUserId();
    const progress = loadUserProgress(userId);
    await syncProgressToCloud(progress, { skipPendingStageReplay: true });
  } catch {
    // Ignore network failures; caller will handle errors
  }
}

async function fetchWithSessionRetry(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let res = await fetch(url, {
    ...options,
    headers: buildExamRequestHeaders(options.headers as Record<string, string>),
    credentials: 'include',
  });

  if (res.status === 401) {
    await ensureAuthenticatedExamSession();
    res = await fetch(url, {
      ...options,
      headers: buildExamRequestHeaders(options.headers as Record<string, string>),
      credentials: 'include',
    });
  }

  return res;
}

/**
 * Estimate Konkoor scaled score (تراز تخمینی کنکور out of 10,000) from weighted/raw percentage.
 */
export function estimateKonkoorScaledScore(percent: number | null | undefined): number {
  const p = Number(percent) || 0;
  return Math.max(2000, Math.min(9800, Math.round(4500 + p * 48)));
}

/**
 * Saves local backup of answers for an active attempt to prevent data loss on refresh/offline.
 */
export function saveLocalAttemptBackup(
  attemptId: string,
  answers: Record<string, ExamAttemptAnswerRecord>
): void {
  try {
    localStorage.setItem(
      `${ATTEMPT_ANSWERS_BACKUP_PREFIX}${attemptId}`,
      JSON.stringify({
        updatedAt: new Date().toISOString(),
        answers,
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function loadLocalAttemptBackup(
  attemptId: string
): Record<string, ExamAttemptAnswerRecord> | null {
  try {
    const raw = localStorage.getItem(`${ATTEMPT_ANSWERS_BACKUP_PREFIX}${attemptId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.answers === 'object') {
      return parsed.answers as Record<string, ExamAttemptAnswerRecord>;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearLocalAttemptBackup(attemptId: string): void {
  try {
    localStorage.removeItem(`${ATTEMPT_ANSWERS_BACKUP_PREFIX}${attemptId}`);
  } catch {
    // Ignore
  }
}

export function saveLocalSessionSnapshot(session: ActiveExamAttemptPayload): void {
  try {
    localStorage.setItem(
      `${ACTIVE_ATTEMPT_CACHE_PREFIX}${session.attempt.blueprintId}`,
      JSON.stringify(session)
    );
  } catch {
    // Ignore
  }
}

export function loadLocalSessionSnapshot(blueprintId: string): ActiveExamAttemptPayload | null {
  try {
    const raw = localStorage.getItem(`${ACTIVE_ATTEMPT_CACHE_PREFIX}${blueprintId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveExamAttemptPayload;
    if (parsed && parsed.attempt && parsed.attempt.status === 'in_progress') {
      const expiresMs = Date.parse(parsed.attempt.expiresAt);
      if (Number.isFinite(expiresMs) && expiresMs > Date.now()) {
        return parsed;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function clearLocalSessionSnapshot(blueprintId: string): void {
  try {
    localStorage.removeItem(`${ACTIVE_ATTEMPT_CACHE_PREFIX}${blueprintId}`);
  } catch {
    // Ignore
  }
}

function saveReviewToLocalHistory(review: SubmittedExamAttemptPayload): void {
  try {
    const raw = localStorage.getItem(LOCAL_EXAM_HISTORY_KEY);
    const list: SubmittedExamAttemptPayload[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((item) => item.attempt.id !== review.attempt.id);
    filtered.unshift(review);
    localStorage.setItem(LOCAL_EXAM_HISTORY_KEY, JSON.stringify(filtered.slice(0, 25)));
  } catch {
    // Ignore
  }
}

export function getLocalReviewById(attemptId: string): SubmittedExamAttemptPayload | null {
  try {
    const raw = localStorage.getItem(LOCAL_EXAM_HISTORY_KEY);
    if (!raw) return null;
    const list: SubmittedExamAttemptPayload[] = JSON.parse(raw);
    return list.find((item) => item.attempt.id === attemptId) ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetches available entrance exam blueprints from backend (or falls back to DEFAULT_EXAM_BLUEPRINTS).
 */
export async function fetchExamBlueprints(): Promise<ExamBlueprint[]> {
  try {
    const res = await fetch('/api/exams/blueprints', {
      method: 'GET',
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.blueprints) && data.blueprints.length > 0) {
        return data.blueprints as ExamBlueprint[];
      }
    }
  } catch {
    // Offline fallback for metadata catalog
  }
  return DEFAULT_EXAM_BLUEPRINTS;
}

/**
 * Merges server-authoritative answers with local attempt backup using monotonic revision
 * conflict resolution:
 * - Higher revision wins.
 * - If revisions are equal, server confirmed answer wins, unless server choice is empty
 *   (null) and local backup has an unpersisted selection.
 * - Stale local backup (lower revision) never overwrites newer server answer.
 */
export function mergeServerAndLocalAnswers(
  serverAnswers: Record<string, ExamAttemptAnswerRecord> | undefined | null,
  localBackup: Record<string, ExamAttemptAnswerRecord> | undefined | null
): Record<string, ExamAttemptAnswerRecord> {
  const server = serverAnswers || {};
  if (!localBackup || Object.keys(localBackup).length === 0) {
    return { ...server };
  }

  const merged: Record<string, ExamAttemptAnswerRecord> = { ...server };
  for (const [qid, localAns] of Object.entries(localBackup)) {
    if (!localAns || typeof localAns !== 'object') continue;
    const serverAns = server[qid];
    if (!serverAns) {
      merged[qid] = localAns;
      continue;
    }

    const localRev = typeof localAns.revision === 'number' ? localAns.revision : 0;
    const serverRev = typeof serverAns.revision === 'number' ? serverAns.revision : 0;

    if (localRev > serverRev) {
      // Local has a newer revision (e.g. made offline/unsynchronized)
      merged[qid] = localAns;
    } else if (localRev === serverRev) {
      // Equal revisions: prefer server confirmed answer, unless server is unselected and local has a choice
      if (
        (serverAns.selectedIndex === null || serverAns.selectedIndex === undefined) &&
        localAns.selectedIndex !== null &&
        localAns.selectedIndex !== undefined
      ) {
        merged[qid] = localAns;
      } else {
        merged[qid] = serverAns;
      }
    } else {
      // localRev < serverRev: stale local backup discarded
      merged[qid] = serverAns;
    }
  }

  return merged;
}

/**
 * Starts a new exam attempt or resumes an existing active in-progress attempt from the server.
 * Never fabricates questions or answer keys on the client.
 */
export async function startOrResumeExamAttempt(
  req: StartExamRequest
): Promise<ActiveExamAttemptPayload> {
  if (!getGuestSessionToken()) {
    await ensureAuthenticatedExamSession();
  }
  const userId = getOrCreateUserId();

  // If resuming (!forceNew) and we have an active local snapshot, try fetching it from server first
  if (!req.forceNew) {
    const cachedSnap = loadLocalSessionSnapshot(req.blueprintId);
    if (cachedSnap?.attempt?.id) {
      try {
        const getRes = await fetchWithSessionRetry(
          `/api/exams/attempts/${encodeURIComponent(cachedSnap.attempt.id)}`,
          { method: 'GET' }
        );
        if (getRes.ok) {
          const data = await getRes.json();
          if (data && data.mode === 'active' && data.attempt) {
            const activePayload: ActiveExamAttemptPayload = {
              attempt: data.attempt,
              blueprint: data.blueprint,
              questions: data.questions,
              answers: mergeServerAndLocalAnswers(
                data.answers,
                loadLocalAttemptBackup(data.attempt.id)
              ),
              remainingSeconds: data.remainingSeconds,
            };
            saveLocalSessionSnapshot(activePayload);
            return activePayload;
          }
        }
      } catch {
        // Fall through
      }
    }
  }

  const idempotencyKey = `start_${userId}_${req.blueprintId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  let serverErrorMessage: string | null = null;
  try {
    const res = await fetchWithSessionRetry('/api/exams/attempts/start', {
      method: 'POST',
      body: JSON.stringify({
        userId,
        blueprintId: req.blueprintId,
        idempotencyKey,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const session: ActiveExamAttemptPayload = {
        attempt: data.attempt,
        blueprint: data.blueprint,
        questions: data.questions,
        answers: mergeServerAndLocalAnswers(
          data.answers,
          loadLocalAttemptBackup(data.attempt.id)
        ),
        remainingSeconds: data.remainingSeconds,
      };
      saveLocalSessionSnapshot(session);
      return session;
    } else {
      try {
        const errData = await res.json();
        if (errData && typeof errData.error === 'string') {
          serverErrorMessage = errData.error;
        }
      } catch {
        // Ignore parse error
      }
    }
  } catch {
    // Check if a previously server-issued active snapshot can be resumed
  }

  if (!req.forceNew) {
    const cached = loadLocalSessionSnapshot(req.blueprintId);
    if (cached && cached.attempt?.id && !cached.attempt.id.startsWith('att_local_')) {
      const localBackup = loadLocalAttemptBackup(cached.attempt.id);
      if (localBackup) {
        cached.answers = { ...cached.answers, ...localBackup };
      }
      return cached;
    }
  }

  throw new Error(
    serverErrorMessage ||
      'خطا در برقراری ارتباط با سرور آزمون برای دریافت دفترچه سوالات. لطفاً اتصال خود را بررسی کرده و مجدداً تلاش کنید.'
  );
}

/**
 * Saves an answer or flag change to the backend (and updates local backup first).
 */
export async function saveExamAttemptAnswer(
  req: SaveExamAnswerRequest
): Promise<{ ok: boolean; remainingSeconds?: number; code?: string; error?: string }> {
  try {
    const res = await fetchWithSessionRetry(
      `/api/exams/attempts/${encodeURIComponent(req.attemptId)}/answer`,
      {
        method: 'PUT',
        body: JSON.stringify({
          questionId: req.questionId,
          selectedIndex: req.selectedIndex,
          isFlagged: req.isFlagged,
          timeSpentSeconds: req.timeSpentSeconds,
          clientUpdatedAt: req.clientUpdatedAt || new Date().toISOString(),
        }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      return { ok: true, remainingSeconds: data.remainingSeconds };
    }
    const errData = await res.json().catch(() => ({}));
    return {
      ok: false,
      code: typeof errData?.code === 'string' ? errData.code : undefined,
      error: typeof errData?.error === 'string' ? errData.error : undefined,
    };
  } catch {
    // Local backup already holds the answer until connection restores
  }
  return { ok: false };
}

/**
 * Submits the exam attempt for authoritative server-side Konkoor scoring,
 * deadline verification, XP ledger recording, and post-exam explanation review.
 * Never falls back to client-side grading or unverified XP awards.
 */
export async function submitExamAttempt(
  req: SubmitExamRequest,
  _fallbackSession?: ActiveExamAttemptPayload
): Promise<SubmittedExamAttemptPayload> {
  let serverError: string | null = null;

  try {
    const res = await fetchWithSessionRetry(
      `/api/exams/attempts/${encodeURIComponent(req.attemptId)}/submit`,
      {
        method: 'POST',
        body: JSON.stringify({
          answers: req.answers,
          durationSecondsUsed: req.durationSecondsUsed,
        }),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const reviewPayload: SubmittedExamAttemptPayload = {
        attempt: data.attempt,
        blueprint: data.blueprint,
        questions: data.questions,
        answers: data.answers || {},
        alreadySubmitted: Boolean(data.alreadySubmitted),
        xpAwarded: Number(data.xpAwarded) || 0,
        updatedProfile: data.updatedProfile ?? null,
      };
      if (reviewPayload.attempt?.blueprintId) {
        clearLocalSessionSnapshot(reviewPayload.attempt.blueprintId);
      }
      clearLocalAttemptBackup(req.attemptId);
      saveReviewToLocalHistory(reviewPayload);
      return reviewPayload;
    }

    try {
      const errJson = await res.json();
      if (errJson && typeof errJson.error === 'string' && errJson.error.trim()) {
        serverError = errJson.error.trim();
      }
    } catch {
      // Ignore JSON parse error
    }
  } catch {
    // Network error handled below by throwing while keeping local answer backup intact
  }

  throw new Error(
    serverError ||
      'خطا در ثبت نهایی آزمون در سرور؛ پاسخ‌های شما در حافظه محلی محفوظ است. لطفاً اتصال اینترنت را بررسی کرده و مجدداً دکمه ثبت نهایی را بزنید.'
  );
}

/**
 * Fetches full post-exam review payload for a completed attempt.
 */
export async function fetchExamAttemptReview(
  attemptId: string
): Promise<SubmittedExamAttemptPayload | null> {
  try {
    const res = await fetchWithSessionRetry(
      `/api/exams/attempts/${encodeURIComponent(attemptId)}`,
      {
        method: 'GET',
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (data && data.mode === 'submitted') {
        const reviewPayload: SubmittedExamAttemptPayload = {
          attempt: data.attempt,
          blueprint: data.blueprint,
          questions: data.questions,
          answers: data.answers || {},
          alreadySubmitted: true,
          xpAwarded: Number(data.xpAwarded ?? data.attempt?.xpAwarded) || 0,
        };
        saveReviewToLocalHistory(reviewPayload);
        return reviewPayload;
      }
    }
  } catch {
    // Fallback to local history
  }
  return getLocalReviewById(attemptId);
}

/**
 * Fetches the user's exam attempt history and aggregate analytics.
 */
export async function fetchUserExamHistory(): Promise<UserExamHistorySummary> {
  if (!getGuestSessionToken()) {
    await ensureAuthenticatedExamSession();
  }
  try {
    const res = await fetchWithSessionRetry('/api/exams/history', {
      method: 'GET',
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.attempts) && data.stats) {
        return {
          attempts: data.attempts,
          stats: data.stats,
        };
      }
    }
  } catch {
    // Offline fallback below
  }

  try {
    const raw = localStorage.getItem(LOCAL_EXAM_HISTORY_KEY);
    const localReviews: SubmittedExamAttemptPayload[] = raw ? JSON.parse(raw) : [];
    const attempts = localReviews.map((r) => ({
      ...r.attempt,
      blueprintTitle: r.blueprint.title,
      blueprintSlug: r.blueprint.slug,
      examType: r.blueprint.examType,
      negativeMarking: r.blueprint.negativeMarking,
      negativeWeight: r.blueprint.negativeWeight,
      totalQuestions: r.blueprint.totalQuestions,
    }));

    const completed = attempts.filter((a) => a.status !== 'in_progress');
    if (completed.length === 0) {
      return {
        attempts,
        stats: {
          totalCompletedExams: 0,
          inProgressCount: attempts.length,
          averageRawScorePercent: 0,
          averageWeightedScorePercent: 0,
          bestRawScorePercent: 0,
          totalExamQuestionsAnswered: 0,
          totalCorrectAnswers: 0,
          totalWrongAnswers: 0,
          strongestSectionTitle: null,
          weakestSectionTitle: null,
          recentTrendDelta: 0,
        },
      };
    }

    const avgRaw =
      Math.round(
        (completed.reduce((s, a) => s + (a.rawScorePercent ?? 0), 0) / completed.length) * 10
      ) / 10;
    const avgWeighted =
      Math.round(
        (completed.reduce((s, a) => s + (a.weightedScorePercent ?? 0), 0) / completed.length) * 10
      ) / 10;
    const bestRaw = Math.max(...completed.map((a) => a.rawScorePercent ?? 0));

    return {
      attempts,
      stats: {
        totalCompletedExams: completed.length,
        inProgressCount: attempts.length - completed.length,
        averageRawScorePercent: avgRaw,
        averageWeightedScorePercent: avgWeighted,
        bestRawScorePercent: bestRaw,
        totalExamQuestionsAnswered: completed.reduce(
          (s, a) => s + a.correctCount + a.wrongCount,
          0
        ),
        totalCorrectAnswers: completed.reduce((s, a) => s + a.correctCount, 0),
        totalWrongAnswers: completed.reduce((s, a) => s + a.wrongCount, 0),
        strongestSectionTitle: null,
        weakestSectionTitle: null,
        recentTrendDelta: 0,
      },
    };
  } catch {
    return {
      attempts: [],
      stats: {
        totalCompletedExams: 0,
        inProgressCount: 0,
        averageRawScorePercent: 0,
        averageWeightedScorePercent: 0,
        bestRawScorePercent: 0,
        totalExamQuestionsAnswered: 0,
        totalCorrectAnswers: 0,
        totalWrongAnswers: 0,
        strongestSectionTitle: null,
        weakestSectionTitle: null,
        recentTrendDelta: 0,
      },
    };
  }
}
