import {
  UserProgress,
  SupportTicket,
  StageCompletionRecord,
  DifficultyLevel,
  Section,
  LearningDisciplineId,
  LearningDisciplineDefinition,
} from '../types/psychology';
import { BadgeDefinition } from '../types/badges';
import { CHAPTER_QUESTIONS_RECORD } from '../data/curriculumQuestionsBank';
import { BADGE_DEFINITIONS, findNewlyUnlockedBadges } from '../data/badgeDefinitions';
import { stageExecutionEngine } from '../services/stageExecutionEngine';
import { setSoundEnabled } from './duoAudio';
import type { SyncedUserProfile } from '../worker/db/schema';

const STORAGE_KEY = 'psychomaster_user_progress_v1';
const TICKETS_KEY = 'psychomaster_support_tickets_v1';
export const ACTIVE_DISCIPLINE_STORAGE_KEY = 'psychomaster:active-discipline:v1';
export const DEFAULT_LEARNING_DISCIPLINE_ID: LearningDisciplineId = 'psychology';
export const DEFAULT_DAILY_XP_TARGET = 50;
export const CHAPTER_COMPLETION_XP_REWARD = 20;

const QUESTION_POINTS_BY_ID = new Map<string, number>();
for (const questions of Object.values(CHAPTER_QUESTIONS_RECORD)) {
  for (const q of questions) {
    if (!QUESTION_POINTS_BY_ID.has(q.id)) {
      QUESTION_POINTS_BY_ID.set(q.id, typeof q.points === 'number' && q.points > 0 ? q.points : 10);
    }
  }
}

export function getCanonicalQuestionXp(questionId: string): number {
  return QUESTION_POINTS_BY_ID.get(questionId) ?? 10;
}

/**
 * Computes the canonical XP reward for a completed Pomodoro focus session (1..60 minutes).
 * Matches preset goals (15m -> 20 XP, 25m -> 35 XP, 35m -> 50 XP, 45m -> 65 XP).
 */
export function calculateCanonicalPomodoroXp(minutes: number): number {
  const safeMinutes = Math.trunc(Number(minutes) || 0);
  if (safeMinutes < 1 || safeMinutes > 60) return 0;
  if (safeMinutes === 15) return 20;
  if (safeMinutes === 25) return 35;
  if (safeMinutes === 35) return 50;
  if (safeMinutes === 45) return 65;
  return Math.min(65, Math.max(5, Math.round(safeMinutes * 1.4)));
}

/**
 * Computes the user's authoritative cumulative XP from verified/completed stages,
 * unique standalone quiz correct answers, claimed achievement badges,
 * once-only rewarded textbook chapters, and verified Pomodoro focus sessions.
 */
export function calculateAuthoritativeUserXp(
  progress: UserProgress | null | undefined,
  syncedServerXp?: number
): number {
  if (!progress) return typeof syncedServerXp === 'number' ? Math.max(0, syncedServerXp) : 0;

  // 1. Stage completion XP (each stage counted once via completedStages map)
  const stageXp = Object.values(progress.completedStages || {}).reduce(
    (sum, rec) => sum + (typeof rec?.xpEarned === 'number' && rec.xpEarned > 0 ? rec.xpEarned : 0),
    0
  );

  // 2. Standalone quiz XP (each unique curriculum question counted once)
  const seenCorrectQuestions = new Set<string>();
  let quizXp = 0;
  for (const item of progress.quizHistory || []) {
    if (!item || !item.isCorrect || !item.questionId) continue;
    if (item.questionId.startsWith('stage-') || item.questionId.startsWith('chapter-')) continue;
    const dedupKey = `${item.chapterId || 'ch'}:${item.questionId}`;
    if (seenCorrectQuestions.has(dedupKey)) continue;
    seenCorrectQuestions.add(dedupKey);
    quizXp += getCanonicalQuestionXp(item.questionId);
  }

  // 3. Achievement badge XP (each claimed badge counted once)
  const claimedSet = new Set<string>(progress.claimedBadgeIds || []);
  let badgeXp = 0;
  for (const badgeId of claimedSet) {
    const def = BADGE_DEFINITIONS.find((b) => b.id === badgeId);
    if (def && typeof def.xpReward === 'number' && def.xpReward > 0) {
      badgeXp += def.xpReward;
    }
  }

  // 4. Textbook chapter completion XP (each rewarded chapter counted once)
  const rewardedChaptersSet = new Set<string>(
    (progress.rewardedChapterIds || []).filter(
      (cid): cid is string => typeof cid === 'string' && cid.trim().length > 0
    )
  );
  const chapterXp = rewardedChaptersSet.size * CHAPTER_COMPLETION_XP_REWARD;

  // 5. Pomodoro focus session XP (each unique completed session ID counted once)
  const seenPomodoroIds = new Set<string>();
  let pomodoroXp = 0;
  for (const session of progress.pomodoroHistory || []) {
    if (!session || typeof session.id !== 'string' || !session.id.trim()) continue;
    const cleanId = session.id.trim();
    if (seenPomodoroIds.has(cleanId)) continue;
    seenPomodoroIds.add(cleanId);
    const mins = Math.trunc(Number(session.minutes) || 0);
    if (mins < 1 || mins > 60) continue;
    const sessionXp =
      typeof session.xpEarned === 'number' && session.xpEarned > 0
        ? calculateCanonicalPomodoroXp(mins)
        : calculateCanonicalPomodoroXp(mins);
    pomodoroXp += sessionXp;
  }

  const computedXp = stageXp + quizXp + badgeXp + chapterXp + pomodoroXp;
  const persistedXp = typeof progress.totalXp === 'number' && Number.isFinite(progress.totalXp) ? progress.totalXp : 0;
  const baseXp = Math.max(computedXp, persistedXp);

  if (typeof syncedServerXp === 'number' && Number.isFinite(syncedServerXp)) {
    return Math.max(baseXp, syncedServerXp);
  }
  return baseXp;
}

