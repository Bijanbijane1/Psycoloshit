import { UserProgress } from '../types/psychology';

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

// Sync progress to cloud backend
export async function syncProgressToCloud(progress: UserProgress): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const userId = getOrCreateUserId();
    const name = getUserDisplayName();
    const avatar = getUserAvatar();

    const res = await fetch('/api/user/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        name,
        avatar,
        xp: progress.totalStudyMinutes * 15 + progress.completedChapters.length * 50,
        streakDays: progress.streakDays,
        totalStudyMinutes: progress.totalStudyMinutes,
        completedChapters: progress.completedChapters,
        completedStages: progress.completedStages,
        unlockedBadgeIds: progress.unlockedBadgeIds || [],
        bookmarkedChapters: progress.bookmarkedChapters,
      }),
    });
    return res.ok;
  } catch {
    return false;
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
    const res = await fetch(`/api/leaderboard?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Submit score on quiz or lesson pass
export async function submitScoreToLeaderboard(xpEarned: number, streakDays: number): Promise<void> {
  try {
    const userId = getOrCreateUserId();
    const name = getUserDisplayName();
    const avatar = getUserAvatar();

    await fetch('/api/leaderboard/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        name,
        avatar,
        xpEarned,
        streakDays,
      }),
    });
  } catch {
    // Fail silently in offline
  }
}
