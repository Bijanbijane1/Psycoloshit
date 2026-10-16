import { BadgeDefinition, BadgeProgressInfo } from '../types/badges';
import { Section, UserProgress } from '../types/psychology';

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // ----------------------------------------------------
  // 1. PSYCHOLOGY MODULE COMPLETION BADGES
  // ----------------------------------------------------
  {
    id: 'badge-module-1',
    title: 'بنیان‌گذار روان‌شناسی',
    englishTitle: 'Foundations Pioneer',
    description: 'تکمیل تمامی سرفصل‌های بخش اول (مبانی، تاریخچه، معرفت‌شناسی و وونت)',
    category: 'modules',
    iconType: 'foundations',
    accentColor: '#58CC02', // Duolingo Green
    xpReward: 100,
    targetCount: 1, // 1 module completed
    unitLabel: 'فصل‌های بخش ۱',
    moduleSectionId: 1,
  },
  {
    id: 'badge-module-2',
    title: 'عصب‌پژوه تیزبین',
    englishTitle: 'Neuroscience Explorer',
    description: 'مطالعه و تسلط بر ماژول مبانی زیستی رفتار و ساختار نورونی مغز',
    category: 'modules',
    iconType: 'neuroscience',
    accentColor: '#1CB0F6', // Duolingo Cyan
    xpReward: 120,
    targetCount: 1,
    unitLabel: 'فصل‌های بخش ۲',
    moduleSectionId: 2,
  },
  {
    id: 'badge-module-4',
    title: 'معمار شناخت و حافظه',
    englishTitle: 'Cognitive Architect',
    description: 'تکمیل کامل ماژول یادگیری، شناخت و پردازش اطلاعات انسان',
    category: 'modules',
    iconType: 'cognition',
    accentColor: '#CE82FF', // Duolingo Purple
    xpReward: 150,
    targetCount: 1,
    unitLabel: 'فصل‌های بخش ۴',
    moduleSectionId: 4,
  },
  {
    id: 'badge-module-9',
    title: 'کارآگاه آسیب‌شناسی روانی',
    englishTitle: 'Pathology Detective',
    description: 'رمزگشایی از اختلالات روانی و ملاک‌های تشخیصی DSM در ماژول ۹',
    category: 'modules',
    iconType: 'pathology',
    accentColor: '#FF4B4B', // Duolingo Rose Red
    xpReward: 180,
    targetCount: 1,
    unitLabel: 'فصل‌های بخش ۹',
    moduleSectionId: 9,
  },
  {
    id: 'badge-module-10',
    title: 'شفابخش بالینی',
    englishTitle: 'Clinical Healer',
    description: 'تسلط بر رویکردهای روان‌درمانی، CBT و مداخلات شناختی-رفتاری',
    category: 'modules',
    iconType: 'clinical',
    accentColor: '#2B70C9', // Duolingo Royal Blue
    xpReward: 200,
    targetCount: 1,
    unitLabel: 'فصل‌های بخش ۱۰',
    moduleSectionId: 10,
  },
  {
    id: 'badge-all-modules',
    title: 'استاد اعظم روان‌شناسی',
    englishTitle: 'Grandmaster of Psychology',
    description: 'مطالعه کامل حداقل ۸ ماژول از دوازده گانه جامع دانشگاهی',
    category: 'mastery',
    iconType: 'grandmaster',
    accentColor: '#FFC800', // Duolingo Gold
    xpReward: 500,
    targetCount: 8,
    unitLabel: 'ماژول کامل',
  },

  // ----------------------------------------------------
  // 2. QUIZ MILESTONES & ACCURACY BADGES
  // ----------------------------------------------------
  {
    id: 'badge-first-quiz',
    title: 'نخستین پیروزی تستی',
    englishTitle: 'First Quiz Spark',
    description: 'پاسخ صحیح به نخستین سوال تستی در هر یک از آزمون‌ها',
    category: 'quizzes',
    iconType: 'first_quiz',
    accentColor: '#58CC02',
    xpReward: 50,
    targetCount: 1,
    unitLabel: 'پاسخ صحیح',
  },
  {
    id: 'badge-quiz-5',
    title: 'پژوهشگر کوشا',
    englishTitle: 'Active Researcher',
    description: 'حل و ثبت ۵ تست تشخیصی یا چهارگزینه‌ای در کوئیز سنتر',
    category: 'quizzes',
    iconType: 'quiz_specialist',
    accentColor: '#1CB0F6',
    xpReward: 80,
    targetCount: 5,
    unitLabel: 'سوال کوئیز',
  },
  {
    id: 'badge-quiz-15',
    title: 'متخصص آزمون‌های بالینی',
    englishTitle: 'Quiz Specialist',
    description: 'پاسخ موفق به ۱۵ پرسش در انواع فرمت‌های کوئیز',
    category: 'quizzes',
    iconType: 'quiz_specialist',
    accentColor: '#FF9600',
    xpReward: 150,
    targetCount: 15,
    unitLabel: 'سوال کوئیز',
  },
  {
    id: 'badge-sharpshooter',
    title: 'تیرانداز دقیق (بی‌خطا)',
    englishTitle: 'Sharpshooter',
    description: 'رسیدن به دقت بالای ۸۰٪ در حداقل یک سری آزمون ۵ سوالی',
    category: 'quizzes',
    iconType: 'sharpshooter',
    accentColor: '#58CC02',
    xpReward: 120,
    targetCount: 1,
    unitLabel: 'کوییز بی‌نقص',
  },
  {
    id: 'badge-match-master',
    title: 'استاد اتصال مفاهیم',
    englishTitle: 'Match Master',
    description: 'اتصال موفق جفت‌های واژگان و دانشمندان در کویز سبک Duolingo',
    category: 'quizzes',
    iconType: 'match_master',
    accentColor: '#CE82FF',
    xpReward: 100,
    targetCount: 1,
    unitLabel: 'تطبیق موفق',
  },
  {
    id: 'badge-speed-demon',
    title: 'صاعقه هوش',
    englishTitle: 'Speed Intellect',
    description: 'پاسخ درست به سوال تستی در کمتر از ۱۰ ثانیه با تمرکز بالا',
    category: 'quizzes',
    iconType: 'speed_demon',
    accentColor: '#FFC800',
    xpReward: 90,
    targetCount: 1,
    unitLabel: 'پاسخ پرسرعت',
  },

  // ----------------------------------------------------
  // 3. STREAKS, NOTES & HABITS BADGES
  // ----------------------------------------------------
  {
    id: 'badge-streak-3',
    title: 'آتشدان ۳ روزه',
    englishTitle: 'Wildfire Flame',
    description: 'حفظ پیوسته زنجیره یادگیری روزانه برای ۳ روز متوالی',
    category: 'streaks_study',
    iconType: 'wildfire',
    accentColor: '#FF9600',
    xpReward: 80,
    targetCount: 3,
    unitLabel: 'روز زنجیره',
  },
  {
    id: 'badge-notes-master',
    title: 'نکته‌سنج دانشمند',
    englishTitle: 'Master Scribe',
    description: 'یادداشت‌برداری مفهومی در دفترچه اختصاصی حداقل برای ۲ فصل',
    category: 'streaks_study',
    iconType: 'notes_master',
    accentColor: '#2B70C9',
    xpReward: 70,
    targetCount: 2,
    unitLabel: 'یادداشت فصل',
  },
  {
    id: 'badge-diamond-champ',
    title: 'قهرمان لیگ الماس',
    englishTitle: 'Diamond Champion',
    description: 'کسب بیش از ۵۰۰ امتیاز XP و ایستادن در صدر جدول رقابت‌ها',
    category: 'mastery',
    iconType: 'diamond_champ',
    accentColor: '#1CB0F6',
    xpReward: 250,
    targetCount: 500,
    unitLabel: 'امتیاز XP',
  },
];