/**
 * Advances daily XP mission state for any eligible XP-granting event
 * (stage completion, standalone quiz correct answer, textbook chapter completion, Pomodoro session, or badge unlock).
 */
export function recordDailyXpActivity(
  progress: UserProgress,
  xpDelta: number,
  dateStr: string = new Date().toISOString().split('T')[0],
  options?: { xpAlreadyInComputedLedger?: boolean }
): UserProgress {
  const safeDelta = Math.max(0, Math.trunc(Number(xpDelta) || 0));
  const target = progress.dailyTargetXp && progress.dailyTargetXp > 0 ? progress.dailyTargetXp : DEFAULT_DAILY_XP_TARGET;
  const isSameDay = progress.dailyMissionDate === dateStr;
  const prevDailyXp = isSameDay ? Math.max(0, Number(progress.dailyXp) || 0) : 0;
  const prevCompleted = isSameDay ? Boolean(progress.dailyMissionCompleted) : false;

  const nextDailyXp = prevDailyXp + safeDelta;
  const nextCompleted = prevCompleted || nextDailyXp >= target;
  const baseTotalXp = calculateAuthoritativeUserXp(progress);

  return {
    ...progress,
    totalXp: options?.xpAlreadyInComputedLedger ? baseTotalXp : baseTotalXp + safeDelta,
    dailyXp: nextDailyXp,
    dailyTargetXp: target,
    dailyMissionDate: dateStr,
    dailyMissionCompleted: nextCompleted,
  };
}

/**
 * Pure helper to toggle textbook chapter completion in UserProgress.
 * Enforces once-only chapter XP reward idempotency via persistent `rewardedChapterIds`:
 * - Marking a chapter completed for the first time awards +20 XP and advances daily mission.
 * - Unmarking a chapter removes it from `completedChapters` but preserves `rewardedChapterIds`.
 * - Re-marking an already-rewarded chapter awards 0 XP and 0 daily mission progress.
 */
export function applyChapterCompletionToggleToProgress(
  progress: UserProgress,
  chapterId: string,
  dateStr: string = new Date().toISOString().split('T')[0]
): {
  progress: UserProgress;
  isCompleted: boolean;
  xpAwarded: number;
  alreadyRewarded: boolean;
} {
  const cleanChapterId = String(chapterId || '').trim();
  if (!cleanChapterId) {
    return {
      progress,
      isCompleted: false,
      xpAwarded: 0,
      alreadyRewarded: false,
    };
  }

  const existingCompleted = progress.completedChapters || [];
  const existingRewarded = progress.rewardedChapterIds || [];
  const wasCompleted = existingCompleted.includes(cleanChapterId);
  const alreadyRewarded = existingRewarded.includes(cleanChapterId);

  if (wasCompleted) {
    // Unmarking a completed chapter: never removes from rewardedChapterIds and never awards XP
    const nextProgress: UserProgress = {
      ...progress,
      completedChapters: existingCompleted.filter((id) => id !== cleanChapterId),
      rewardedChapterIds: existingRewarded,
    };
    return {
      progress: {
        ...nextProgress,
        totalXp: calculateAuthoritativeUserXp(nextProgress),
      },
      isCompleted: false,
      xpAwarded: 0,
      alreadyRewarded,
    };
  }

  // Marking chapter as completed
  const updatedCompleted = [...existingCompleted, cleanChapterId];
  const updatedRewarded = alreadyRewarded
    ? existingRewarded
    : [...existingRewarded, cleanChapterId];
  const xpAwarded = alreadyRewarded ? 0 : CHAPTER_COMPLETION_XP_REWARD;

  let nextProgress: UserProgress = {
    ...progress,
    completedChapters: updatedCompleted,
    rewardedChapterIds: updatedRewarded,
  };

  if (xpAwarded > 0) {
    nextProgress = recordDailyXpActivity(nextProgress, xpAwarded, dateStr, {
      xpAlreadyInComputedLedger: true,
    });
  } else {
    nextProgress = {
      ...nextProgress,
      totalXp: calculateAuthoritativeUserXp(nextProgress),
    };
  }

  return {
    progress: nextProgress,
    isCompleted: true,
    xpAwarded,
    alreadyRewarded,
  };
}

/**
 * Pure helper to evaluate and apply newly unlocked badges (including multi-pass cascading unlocks)
 * to UserProgress, updating unlockedBadgeIds, claimedBadgeIds, dailyXp, and totalXp idempotently.
 */
export function applyBadgeUnlocksToProgress(
  progress: UserProgress,
  sections: Section[],
  options?: {
    knownUnlockedIds?: string[];
    excludeCategories?: string[];
    dateStr?: string;
  }
): {
  progress: UserProgress;
  newlyUnlockedBadges: BadgeDefinition[];
  badgeXpAwarded: number;
} {
  const knownUnlocked = Array.from(
    new Set([...(options?.knownUnlockedIds || []), ...(progress.unlockedBadgeIds || [])])
  );
  const freshUnlocked = findNewlyUnlockedBadges(knownUnlocked, progress, sections, {
    excludeCategories: options?.excludeCategories,
  });

  if (freshUnlocked.length === 0) {
    const normalized: UserProgress = {
      ...progress,
      unlockedBadgeIds: knownUnlocked,
    };
    return {
      progress: {
        ...normalized,
        totalXp: calculateAuthoritativeUserXp(normalized),
      },
      newlyUnlockedBadges: [],
      badgeXpAwarded: 0,
    };
  }

  const existingClaimed = new Set<string>(progress.claimedBadgeIds || []);
  let badgeXpAwarded = 0;
  for (const badge of freshUnlocked) {
    if (!existingClaimed.has(badge.id)) {
      badgeXpAwarded += badge.xpReward || 0;
      existingClaimed.add(badge.id);
    }
  }

  const allUnlockedIds = Array.from(
    new Set([...knownUnlocked, ...freshUnlocked.map((b) => b.id)])
  );
  const allClaimedIds = Array.from(existingClaimed);

  let nextProgress: UserProgress = {
    ...progress,
    unlockedBadgeIds: allUnlockedIds,
    claimedBadgeIds: allClaimedIds,
  };

  if (badgeXpAwarded > 0) {
    nextProgress = recordDailyXpActivity(nextProgress, badgeXpAwarded, options?.dateStr, {
      xpAlreadyInComputedLedger: true,
    });
  } else {
    nextProgress = {
      ...nextProgress,
      totalXp: calculateAuthoritativeUserXp(nextProgress),
    };
  }

  return {
    progress: nextProgress,
    newlyUnlockedBadges: freshUnlocked,
    badgeXpAwarded,
  };
}

