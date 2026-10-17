import { UserProgress, SupportTicket } from '../types/psychology';

const STORAGE_KEY = 'psychomaster_user_progress_v1';
const TICKETS_KEY = 'psychomaster_support_tickets_v1';

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
        return { ...getDefaultUserProgress(), ...JSON.parse(userRaw) };
      }
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultUserProgress();
    return { ...getDefaultUserProgress(), ...JSON.parse(raw) };
  } catch (err) {
    console.error('Error loading user progress:', err);
    return getDefaultUserProgress();
  }
}

export function saveUserProgress(progress: UserProgress, userId?: string): void {
  try {
    const serialized = JSON.stringify(progress);
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
