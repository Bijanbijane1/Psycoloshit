import { UserProgress } from '../types/psychology';
import { SyncedUserProfile } from '../worker/db/schema';

const USER_ID_KEY = 'psychomaster_user_id';
const USER_NAME_KEY = 'psychomaster_user_name';
const USER_AVATAR_KEY = 'psychomaster_user_avatar';

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

function notifyUserSynced(profile?: SyncedUserProfile) {
  if (typeof window === 'undefined' || !profile) return;
  try {
    window.dispatchEvent(new CustomEvent('psychomaster:user-synced', { detail: profile }));
  } catch {}
}

// Sync progress to cloud backend (XP is strictly server-owned and never sent from client sync)
export async function syncProgressToCloud(progress: UserProgress): Promise<SyncedUserProfile | null> {
  if (typeof window === 'undefined') return null;
  try {
    const userId = getOrCreateUserId();
    const name = getUserDisplayName();
    const avatar = getUserAvatar();

    const res = await fetch('/api/user/sync', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        name,
        avatar,
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
    if (data?.profile) {
      notifyUserSynced(data.profile);
      return data.profile as SyncedUserProfile;
    }
    return null;
  } catch {
    return null;
  }
}

// Fetch real multi-player leaderboard
export async function fetchLiveLeaderboard(): Promise<{
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
    const userId = getOrCreateUserId();
    const res = await fetch(`/api/leaderboard?userId=${encodeURIComponent(userId)}`, {
      credentials: 'include',
      headers: { 'Cache-Control': 'no-store' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface VerifiableRewardSubmission {
  rewardType: 'stage_completion' | 'quiz_answer';
  stageNumber?: number;
  stars?: number;
  score?: number;
  totalQuestions?: number;
  chapterId?: string;
  questionId?: string;
  userAnswer?: unknown;
  isCorrect?: boolean;
  xpEarned?: number;
}

// Submit verifiable curriculum reward on quiz answer or stage completion
export async function submitScoreToLeaderboard(
  rewardOrXp: VerifiableRewardSubmission | number,
  streakDays: number,
  maybeEventDetails?: Partial<VerifiableRewardSubmission>
): Promise<SyncedUserProfile | null> {
  if (typeof window === 'undefined') return null;
  try {
    const userId = getOrCreateUserId();
    const name = getUserDisplayName();
    const avatar = getUserAvatar();

    const payload: VerifiableRewardSubmission =
      typeof rewardOrXp === 'object' && rewardOrXp !== null
        ? rewardOrXp
        : {
            rewardType: maybeEventDetails?.rewardType || 'stage_completion',
            xpEarned: rewardOrXp,
            ...maybeEventDetails,
          };

    const res = await fetch('/api/leaderboard/submit', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        name,
        avatar,
        streakDays,
        ...payload,
      }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.profile) {
        notifyUserSynced(data.profile);
        return data.profile as SyncedUserProfile;
      }
    }
    return null;
  } catch {
    // Fail silently in offline
    return null;
  }
}