/**
 * Pure helper to record a standalone quiz answer in UserProgress,
 * updating quizHistory, authoritative XP, and daily XP mission progress without duplicating XP on retries.
 */
export function applyStandaloneQuizAnswerToProgress(
  progress: UserProgress,
  params: {
    chapterId: string;
    questionId: string;
    isCorrect: boolean;
    userAnswer: unknown;
    timeSpentSeconds: number;
    difficulty: DifficultyLevel;
    timestamp?: number;
  },
  dateStr: string = new Date().toISOString().split('T')[0]
): { progress: UserProgress; xpAwarded: number; alreadyAnsweredCorrectly: boolean } {
  const existingHistory = progress.quizHistory || [];
  const alreadyAnsweredCorrectly = existingHistory.some(
    (h) =>
      h.isCorrect &&
      h.questionId === params.questionId &&
      (h.chapterId === params.chapterId || !h.chapterId)
  );

  const newHistoryItem = {
    chapterId: params.chapterId,
    questionId: params.questionId,
    isCorrect: params.isCorrect,
    userAnswer: params.userAnswer,
    timestamp: params.timestamp ?? Date.now(),
    timeSpentSeconds: params.timeSpentSeconds,
    difficulty: params.difficulty,
  };

  const updatedCompletedChapters =
    params.isCorrect && !progress.completedChapters.includes(params.chapterId)
      ? [...progress.completedChapters, params.chapterId]
      : progress.completedChapters;

  const xpAwarded =
    params.isCorrect && !alreadyAnsweredCorrectly && !params.questionId.startsWith('stage-')
      ? getCanonicalQuestionXp(params.questionId)
      : 0;

  let nextProgress: UserProgress = {
    ...progress,
    quizHistory: [newHistoryItem, ...existingHistory],
    completedChapters: updatedCompletedChapters,
    totalStudyMinutes:
      (progress.totalStudyMinutes || 0) + Math.max(1, Math.round((params.timeSpentSeconds || 10) / 60)),
  };

  if (xpAwarded > 0) {
    nextProgress = recordDailyXpActivity(nextProgress, xpAwarded, dateStr, {
      xpAlreadyInComputedLedger: true,
    });
  } else {
    nextProgress = {
      ...nextProgress,
      totalXp: calculateAuthoritativeUserXp(nextProgress),
    };
  }

  return {
    progress: nextProgress,
    xpAwarded,
    alreadyAnsweredCorrectly,
  };
}

/**
 * Pure helper to record stage completion in UserProgress,
 * enforcing replay idempotency (0 new XP if stage was already completed) and advancing daily XP mission.
 */
export function applyStageCompletionToProgress(
  progress: UserProgress,
  record: StageCompletionRecord,
  dateStr: string = new Date().toISOString().split('T')[0]
): { progress: UserProgress; xpAwarded: number; isReplay: boolean } {
  const wasAlreadyCompleted = Boolean(progress.completedStages?.[record.stageNumber]);
  const normalizedRecord: StageCompletionRecord = {
    ...record,
    verified: Boolean(record.verified === true || record.source === 'online-verified'),
    source:
      record.verified === true || record.source === 'online-verified'
        ? 'online-verified'
        : 'offline-local',
  };

  const updatedStages = mergeCompletedStages(progress.completedStages, {
    [record.stageNumber]: normalizedRecord,
  });

  const alreadyRecordedInHistory = (progress.quizHistory || []).some(
    (h) => h.questionId === `stage-${record.stageNumber}`
  );

  const newHistoryItem = {
    chapterId: 'ch-1',
    questionId: `stage-${record.stageNumber}`,
    isCorrect: true,
    userAnswer: 'completed',
    timestamp: Date.now(),
    timeSpentSeconds: 45,
    difficulty: 'intermediate' as DifficultyLevel,
  };

  const xpAwarded = wasAlreadyCompleted ? 0 : Math.max(0, Number(normalizedRecord.xpEarned) || 15);

  let nextProgress: UserProgress = {
    ...progress,
    completedStages: updatedStages,
    unlockedStageNumber: Math.max(progress.unlockedStageNumber || 1, record.stageNumber + 1),
    quizHistory: alreadyRecordedInHistory
      ? progress.quizHistory
      : [newHistoryItem, ...(progress.quizHistory || [])],
    totalStudyMinutes: wasAlreadyCompleted
      ? progress.totalStudyMinutes
      : (progress.totalStudyMinutes || 0) + 3,
    streakDays: (progress.streakDays || 0) < 1 ? 1 : progress.streakDays,
  };

  if (xpAwarded > 0) {
    nextProgress = recordDailyXpActivity(nextProgress, xpAwarded, dateStr, {
      xpAlreadyInComputedLedger: true,
    });
  } else {
    nextProgress = {
      ...nextProgress,
      totalXp: calculateAuthoritativeUserXp(nextProgress),
    };
  }

  return {
    progress: nextProgress,
    xpAwarded,
    isReplay: wasAlreadyCompleted,
  };
}

/**
 * Pure helper to claim a stage milestone chest (including Stage 100's +150 diamond chest).
 * Enforces both:
 * 1. All preceding prerequisite stages (1 .. stageNumber - 1) are completed.
 * 2. The target stage itself (including Stage 100) is completed.
 * Note: Chest claims and diamond balances are persisted locally in UserProgress (`localStorage`).
 */
