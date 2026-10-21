import { UserProgress } from '../types/psychology';
import { SyncedUserProfile } from '../worker/db/schema';
import {
  loadUserProgress,
  saveUserProgress,
  mergeCompletedStages,
  reconcileUserProgressWithSyncedProfile,
} from './storage';
import { toEnglishDigits } from './persianDigits';
import { authService } from '../services/authService';

const USER_ID_KEY = 'psychomaster_user_id';
const USER_NAME_KEY = 'psychomaster_user_name';
const USER_AVATAR_KEY = 'psychomaster_user_avatar';
const GUEST_TOKEN_KEY = 'psychomaster_guest_session_token';

let cachedGuestSessionToken: string | null = null;

export function getGuestSessionToken(): string | null {
  if (cachedGuestSessionToken) return cachedGuestSessionToken;
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(GUEST_TOKEN_KEY) || localStorage.getItem(GUEST_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setGuestSessionToken(token: string | null): void {
  cachedGuestSessionToken = token;
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      sessionStorage.setItem(GUEST_TOKEN_KEY, token);
      localStorage.setItem(GUEST_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(GUEST_TOKEN_KEY);
      localStorage.removeItem(GUEST_TOKEN_KEY);
    }
  } catch {}
}

export function getOrCreateUserId(): string {
  if (typeof window === 'undefined') return 'server_user';
  try {
    let uid = localStorage.getItem(USER_ID_KEY);
    if (!uid) {
      uid = 'usr_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      localStorage.setItem(USER_ID_KEY, uid);
    }
    return uid;
  } catch {
    return 'fallback_user';
  }
}

export function setUserId(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const prev = localStorage.getItem(USER_ID_KEY);
    if (prev && prev !== userId) {
      setGuestSessionToken(null);
    }
    localStorage.setItem(USER_ID_KEY, userId);
  } catch {}
}

export function getUserDisplayName(): string {
  if (typeof window === 'undefined') return 'دانشجوی روان‌شناسی';
  try {
    return localStorage.getItem(USER_NAME_KEY) || 'دانشجوی برتر روان‌لینگو';
  } catch {
    return 'دانشجوی روان‌شناسی';
  }
}

export function setUserDisplayName(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USER_NAME_KEY, name);
  } catch {}
}

export function getUserAvatar(): string {
  if (typeof window === 'undefined') return '🦉';
  try {
    return localStorage.getItem(USER_AVATAR_KEY) || '🦉';
  } catch {
    return '🦉';
  }
}

export function setUserAvatar(avatar: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USER_AVATAR_KEY, avatar);
  } catch {}
}

/**
 * Reconciles a server-returned `SyncedUserProfile` directly into `localStorage`
 * even when `completedStages` is unchanged (e.g. XP-only, quiz, chapter, Pomodoro, or badge updates).
 */
export function applySyncedProfileToLocalStorage(
  syncedProfile: Partial<SyncedUserProfile> | null | undefined,
  userId?: string
): UserProgress | null {
  if (typeof window === 'undefined' || !syncedProfile || typeof syncedProfile !== 'object') {
    return null;
  }
  try {
    const targetUserId = userId || syncedProfile.userId || getOrCreateUserId();
    const current = loadUserProgress(targetUserId);
    const reconciled = reconcileUserProgressWithSyncedProfile(current, syncedProfile);
    if (reconciled !== current) {
      saveUserProgress(reconciled, targetUserId);
    }
    return reconciled;
  } catch {
    return null;
  }
}

function notifyUserSynced(profile?: SyncedUserProfile) {
  if (typeof window === 'undefined' || !profile) return;
  try {
    applySyncedProfileToLocalStorage(profile, profile.userId);
    window.dispatchEvent(new CustomEvent('psychomaster:user-synced', { detail: profile }));
  } catch {}
}

