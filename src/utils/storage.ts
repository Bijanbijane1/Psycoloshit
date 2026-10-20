import { UserProgress, SupportTicket, StageCompletionRecord } from '../types/psychology';

const STORAGE_KEY = 'psychomaster_user_progress_v1';
const TICKETS_KEY = 'psychomaster_support_tickets_v1';

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
  bookmarkedChapters: ['ch-1', 'ch-5'],
  chapterNotes: {
    'ch-1': 'نکته مهم: وونت در ۱۸۷۹ روان‌شناسی را علمی کرد؛ رفتار آشکار و فرآیندهای روانی پنهان هستند.',
  },
  quizHistory: [
    {
      chapterId: 'ch-1',
      questionId: 'q-1-1',
      isCorrect: true,
      userAnswer: 1,
      timestamp: Date.now() - 3600000,
      timeSpentSeconds: 18,
      difficulty: 'basic',
    },
  ],
  streakDays: 3,
  lastStudyDate: new Date().toISOString().split('T')[0],
  totalStudyMinutes: 45,
  pinnedChapters: ['ch-1', 'ch-5', 'ch-10'],
  unlockedBadgeIds: [],
  claimedBadgeIds: [],
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
    if (userId) {
      const userRaw = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
      if (userRaw) {
        const parsed = JSON.parse(userRaw);
        return {
          ...getDefaultUserProgress(),
          ...parsed,
          completedStages: mergeCompletedStages(parsed?.completedStages, null),
        };
      }
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultUserProgress();
    const parsed = JSON.parse(raw);
    return {
      ...getDefaultUserProgress(),
      ...parsed,
      completedStages: mergeCompletedStages(parsed?.completedStages, null),
    };
  } catch (err) {
    console.error('Error loading user progress:', err);
    return getDefaultUserProgress();
  }
}

export function saveUserProgress(progress: UserProgress, userId?: string): void {
  try {
    const normalizedProgress: UserProgress = {
      ...progress,
      completedStages: mergeCompletedStages(progress.completedStages, null),
    };
    const serialized = JSON.stringify(normalizedProgress);
    localStorage.setItem(STORAGE_KEY, serialized);
    if (userId) {
      localStorage.setItem(`${STORAGE_KEY}_${userId}`, serialized);
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