export function claimStageChestReward(
  progress: UserProgress,
  stageNumber: number
): {
  progress: UserProgress;
  claimed: boolean;
  alreadyClaimed: boolean;
  diamondsAwarded: number;
  missingStageNumber?: number;
  error?: string;
} {
  const claimedChests = progress.claimedStageChests || [];
  if (claimedChests.includes(stageNumber)) {
    return {
      progress,
      claimed: false,
      alreadyClaimed: true,
      diamondsAwarded: 0,
    };
  }

  const prereq = stageExecutionEngine.isStagePrerequisiteMet(stageNumber, progress.completedStages);
  const isTargetStageCompleted = Boolean(progress.completedStages?.[stageNumber]);
  const isEligibleToClaim = prereq.isMet && isTargetStageCompleted;

  if (!isEligibleToClaim) {
    const missingStageNumber = !prereq.isMet
      ? prereq.missingStageNumber ?? stageNumber
      : stageNumber;
    return {
      progress,
      claimed: false,
      alreadyClaimed: false,
      diamondsAwarded: 0,
      missingStageNumber,
      error: !prereq.isMet
        ? prereq.reason ||
          `امکان دریافت پاداش صندوقچه وجود ندارد: مرحله پیش‌نیاز ${missingStageNumber} هنوز کامل نشده است.`
        : `امکان دریافت پاداش صندوقچه وجود ندارد: مرحله ${stageNumber} هنوز به پایان نرسیده است.`,
    };
  }

  const diamondsAwarded = stageNumber === 100 ? 150 : 50;
  const currentDiamonds = progress.diamonds ?? 480;
  const nextProgress: UserProgress = {
    ...progress,
    diamonds: currentDiamonds + diamondsAwarded,
    claimedStageChests: [...claimedChests, stageNumber],
  };

  return {
    progress: nextProgress,
    claimed: true,
    alreadyClaimed: false,
    diamondsAwarded,
  };
}

/**
 * Pure helper to record a completed Pomodoro focus session.
 * Rejects incomplete (< 60s), excessive (> 60m), or duplicate session IDs so study time and XP are never inflated.
 * Credits canonical Pomodoro XP to totalXp and daily mission progress once per unique sessionId.
 */
export function recordPomodoroSessionCompletion(
  progress: UserProgress,
  params: {
    sessionId: string;
    chapterId: string;
    seconds: number;
    completedAt?: string;
  },
  dateStr: string = new Date().toISOString().split('T')[0]
): { progress: UserProgress; applied: boolean; minutesAdded: number; xpAwarded: number } {
  const cleanSessionId = String(params.sessionId || '').trim();
  if (
    !cleanSessionId ||
    !/^pomo_[a-zA-Z0-9_-]{3,64}$/.test(cleanSessionId) ||
    !Number.isFinite(params.seconds) ||
    params.seconds < 60 ||
    params.seconds > 60 * 60
  ) {
    return { progress, applied: false, minutesAdded: 0, xpAwarded: 0 };
  }

  const existingHistory = progress.pomodoroHistory || [];
  if (existingHistory.some((s) => s.id === cleanSessionId)) {
    return { progress, applied: false, minutesAdded: 0, xpAwarded: 0 };
  }

  const minutes = Math.max(1, Math.min(60, Math.round(params.seconds / 60)));
  const xpAwarded = calculateCanonicalPomodoroXp(minutes);
  const newSession = {
    id: cleanSessionId,
    chapterId: params.chapterId || 'ch-1',
    minutes,
    completedAt: params.completedAt || new Date().toISOString(),
    xpEarned: xpAwarded,
  };

  const currentChapterSecs = progress.chapterStudyTime?.[newSession.chapterId] || 0;
  const updatedChapterStudyTime = {
    ...(progress.chapterStudyTime || {}),
    [newSession.chapterId]: currentChapterSecs + params.seconds,
  };

  const updatedHistory = [newSession, ...existingHistory];
  let nextProgress: UserProgress = {
    ...progress,
    chapterStudyTime: updatedChapterStudyTime,
    pomodoroHistory: updatedHistory,
    totalStudyMinutes: (progress.totalStudyMinutes || 0) + minutes,
    totalPomodoroSessionsCompleted: updatedHistory.length,
    streakDays: (progress.streakDays || 0) < 1 ? 1 : progress.streakDays,
  };

  if (xpAwarded > 0) {
    nextProgress = recordDailyXpActivity(nextProgress, xpAwarded, dateStr, {
      xpAlreadyInComputedLedger: true,
    });
  } else {
    nextProgress = {
      ...nextProgress,
      totalXp: calculateAuthoritativeUserXp(nextProgress),
    };
  }

  return {
    progress: nextProgress,
    applied: true,
    minutesAdded: minutes,
    xpAwarded,
  };
}

/**
 * Reconciles local UserProgress with a server-returned SyncedUserProfile.
 * Updates XP, badges, chapters, study minutes, streak, and completedStages even when completedStages is unchanged.
 * Returns the exact `prev` reference when no fields changed to prevent a React/localStorage sync loop.
 */
