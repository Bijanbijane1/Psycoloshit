import { DifficultyLevel, UserProgress } from '../types/psychology';
import { psychologySections } from '../data/psychologyCurriculum';

export interface PerformanceStats {
  totalAttempts: number;
  correctCount: number;
  incorrectCount: number;
  accuracyRate: number; // 0 to 100
  averageTimeSeconds: number;
  overallMastery: number; // 0 to 100
  recommendedDifficulty: DifficultyLevel;
  retentionScore: number;
  weakestSectionIds: number[];
  weakestChapterIds: string[];
}

export function calculateUserAnalytics(progress: UserProgress): PerformanceStats {
  const history = progress.quizHistory || [];
  const totalAttempts = history.length;
  
  if (totalAttempts === 0) {
    return {
      totalAttempts: 0,
      correctCount: 0,
      incorrectCount: 0,
      accuracyRate: 0,
      averageTimeSeconds: 0,
      overallMastery: 0,
      recommendedDifficulty: progress.customSettings.preferredDifficulty || 'intermediate',
      retentionScore: 0,
      weakestSectionIds: [],
      weakestChapterIds: [],
    };
  }

  const correctCount = history.filter((h) => h.isCorrect).length;
  const incorrectCount = totalAttempts - correctCount;
  const accuracyRate = Math.round((correctCount / totalAttempts) * 100);
  
  const totalTime = history.reduce((sum, h) => sum + (h.timeSpentSeconds || 15), 0);
  const averageTimeSeconds = Math.round(totalTime / totalAttempts);

  // Group by chapter to identify weak chapters
  const chapterStats: Record<string, { total: number; correct: number }> = {};
  history.forEach((h) => {
    if (!chapterStats[h.chapterId]) {
      chapterStats[h.chapterId] = { total: 0, correct: 0 };
    }
    chapterStats[h.chapterId].total += 1;
    if (h.isCorrect) chapterStats[h.chapterId].correct += 1;
  });

  const weakChapterIds = Object.entries(chapterStats)
    .filter(([_, stats]) => stats.total >= 1 && (stats.correct / stats.total) < 0.65)
    .sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total))
    .map(([id]) => id);

  // Weakest sections
  const sectionMistakes: Record<number, number> = {};
  history.forEach((h) => {
    if (!h.isCorrect) {
      const chapter = psychologySections
        .flatMap((s) => s.chapters)
        .find((c) => c.id === h.chapterId);
      if (chapter) {
        sectionMistakes[chapter.sectionId] = (sectionMistakes[chapter.sectionId] || 0) + 1;
      }
    }
  });

  const weakestSectionIds = Object.entries(sectionMistakes)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([secId]) => Number(secId));

  // Adaptive difficulty logic:
  let recommendedDifficulty: DifficultyLevel = 'intermediate';
  if (accuracyRate >= 80 && averageTimeSeconds < 35) {
    recommendedDifficulty = 'advanced';
  } else if (accuracyRate < 55) {
    recommendedDifficulty = 'basic';
  } else {
    recommendedDifficulty = 'intermediate';
  }

  // Calculate overall curriculum mastery:
  // Combined weight of reading completed (40%) + quiz accuracy (60%)
  const allChapters = psychologySections.flatMap((s) => s.chapters);
  const readRatio = (progress.completedChapters.length / allChapters.length) * 100;
  const overallMastery = Math.min(
    100,
    Math.round(readRatio * 0.4 + accuracyRate * 0.6)
  );

  const retentionScore = Math.min(
    100,
    Math.round(accuracyRate * 0.7 + (progress.streakDays * 5))
  );

  return {
    totalAttempts,
    correctCount,
    incorrectCount,
    accuracyRate,
    averageTimeSeconds,
    overallMastery,
    recommendedDifficulty,
    retentionScore,
    weakestSectionIds,
    weakestChapterIds: weakChapterIds,
  };
}

export function generatePersonalizedRecommendations(
  stats: PerformanceStats,
  progress: UserProgress
): {
  headline: string;
  advice: string;
  actionChapterId: string;
  actionTitle: string;
} {
  const allChapters = psychologySections.flatMap((s) => s.chapters);

  // If there are weak chapters, suggest the first one
  if (stats.weakestChapterIds.length > 0) {
    const target = allChapters.find((c) => c.id === stats.weakestChapterIds[0]);
    if (target) {
      return {
        headline: 'تمرکز تطبیقی بر رفع اشکال',
        advice: `بر اساس الگوی پاسخ‌دهی شما، دقت در مبحث "${target.title}" نیاز به تقویت دارد. پیشنهاد سیستم: مطالعه مجدد در حالت "متن ساده" و حل تست‌های تشریحی.`,
        actionChapterId: target.id,
        actionTitle: `مرور ${target.chapterNumber}: ${target.title}`,
      };
    }
  }

  // Find next unread chapter
  const unreadChapter = allChapters.find(
    (c) => !progress.completedChapters.includes(c.id)
  );

  if (unreadChapter) {
    return {
      headline: 'ادامه گام‌به‌گام سرفصل‌های مرجع',
      advice: `مسیر پیشرفت شما عالی است! سرفصل بعدی آماده مطالعه و آزمون است: "${unreadChapter.title}".`,
      actionChapterId: unreadChapter.id,
      actionTitle: `مطالعه ${unreadChapter.chapterNumber}: ${unreadChapter.title}`,
    };
  }

  // All completed
  const firstChapter = allChapters[0];
  return {
    headline: 'تسلط ممتاز بر تمامی مباحث مرجع!',
    advice: 'شما تمام سرفصل‌های ۱۲ گانه را مرور کرده‌اید. برای ماندگاری طولانی‌مدت، آزمون جامع شبیه‌ساز را اجرا کنید.',
    actionChapterId: firstChapter.id,
    actionTitle: 'مرور جامع آزمون‌های تحلیلی',
  };
}