// Sync progress to cloud backend (XP is strictly server-owned and never sent from client sync)
export async function syncProgressToCloud(
  progress: UserProgress,
  options?: { skipPendingStageReplay?: boolean }
): Promise<SyncedUserProfile | null> {
  if (typeof window === 'undefined') return null;
  try {
    const userId = getOrCreateUserId();
    const name = getUserDisplayName();
    const avatar = getUserAvatar();
    const guestToken = getGuestSessionToken();

    const res = await fetch('/api/user/sync', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(guestToken ? { 'X-Guest-Session-Token': guestToken } : {}),
      },
      body: JSON.stringify({
        userId,
        name,
        avatar,
        ...(guestToken ? { guestToken } : {}),
        streakDays: progress.streakDays,
        totalStudyMinutes: progress.totalStudyMinutes,
        completedChapters: progress.completedChapters,
        completedStages: progress.completedStages,
        unlockedBadgeIds: progress.unlockedBadgeIds || [],
        bookmarkedChapters: progress.bookmarkedChapters,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const returnedGuestToken =
      typeof data?.guestToken === 'string' && data.guestToken.trim()
        ? data.guestToken.trim()
        : typeof data?.guestSessionToken === 'string' && data.guestSessionToken.trim()
        ? data.guestSessionToken.trim()
        : null;
    if (returnedGuestToken) {
      setGuestSessionToken(returnedGuestToken);
    }

    let latestProfile: SyncedUserProfile | null = data?.profile
      ? (data.profile as SyncedUserProfile)
      : null;

    // Replay any offline-local stages that have recorded verifiable answers in ascending order
    if (!options?.skipPendingStageReplay && progress.completedStages) {
      const replayedProfile = await syncPendingOfflineStages(progress);
      if (replayedProfile) {
        latestProfile = replayedProfile;
      }
    }

    if (latestProfile) {
      const safeMergedProfile: SyncedUserProfile = {
        ...latestProfile,
        completedStages: mergeCompletedStages(
          progress.completedStages,
          latestProfile.completedStages as any
        ) as any,
      };
      notifyUserSynced(safeMergedProfile);
      return safeMergedProfile;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Replays any `offline-local` completed stages that have recorded `stageAnswers`
 * in strictly ascending stageNumber order (1, 2, 3...) so server prerequisite gates succeed.
 */
export async function syncPendingOfflineStages(
  progress: UserProgress
): Promise<SyncedUserProfile | null> {
  if (typeof window === 'undefined' || !progress.completedStages) return null;

  const pendingStages = Object.values(progress.completedStages)
    .filter(
      (st) =>
        st &&
        typeof st.stageNumber === 'number' &&
        !st.verified &&
        st.source !== 'online-verified' &&
        st.stageAnswers &&
        Object.keys(st.stageAnswers).length >= 4
    )
    .sort((a, b) => a.stageNumber - b.stageNumber);

  if (pendingStages.length === 0) return null;

  let latestProfile: SyncedUserProfile | null = null;
  for (const st of pendingStages) {
    const res = await submitStageOrQuizReward(
      {
        rewardType: 'stage_completion',
        stageNumber: st.stageNumber,
        stars: st.stars,
        score: st.score,
        totalQuestions: st.totalQuestions,
        xpEarned: st.xpEarned,
        stageAnswers: st.stageAnswers,
      },
      progress.streakDays || 1,
      { skipAutoBootstrap: true }
    );
    if (res.ok && res.profile) {
      latestProfile = res.profile;
    } else if (res.status === 409) {
      // Stop ascending chain if an earlier stage could not be verified
      break;
    }
  }
  return latestProfile;
}

/**
 * Builds the `GET /api/leaderboard` URL in strict compliance with Phase 6G privacy contracts:
 * - Only appends `?userId=...` when an active authenticated session exists (`isAuthenticated === true`).
 * - Omits `userId` for unauthenticated/guest callers.
 */
export function buildLeaderboardUrl(
  userId?: string | null,
  isAuthenticated: boolean = false
): string {
  const cleanUserId = toEnglishDigits(String(userId || '').trim());
  if (isAuthenticated && cleanUserId) {
    return `/api/leaderboard?userId=${encodeURIComponent(cleanUserId)}`;
  }
  return '/api/leaderboard';
}

/**
 * Generates a deterministic or attempt-scoped idempotencyKey for `/api/leaderboard/submit`
 * so network retries for the same quiz/stage/badge/chapter/Pomodoro attempt never double-award XP.
 */
export function generateAttemptIdempotencyKey(
  reward: {
    rewardType:
      | 'stage_completion'
      | 'quiz_answer'
      | 'badge_unlock'
      | 'chapter_completion'
      | 'pomodoro'
      | 'study_session'
      | string;
    stageNumber?: number;
    chapterId?: string;
    questionId?: string;
    badgeId?: string;
    sessionId?: string;
  },
  attemptId?: string
): string {
  const cleanAttempt = toEnglishDigits(String(attemptId || '').trim());
  if (reward.rewardType === 'stage_completion') {
    const stageNum = Math.max(1, Math.trunc(Number(reward.stageNumber) || 1));
    return cleanAttempt ? `stage:${stageNum}:attempt:${cleanAttempt}` : `stage:${stageNum}`;
  }
  if (reward.rewardType === 'badge_unlock') {
    const bId = toEnglishDigits(String(reward.badgeId || 'badge').trim());
    return `badge_unlock:${bId}`;
  }
  if (reward.rewardType === 'chapter_completion') {
    const ch = toEnglishDigits(String(reward.chapterId || 'ch').trim());
    return `chapter_completion:${ch}`;
  }
  if (reward.rewardType === 'pomodoro' || reward.rewardType === 'study_session') {
    const sId = toEnglishDigits(String(reward.sessionId || cleanAttempt || 'session').trim());
    return `pomodoro:${sId}`;
  }
  const ch = toEnglishDigits(String(reward.chapterId || 'ch').trim());
  const q = toEnglishDigits(String(reward.questionId || 'q').trim());
  return cleanAttempt ? `quiz:${ch}:${q}:attempt:${cleanAttempt}` : `quiz:${ch}:${q}`;
}

// Fetch real multi-player leaderboard
export async function fetchLiveLeaderboard(options?: {
  isAuthenticated?: boolean;
  userId?: string;
  bearerToken?: string;
}): Promise<{
  leagueName: string;
  countdownDaysRemaining: number;
  currentUserRank: number;
  leaderboard: Array<{
    rank: number;
    userId: string;
    name: string;
    avatar: string;
    xp: number;
    streakDays: number;
    tier: string;
    isCurrentUser: boolean;
  }>;
} | null> {
  try {
    const cachedAuthUser = authService.getCachedUser();
    const guestToken = getGuestSessionToken();
    const isAuthenticated = options?.isAuthenticated ?? Boolean(cachedAuthUser || guestToken);
    const targetUserId = options?.userId || cachedAuthUser?.userId || getOrCreateUserId();
    const url = buildLeaderboardUrl(targetUserId, isAuthenticated);

    const headers: Record<string, string> = {
      'Cache-Control': 'no-store',
      ...(guestToken ? { 'X-Guest-Session-Token': guestToken } : {}),
    };
    if (options?.bearerToken) {
      headers['Authorization'] = `Bearer ${options.bearerToken}`;
    }

    const res = await fetch(url, {
      credentials: 'include',
      headers,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface VerifiableRewardSubmission {
  rewardType:
    | 'stage_completion'
    | 'quiz_answer'
    | 'badge_unlock'
    | 'chapter_completion'
    | 'pomodoro'
    | 'study_session';
  stageNumber?: number;
  stars?: number;
  score?: number;
  totalQuestions?: number;
  stageAnswers?: Record<string, unknown>;
  chapterId?: string;
  questionId?: string;
  userAnswer?: unknown;
  isCorrect?: boolean;
  xpEarned?: number;
  idempotencyKey?: string;
  attemptId?: string;
  badgeId?: string;
  minutes?: number;
  seconds?: number;
  sessionId?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface RewardSubmissionResult {
  ok: boolean;
  status: number;
  code?:
    | 'PREREQUISITE_NOT_MET'
    | 'PREREQUISITE_STAGE_NOT_COMPLETED'
    | 'UNAUTHORIZED'
    | 'RATE_LIMITED'
    | 'VALIDATION_ERROR'
    | 'NETWORK_ERROR';
  missingPrerequisiteStage?: number;
  error?: string;
  applied?: boolean;
  alreadyProcessed?: boolean;
  alreadyClaimed?: boolean;
  awardedXp?: number;
  xpAwarded?: number;
  updatedXp?: number;
  profile?: SyncedUserProfile | null;
  idempotencyKey?: string;
}

/**
 * Structured reward submission client for `/api/leaderboard/submit`.
 * - Automatically bootstraps guest session via `/api/user/sync` on 401 and retries once.
 * - Parses 409 prerequisite stage errors (`Stage X must be verified before completing stage Y`)
 *   and attempts ascending replay of local offline stages if answers are available.
 */
export async function submitStageOrQuizReward(
  reward: VerifiableRewardSubmission,
  streakDays: number,
  options?: { skipAutoBootstrap?: boolean }
): Promise<RewardSubmissionResult> {
  const idempotencyKey = String(
    reward.idempotencyKey || generateAttemptIdempotencyKey(reward, reward.attemptId)
  ).slice(0, 128);

  if (typeof window === 'undefined') {
    return {
      ok: false,
      status: 0,
      code: 'NETWORK_ERROR',
      error: 'محیط مرورگر در دسترس نیست.',
      idempotencyKey,
    };
  }

  try {
    const userId = toEnglishDigits(getOrCreateUserId());
    const name = getUserDisplayName();
    const avatar = getUserAvatar();
    const guestToken = getGuestSessionToken();

    const res = await fetch('/api/leaderboard/submit', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(guestToken ? { 'X-Guest-Session-Token': guestToken } : {}),
      },
      body: JSON.stringify({
        userId,
        name,
        avatar,
        streakDays: Number(toEnglishDigits(streakDays)) || 1,
        idempotencyKey,
        ...(guestToken ? { guestToken } : {}),
        ...reward,
      }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.profile) {
        notifyUserSynced(data.profile);
      }
      const alreadyClaimed = Boolean(
        data?.alreadyClaimed === true ||
          data?.alreadyProcessed === true ||
          data?.applied === false
      );
      const awardedXp =
        typeof data?.xpAwarded === 'number'
          ? data.xpAwarded
          : typeof data?.awardedXp === 'number'
          ? data.awardedXp
          : 0;

      return {
        ok: true,
        status: 200,
        idempotencyKey,
        applied: data?.applied !== undefined ? Boolean(data.applied) : !alreadyClaimed,
        alreadyProcessed: alreadyClaimed,
        alreadyClaimed,
        awardedXp,
        xpAwarded: awardedXp,
        updatedXp: typeof data?.updatedXp === 'number' ? data.updatedXp : undefined,
        profile: (data?.profile as SyncedUserProfile) || null,
      };
    }

    const errData = await res.json().catch(() => ({} as Record<string, unknown>));
    const errText = typeof errData?.error === 'string' ? errData.error : '';

    // Auto-bootstrap guest session on 401 if guest profile hasn't synced yet
    if (res.status === 401 && !options?.skipAutoBootstrap && !userId.startsWith('usr_g_')) {
      const localProg = loadUserProgress(userId);
      const synced = await syncProgressToCloud(localProg, { skipPendingStageReplay: true });
      if (synced) {
        return submitStageOrQuizReward(
          { ...reward, idempotencyKey },
          streakDays,
          { skipAutoBootstrap: true }
        );
      }
    }

    // Handle 409 Prerequisite stage not verified in D1
    if (res.status === 409) {
      const match = /stage\s+(\d+)\s+must be verified/i.exec(errText);
      const missingStage =
        typeof errData?.missingPrerequisiteStage === 'number'
          ? errData.missingPrerequisiteStage
          : match
          ? Number(match[1])
          : undefined;

      if (!options?.skipAutoBootstrap) {
        const localProg = loadUserProgress(userId);
        const replayed = await syncPendingOfflineStages(localProg);
        if (replayed) {
          return submitStageOrQuizReward(
            { ...reward, idempotencyKey },
            streakDays,
            { skipAutoBootstrap: true }
          );
        }
      }

      return {
        ok: false,
        status: 409,
        code: 'PREREQUISITE_NOT_MET',
        missingPrerequisiteStage: missingStage,
        idempotencyKey,
        error: missingStage
          ? `مرحله قبلی در حالت آفلاین تکمیل شده است. برای ثبت امتیاز (XP) در لیدربورد جهانی، ابتدا مرحله قبلی را به صورت آنلاین تأیید کنید.`
          : errText || 'پیش‌نیاز این مرحله هنوز در سرور تایید نشده است.',
      };
    }

    if (res.status === 401) {
      return {
        ok: false,
        status: 401,
        code: 'UNAUTHORIZED',
        idempotencyKey,
        error: 'نشست کاربری برای ثبت امتیاز در سرور معتبر نیست. پیشرفت شما به صورت محلی ذخیره شد.',
      };
    }

    if (res.status === 429) {
      return {
        ok: false,
        status: 429,
        code: 'RATE_LIMITED',
        idempotencyKey,
        error: 'تعداد درخواست‌های ثبت امتیاز بیش از حد مجاز است. لطفاً چند لحظه صبر کنید.',
      };
    }

    return {
      ok: false,
      status: res.status,
      code: 'VALIDATION_ERROR',
      idempotencyKey,
      error: errText || 'امکان تایید آنلاین امتیاز در حال حاضر وجود ندارد.',
    };
  } catch {
    return {
      ok: false,
      status: 0,
      code: 'NETWORK_ERROR',
      idempotencyKey,
      error: 'عدم دسترسی به سرور (حالت آفلاین) — مرحله به صورت محلی ذخیره شد.',
    };
  }
}

// Submit verifiable curriculum reward on quiz answer or stage completion
export async function submitScoreToLeaderboard(
  rewardOrXp: VerifiableRewardSubmission | number,
  streakDays: number,
  maybeEventDetails?: Partial<VerifiableRewardSubmission>
): Promise<SyncedUserProfile | null> {
  const payload: VerifiableRewardSubmission =
    typeof rewardOrXp === 'object' && rewardOrXp !== null
      ? rewardOrXp
      : {
          rewardType: maybeEventDetails?.rewardType || 'stage_completion',
          xpEarned: rewardOrXp,
          ...maybeEventDetails,
        };

  const result = await submitStageOrQuizReward(payload, streakDays);
  return result.profile || null;
}