export function reconcileUserProgressWithSyncedProfile(
  prev: UserProgress,
  syncedProfile: Partial<SyncedUserProfile> | null | undefined
): UserProgress {
  if (!syncedProfile || typeof syncedProfile !== 'object') {
    return prev;
  }

  const mergedStages =
    syncedProfile.completedStages !== undefined
      ? mergeCompletedStages(prev.completedStages, syncedProfile.completedStages as any)
      : mergeCompletedStages(prev.completedStages, null);

  const computedUnlockedStage = stageExecutionEngine.calculateUnlockedStageNumber(mergedStages);
  const nextUnlockedStageNumber = Math.max(prev.unlockedStageNumber || 1, computedUnlockedStage);

  const prevRewarded = Array.isArray(prev.rewardedChapterIds) ? prev.rewardedChapterIds : [];
  const remoteChapters = Array.isArray(syncedProfile.completedChapters)
    ? syncedProfile.completedChapters.filter(
        (c): c is string => typeof c === 'string' && c.trim().length > 0
      )
    : [];
  // Do not re-add a chapter that was already rewarded locally and then intentionally unmarked by the user
  const nextCompletedChapters = Array.from(
    new Set([
      ...(prev.completedChapters || []),
      ...remoteChapters.filter((ch) => !prevRewarded.includes(ch)),
    ])
  );
  const nextRewardedChapterIds = Array.from(new Set([...prevRewarded]));

  const remoteBookmarks = Array.isArray(syncedProfile.bookmarkedChapters)
    ? syncedProfile.bookmarkedChapters.filter(
        (c): c is string => typeof c === 'string' && c.trim().length > 0
      )
    : [];
  const nextBookmarkedChapters =
    remoteBookmarks.length > 0
      ? Array.from(new Set([...(prev.bookmarkedChapters || []), ...remoteBookmarks]))
      : prev.bookmarkedChapters || [];

  const remoteBadges = Array.isArray(syncedProfile.unlockedBadgeIds)
    ? syncedProfile.unlockedBadgeIds.filter(
        (b): b is string => typeof b === 'string' && b.trim().length > 0
      )
    : [];
  const nextUnlockedBadgeIds = Array.from(
    new Set([...(prev.unlockedBadgeIds || []), ...remoteBadges])
  );
  const nextClaimedBadgeIds =
    typeof syncedProfile.xp === 'number' && syncedProfile.xp > 0 && remoteBadges.length > 0
      ? Array.from(new Set([...(prev.claimedBadgeIds || []), ...remoteBadges]))
      : prev.claimedBadgeIds || [];

  const nextStreakDays =
    typeof syncedProfile.streakDays === 'number' &&
    Number.isFinite(syncedProfile.streakDays) &&
    syncedProfile.streakDays > 0
      ? Math.max(prev.streakDays || 1, Math.trunc(syncedProfile.streakDays))
      : prev.streakDays || 1;

  const nextTotalStudyMinutes =
    typeof syncedProfile.totalStudyMinutes === 'number' &&
    Number.isFinite(syncedProfile.totalStudyMinutes) &&
    syncedProfile.totalStudyMinutes >= 0
      ? Math.max(prev.totalStudyMinutes || 0, Math.trunc(syncedProfile.totalStudyMinutes))
      : prev.totalStudyMinutes || 0;

  const candidateProg: UserProgress = {
    ...prev,
    completedStages: mergedStages,
    unlockedStageNumber: nextUnlockedStageNumber,
    completedChapters: nextCompletedChapters,
    rewardedChapterIds: nextRewardedChapterIds,
    bookmarkedChapters: nextBookmarkedChapters,
    unlockedBadgeIds: nextUnlockedBadgeIds,
    claimedBadgeIds: nextClaimedBadgeIds,
    streakDays: nextStreakDays,
    totalStudyMinutes: nextTotalStudyMinutes,
  };

  const nextTotalXp = calculateAuthoritativeUserXp(
    candidateProg,
    typeof syncedProfile.xp === 'number' && Number.isFinite(syncedProfile.xp)
      ? syncedProfile.xp
      : undefined
  );

  const isUnchanged =
    nextTotalXp === (prev.totalXp || 0) &&
    nextStreakDays === (prev.streakDays || 1) &&
    nextTotalStudyMinutes === (prev.totalStudyMinutes || 0) &&
    nextUnlockedStageNumber === (prev.unlockedStageNumber || 1) &&
    JSON.stringify(mergedStages) === JSON.stringify(prev.completedStages || {}) &&
    JSON.stringify(nextCompletedChapters) === JSON.stringify(prev.completedChapters || []) &&
    JSON.stringify(nextRewardedChapterIds) === JSON.stringify(prev.rewardedChapterIds || []) &&
    JSON.stringify(nextBookmarkedChapters) === JSON.stringify(prev.bookmarkedChapters || []) &&
    JSON.stringify(nextUnlockedBadgeIds) === JSON.stringify(prev.unlockedBadgeIds || []) &&
    JSON.stringify(nextClaimedBadgeIds) === JSON.stringify(prev.claimedBadgeIds || []);

  if (isUnchanged) {
    return prev;
  }

  return {
    ...candidateProg,
    totalXp: nextTotalXp,
  };
}

/**
 * Normalizes a single StageCompletionRecord and enforces explicit provenance fields
 * (`verified: boolean` and `source: 'online-verified' | 'offline-local'`).
 */
export function normalizeStageCompletionRecord(
  stageKey: string | number,
  raw: unknown
): StageCompletionRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const keyStr = String(stageKey ?? '').trim();
  const stagePrefixMatch = /^stage_([1-9]\d{0,2})$/.exec(keyStr);
  const numericKey = Number(keyStr);
  const parsedFromKey = stagePrefixMatch
    ? Number(stagePrefixMatch[1])
    : Number.isInteger(numericKey) && numericKey >= 1 && numericKey <= 100
    ? numericKey
    : 0;

  const rawStageNum =
    typeof rec.stageNumber === 'number' && Number.isFinite(rec.stageNumber)
      ? Math.trunc(rec.stageNumber)
      : parsedFromKey;
  if (rawStageNum < 1 || rawStageNum > 100) return null;

  const totalQuestions = Math.max(
    1,
    Math.min(50, Math.trunc(Number(rec.totalQuestions) || 8))
  );
  const score = Math.max(
    0,
    Math.min(totalQuestions, Math.trunc(Number(rec.score) || 0))
  );
  const stars = Math.max(1, Math.min(3, Math.trunc(Number(rec.stars) || 1)));
  const xpEarned = Math.max(
    0,
    Math.min(500, Math.trunc(Number(rec.xpEarned) || 0))
  );
  const isVerified = Boolean(rec.verified === true || rec.source === 'online-verified');
  const stageAnswers =
    rec.stageAnswers && typeof rec.stageAnswers === 'object' && !Array.isArray(rec.stageAnswers)
      ? (rec.stageAnswers as Record<string, unknown>)
      : undefined;

  return {
    stageNumber: rawStageNum,
    completedAt:
      typeof rec.completedAt === 'string' && rec.completedAt.trim()
        ? rec.completedAt
        : new Date().toISOString(),
    stars,
    score,
    totalQuestions,
    xpEarned,
    verified: isVerified,
    source: isVerified ? 'online-verified' : 'offline-local',
    ...(stageAnswers ? { stageAnswers } : {}),
  };
}