/**
 * Calculates user's progress and unlock state for a specific badge definition
 */
export function evaluateBadgeProgress(
  badge: BadgeDefinition,
  progress: UserProgress,
  sections: Section[]
): BadgeProgressInfo {
  let currentValue = 0;
  const targetValue = badge.targetCount;
  let isUnlocked = false;

  const quizHistory = progress.quizHistory || [];
  const correctCount = quizHistory.filter((h) => h.isCorrect).length;

  switch (badge.id) {
    case 'badge-module-1':
    case 'badge-module-2':
    case 'badge-module-4':
    case 'badge-module-9':
    case 'badge-module-10': {
      const section = sections.find((s) => s.id === badge.moduleSectionId);
      if (section) {
        const secChapterIds = section.chapters.map((c) => c.id);
        const completedInSec = secChapterIds.filter((cid) =>
          progress.completedChapters.includes(cid)
        );
        currentValue = completedInSec.length;
        const totalInSec = secChapterIds.length;
        // Unlocked if all chapters in section are done, or at least 1 if only 1 exists
        isUnlocked = completedInSec.length >= Math.max(1, totalInSec);
        return {
          badge,
          isUnlocked,
          currentValue: completedInSec.length,
          targetValue: totalInSec,
          progressPercent: Math.min(100, Math.round((completedInSec.length / totalInSec) * 100)),
          tier: isUnlocked ? 3 : completedInSec.length > 0 ? 1 : 1,
        };
      }
      break;
    }

    case 'badge-all-modules': {
      // Counts how many sections have at least one completed chapter
      const completedSections = sections.filter((sec) =>
        sec.chapters.some((c) => progress.completedChapters.includes(c.id))
      );
      currentValue = completedSections.length;
      isUnlocked = currentValue >= targetValue;
      break;
    }

    case 'badge-first-quiz': {
      currentValue = correctCount;
      isUnlocked = correctCount >= 1;
      break;
    }

    case 'badge-quiz-5': {
      currentValue = quizHistory.length;
      isUnlocked = quizHistory.length >= 5;
      break;
    }

    case 'badge-quiz-15': {
      currentValue = quizHistory.length;
      isUnlocked = quizHistory.length >= 15;
      break;
    }

    case 'badge-sharpshooter': {
      const accuracy = quizHistory.length > 0 ? (correctCount / quizHistory.length) * 100 : 0;
      currentValue = Math.round(accuracy);
      isUnlocked = quizHistory.length >= 3 && accuracy >= 80;
      break;
    }

    case 'badge-match-master': {
      // Check if any match_pairs question was answered correctly
      const solvedPairs = quizHistory.some((h) => {
        const q = sections.flatMap((s) => s.chapters).flatMap((c) => c.questions).find((q) => q.id === h.questionId);
        return q?.type === 'match_pairs' && h.isCorrect;
      });
      currentValue = solvedPairs ? 1 : 0;
      isUnlocked = solvedPairs;
      break;
    }

    case 'badge-speed-demon': {
      const fastCorrect = quizHistory.some((h) => h.isCorrect && (h.timeSpentSeconds || 15) <= 10);
      currentValue = fastCorrect ? 1 : 0;
      isUnlocked = fastCorrect;
      break;
    }

    case 'badge-streak-3': {
      currentValue = progress.streakDays || 1;
      isUnlocked = (progress.streakDays || 1) >= 3;
      break;
    }

    case 'badge-notes-master': {
      const notesCount = Object.keys(progress.chapterNotes || {}).filter(
        (k) => progress.chapterNotes[k]?.trim().length > 0
      ).length;
      currentValue = notesCount;
      isUnlocked = notesCount >= targetValue;
      break;
    }

    case 'badge-diamond-champ': {
      // Calculate XP from completed chapters & quiz
      const totalXp = (progress.completedChapters.length * 20) + (correctCount * 15);
      currentValue = totalXp;
      isUnlocked = totalXp >= targetValue;
      break;
    }

    default:
      currentValue = 0;
      isUnlocked = false;
  }

  // Also check if explicitly unlocked in progress.unlockedBadgeIds
  if (progress.unlockedBadgeIds?.includes(badge.id)) {
    isUnlocked = true;
  }

  const progressPercent = Math.min(
    100,
    targetValue > 0 ? Math.round((currentValue / targetValue) * 100) : 0
  );

  const tier: 1 | 2 | 3 = isUnlocked ? 3 : progressPercent >= 50 ? 2 : 1;

  return {
    badge,
    isUnlocked,
    currentValue,
    targetValue,
    progressPercent,
    tier,
  };
}

/**
 * Returns all evaluated badges for the user
 */
export function getAllBadgeProgress(
  progress: UserProgress,
  sections: Section[]
): BadgeProgressInfo[] {
  return BADGE_DEFINITIONS.map((badge) => evaluateBadgeProgress(badge, progress, sections));
}

/**
 * Checks for any newly unlocked badges that were not previously unlocked
 */
export function findNewlyUnlockedBadges(
  prevUnlockedIds: string[],
  currentProgress: UserProgress,
  sections: Section[]
): BadgeDefinition[] {
  const currentBadges = getAllBadgeProgress(currentProgress, sections);
  const newlyUnlocked: BadgeDefinition[] = [];

  for (const b of currentBadges) {
    if (b.isUnlocked && !prevUnlockedIds.includes(b.badge.id)) {
      newlyUnlocked.push(b.badge);
    }
  }

  return newlyUnlocked;
}