/**
 * Merges two `completedStages` maps while strictly enforcing the Golden Invariant:
 * - If EITHER `localStages` or `remoteStages` marks a stage as `verified: true` (`source: 'online-verified'`),
 *   the merged record MUST remain `verified: true` (`source: 'online-verified'`).
 *   An `online-verified` stage can NEVER be downgraded to `offline-local` by an offline replay or local hydration.
 * - Unverified local data (`verified: false`) can NEVER overwrite a server-verified record's `score`, `stars`, or `xpEarned`.
 */
export function mergeCompletedStages(
  localStages?: Record<number | string, StageCompletionRecord> | null,
  remoteStages?: Record<number | string, StageCompletionRecord> | null
): Record<number, StageCompletionRecord> {
  const result: Record<number, StageCompletionRecord> = {};

  const applyMap = (sourceMap?: Record<number | string, StageCompletionRecord> | null) => {
    if (!sourceMap || typeof sourceMap !== 'object' || Array.isArray(sourceMap)) return;
    for (const [rawKey, rawVal] of Object.entries(sourceMap)) {
      const normalized = normalizeStageCompletionRecord(rawKey, rawVal);
      if (!normalized) continue;
      const stageNum = normalized.stageNumber;
      const existing = result[stageNum];
      if (!existing) {
        result[stageNum] = normalized;
      } else {
        const existingVerified = Boolean(
          existing.verified === true || existing.source === 'online-verified'
        );
        const incomingVerified = Boolean(
          normalized.verified === true || normalized.source === 'online-verified'
        );
        const isVerified = existingVerified || incomingVerified;
        const mergedStageAnswers = normalized.stageAnswers || existing.stageAnswers;

        if (existingVerified && !incomingVerified) {
          // Golden Invariant: NEVER overwrite an online-verified record's score/stars/xp with unverified local data
          result[stageNum] = {
            ...existing,
            verified: true,
            source: 'online-verified',
            ...(mergedStageAnswers ? { stageAnswers: mergedStageAnswers } : {}),
          };
        } else if (!existingVerified && incomingVerified) {
          // Server-verified record supersedes unverified local record
          result[stageNum] = {
            ...normalized,
            verified: true,
            source: 'online-verified',
            ...(mergedStageAnswers ? { stageAnswers: mergedStageAnswers } : {}),
          };
        } else {
          // Both have the same verification tier: merge monotonically
          const mergedTotalQuestions = Math.max(existing.totalQuestions, normalized.totalQuestions);
          const mergedScore = Math.max(existing.score, normalized.score);
          const mergedStars = Math.max(existing.stars, normalized.stars);
          const mergedXpEarned = Math.max(existing.xpEarned, normalized.xpEarned);

          result[stageNum] = {
            stageNumber: stageNum,
            completedAt:
              normalized.completedAt > existing.completedAt
                ? normalized.completedAt
                : existing.completedAt,
            stars: mergedStars,
            score: Math.min(mergedTotalQuestions, mergedScore),
            totalQuestions: mergedTotalQuestions,
            xpEarned: mergedXpEarned,
            verified: isVerified,
            source: isVerified ? 'online-verified' : 'offline-local',
            ...(mergedStageAnswers ? { stageAnswers: mergedStageAnswers } : {}),
          };
        }
      }
    }
  };

  applyMap(localStages);
  applyMap(remoteStages);
  return result;
}

const defaultProgress: UserProgress = {
  completedChapters: ['ch-1'],
  rewardedChapterIds: [],
  bookmarkedChapters: ['ch-1', 'ch-5'],
  chapterNotes: {
    'ch-1': 'نکته مهم: وونت در ۱۸۷۹ روان‌شناسی را علمی کرد؛ رفتار آشکار و فرآیندهای روانی پنهان هستند.',
  },
  quizHistory: [],
  streakDays: 1,
  lastStudyDate: new Date().toISOString().split('T')[0],
  totalStudyMinutes: 45,
  pinnedChapters: ['ch-1', 'ch-5', 'ch-10'],
  unlockedBadgeIds: [],
  claimedBadgeIds: [],
  diamonds: 480,
  totalXp: 0,
  dailyXp: 0,
  dailyTargetXp: DEFAULT_DAILY_XP_TARGET,
  dailyMissionDate: new Date().toISOString().split('T')[0],
  dailyMissionCompleted: false,
  pomodoroHistory: [],
  completedStages: {},
  claimedStageChests: [],
  unlockedStageNumber: 1,
  customSettings: {
    fontSize: 'md',
    readingTheme: 'light',
    autoAdaptiveDifficulty: true,
    preferredDifficulty: 'intermediate',
    soundEnabled: true,
  },
};

export function getDefaultUserProgress(): UserProgress {
  return JSON.parse(JSON.stringify(defaultProgress));
}

export function loadUserProgress(userId?: string): UserProgress {
  try {
    const raw = userId
      ? localStorage.getItem(`${STORAGE_KEY}_${userId}`) || localStorage.getItem(STORAGE_KEY)
      : localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const def = getDefaultUserProgress();
      setSoundEnabled(def.customSettings.soundEnabled, { skipProgressSync: true });
      return def;
    }
    const parsed = JSON.parse(raw);
    const mergedStages = mergeCompletedStages(parsed?.completedStages, null);
    const baseProgress: UserProgress = {
      ...getDefaultUserProgress(),
      ...parsed,
      completedStages: mergedStages,
      customSettings: {
        ...getDefaultUserProgress().customSettings,
        ...(parsed?.customSettings || {}),
      },
    };
    baseProgress.totalXp = calculateAuthoritativeUserXp(baseProgress);
    setSoundEnabled(baseProgress.customSettings.soundEnabled, { skipProgressSync: true });
    return baseProgress;
  } catch (err) {
    console.error('Error loading user progress:', err);
    return getDefaultUserProgress();
  }
}

export function saveUserProgress(progress: UserProgress, userId?: string): void {
  try {
    const normalizedStages = mergeCompletedStages(progress.completedStages, null);
    const normalizedProgress: UserProgress = {
      ...progress,
      completedStages: normalizedStages,
      totalXp: calculateAuthoritativeUserXp({
        ...progress,
        completedStages: normalizedStages,
      }),
    };
    const serialized = JSON.stringify(normalizedProgress);
    localStorage.setItem(STORAGE_KEY, serialized);
    if (userId) {
      localStorage.setItem(`${STORAGE_KEY}_${userId}`, serialized);
    }
    if (typeof normalizedProgress.customSettings?.soundEnabled === 'boolean') {
      setSoundEnabled(normalizedProgress.customSettings.soundEnabled, { skipProgressSync: true });
    }
  } catch (err) {
    console.error('Error saving user progress:', err);
  }
}

export function loadSupportTickets(): SupportTicket[] {
  try {
    const raw = localStorage.getItem(TICKETS_KEY);
    if (!raw) {
      return [
        {
          id: 'tick-1',
          chapterId: 'ch-19',
          title: 'تفاوت ظریف اختلال OCD با شخصیت وسواسی OCPD',
          question: 'چرا در مصاحبه تشخیصی گاهی این دو با هم اشتباه گرفته می‌شوند؟ ملاک قطعی تفکیک چیست؟',
          reply: 'پاسخ منتور: در OCD مراجع افکار وسواسی را مزاحم، نامعقول و غیرارادی می‌داند (ایگو-دیستونیک) و با شست‌وشو یا چک کردن مکرر تلاش در فرونشاندن رنج دارد. اما در شخصیت وسواسی (OCPD)، فرد کمال‌گرایی و کنترل‌گری خود را رفتاری برتر و درست می‌پندارد (ایگو-سینتونیک) و شست‌وشوی مکرر ندارد، بلکه با قوانین انعطاف‌ناپذیر اطرافیان را دچار چالش می‌کند.',
          status: 'answered',
          date: '۱۴۰۵/۰۱/۱۵',
        },
      ];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveSupportTickets(tickets: SupportTicket[]): void {
  try {
    localStorage.setItem(TICKETS_KEY, JSON.stringify(tickets));
  } catch (e) {
    console.error('Error saving tickets:', e);
  }
}

export const LEARNING_DISCIPLINES: readonly LearningDisciplineDefinition[] = [
  {
    id: 'psychology',
    label: 'روانشناسی',
    englishLabel: 'Psychology',
    deskTitle: 'میز مطالعه روانشناسی',
    subtitle: 'سرفصل کامل ۱۰۰ مرحله‌ای، درس‌نامه‌های تخصصی و بانک سوالات بالینی، شناختی و رشد',
    upcomingSummary: 'مسیر ۱۰۰ مرحله‌ای، ۳۹ فصل تخصصی و شبیه‌ساز آزمون کارشناسی ارشد و دکتری فعال است.',
    iconName: 'brain',
    hasCurriculum: true,
    palette: {
      activeBg: 'bg-[#36345F]',
      activeText: 'text-white',
      activeBorder: 'border-[#36345F]',
      badgeBg: 'bg-[#EAE4FF]',
      iconColor: 'text-[#7056D8]',
    },
  },
  {
    id: 'sociology',
    label: 'جامعهشناسی',
    englishLabel: 'Sociology',
    deskTitle: 'میز مطالعه جامعهشناسی',
    subtitle: 'نظریه‌های کلاسیک و معاصر جامعه‌شناسی، قشربندی اجتماعی و روش تحقیق کمی و کیفی',
    upcomingSummary:
      'سرفصل‌های اختصاصی جامعه‌شناسی (نظریه‌های دورکیم، وبر، مارکس و بوردیو) در حال تدوین است و به‌زودی به این میز افزوده می‌شود.',
    iconName: 'users',
    hasCurriculum: false,
    palette: {
      activeBg: 'bg-[#134E4A]',
      activeText: 'text-white',
      activeBorder: 'border-[#149D9A]',
      badgeBg: 'bg-[#DDF3E9]',
      iconColor: 'text-[#149D9A]',
    },
  },
  {
    id: 'law',
    label: 'حقوق',
    englishLabel: 'Law',
    deskTitle: 'میز مطالعه حقوق',
    subtitle: 'حقوق مدنی، حقوق جزای عمومی و اختصاصی، آیین دادرسی و اصول فقه و استنباط حقوقی',
    upcomingSummary:
      'درس‌نامه‌ها و مراحل تعاملی حقوق مدنی، جزا و آزمون‌های وکالت در حال آماده‌سازی است.',
    iconName: 'scale',
    hasCurriculum: false,
    palette: {
      activeBg: 'bg-[#5C3D0E]',
      activeText: 'text-white',
      activeBorder: 'border-[#C98A27]',
      badgeBg: 'bg-[#FFF0C8]',
      iconColor: 'text-[#C98A27]',
    },
  },
  {
    id: 'art',
    label: 'هنر',
    englishLabel: 'Art',
    deskTitle: 'میز مطالعه هنر',
    subtitle: 'تاریخ هنر ایران و جهان، درک عمومی هنر، زیبایی‌شناسی، خلاقیت تصویری و نقد هنری',
    upcomingSummary:
      'مجموعه درس‌های تاریخ هنر، سبک‌شناسی و درک عمومی هنر در حال تدوین برای انتشار در نسخه‌های آتی است.',
    iconName: 'palette',
    hasCurriculum: false,
    palette: {
      activeBg: 'bg-[#7A2736]',
      activeText: 'text-white',
      activeBorder: 'border-[#D95D5A]',
      badgeBg: 'bg-[#FDE8E8]',
      iconColor: 'text-[#D95D5A]',
    },
  },
  {
    id: 'philosophy',
    label: 'فلسفه',
    englishLabel: 'Philosophy',
    deskTitle: 'میز مطالعه فلسفه',
    subtitle: 'تاریخ فلسفه غرب و اسلامی، معرفت‌شناسی، منطق قدیم و جدید، متافیزیک و فلسفه ذهن',
    upcomingSummary:
      'سرفصل‌های مرحله‌به‌مرحله فلسفه تحلیلی، قاره‌ای و منطق در حال تدوین و ساختاردهی است.',
    iconName: 'book-open',
    hasCurriculum: false,
    palette: {
      activeBg: 'bg-[#2E386B]',
      activeText: 'text-white',
      activeBorder: 'border-[#4F5D95]',
      badgeBg: 'bg-[#E1ECFF]',
      iconColor: 'text-[#3976E4]',
    },
  },
  {
    id: 'entrance_exam',
    label: 'کنکور',
    englishLabel: 'Entrance Exam Preparation',
    deskTitle: 'میز آمادگی کنکور',
    subtitle: 'جمع‌بندی ساختاریافته، تکنیک‌های مدیریت زمان، تحلیل کارنامه و شبیه‌ساز آزمون جامع',
    upcomingSummary:
      'مسیر اختصاصی برنامه‌ریزی و جمع‌بندی کنکور در حال تکمیل است؛ هم‌اکنون می‌توانید از شبیه‌ساز آزمون جامع در بخش آزمون‌ها استفاده کنید.',
    iconName: 'graduation-cap',
    hasCurriculum: false,
    palette: {
      activeBg: 'bg-[#1E3A8A]',
      activeText: 'text-white',
      activeBorder: 'border-[#3976E4]',
      badgeBg: 'bg-[#E1ECFF]',
      iconColor: 'text-[#3976E4]',
    },
  },
  {
    id: 'politics',
    label: 'سیاست',
    englishLabel: 'Politics',
    deskTitle: 'میز مطالعه سیاست',
    subtitle: 'اندیشه‌های سیاسی غرب و اسلام، جامعه‌شناسی سیاسی، روابط بین‌الملل و سیاست تطبیقی',
    upcomingSummary:
      'سرفصل‌های علوم سیاسی و روابط بین‌الملل در حال تدوین است و به‌زودی در دسترس قرار می‌گیرد.',
    iconName: 'landmark',
    hasCurriculum: false,
    palette: {
      activeBg: 'bg-[#2C4A3E]',
      activeText: 'text-white',
      activeBorder: 'border-[#389D77]',
      badgeBg: 'bg-[#DDF3E9]',
      iconColor: 'text-[#389D77]',
    },
  },
] as const;

export const SUPPORTED_DISCIPLINE_IDS: readonly LearningDisciplineId[] = LEARNING_DISCIPLINES.map(
  (d) => d.id
);

const VALID_DISCIPLINE_ID_SET = new Set<string>(SUPPORTED_DISCIPLINE_IDS);

export function isValidDisciplineId(value: unknown): value is LearningDisciplineId {
  return typeof value === 'string' && VALID_DISCIPLINE_ID_SET.has(value.trim());
}

export function normalizeDisciplineId(value: unknown): LearningDisciplineId {
  if (typeof value !== 'string') {
    return DEFAULT_LEARNING_DISCIPLINE_ID;
  }
  const trimmed = value.trim();
  if (isValidDisciplineId(trimmed)) {
    return trimmed;
  }
  return DEFAULT_LEARNING_DISCIPLINE_ID;
}

export function getDisciplineDefinition(disciplineId: unknown): LearningDisciplineDefinition {
  const normalized = normalizeDisciplineId(disciplineId);
  return (
    LEARNING_DISCIPLINES.find((item) => item.id === normalized) || LEARNING_DISCIPLINES[0]
  );
}

export function loadActiveDiscipline(): LearningDisciplineId {
  try {
    const stored = localStorage.getItem(ACTIVE_DISCIPLINE_STORAGE_KEY);
    return normalizeDisciplineId(stored);
  } catch {
    return DEFAULT_LEARNING_DISCIPLINE_ID;
  }
}

export function saveActiveDiscipline(disciplineId: unknown): LearningDisciplineId {
  const normalized = normalizeDisciplineId(disciplineId);
  try {
    const current = localStorage.getItem(ACTIVE_DISCIPLINE_STORAGE_KEY);
    if (current !== normalized) {
      localStorage.setItem(ACTIVE_DISCIPLINE_STORAGE_KEY, normalized);
    }
  } catch (err) {
    console.error('Error saving active discipline:', err);
  }
  return normalized;
}

/**
 * Shared single-source-of-truth discipline controller for synchronizing
 * Dashboard and Header selectors without mutating user progress or triggering storage loops.
 */
export function createSynchronizedDisciplineController(initialDiscipline?: unknown) {
  let currentDiscipline: LearningDisciplineId =
    initialDiscipline !== undefined
      ? saveActiveDiscipline(initialDiscipline)
      : loadActiveDiscipline();

  const listeners = new Set<(disciplineId: LearningDisciplineId) => void>();

  return {
    getActiveDiscipline: (): LearningDisciplineId => currentDiscipline,
    getActiveDefinition: (): LearningDisciplineDefinition =>
      getDisciplineDefinition(currentDiscipline),
    selectDiscipline: (nextDisciplineId: unknown): LearningDisciplineId => {
      const normalized = saveActiveDiscipline(nextDisciplineId);
      if (normalized !== currentDiscipline) {
        currentDiscipline = normalized;
        for (const listener of listeners) {
          listener(currentDiscipline);
        }
      }
      return currentDiscipline;
    },
    reloadFromStorage: (): LearningDisciplineId => {
      const reloaded = loadActiveDiscipline();
      currentDiscipline = reloaded;
      for (const listener of listeners) {
        listener(currentDiscipline);
      }
      return currentDiscipline;
    },
    subscribe: (listener: (disciplineId: LearningDisciplineId) => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

