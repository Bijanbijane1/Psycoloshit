import React, { useState, useMemo } from 'react';
import { Section, Chapter, UserProgress } from '../types/psychology';
import { BadgeProgressInfo, BadgeCategory } from '../types/badges';
import { BADGE_DEFINITIONS, evaluateBadgeProgress } from '../data/badgeDefinitions';
import { BadgeIcon } from './BadgeIcon';
import { playDuoSound } from '../utils/duoAudio';
import { toPersianDigits } from '../utils/persianDigits';
import {
  Trophy,
  Sparkles,
  Lock,
  CheckCircle2,
  BookOpen,
  Zap,
  Flame,
} from 'lucide-react';

interface BadgesViewProps {
  sections: Section[];
  progress: UserProgress;
  onSelectChapter: (chapter: Chapter) => void;
  onStartQuiz: (chapter?: Chapter) => void;
}

export const BadgesView: React.FC<BadgesViewProps> = ({
  sections,
  progress,
  onSelectChapter,
  onStartQuiz,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<BadgeCategory | 'all'>('all');
  const [inspectedBadgeInfo, setInspectedBadgeInfo] = useState<BadgeProgressInfo | null>(null);

  // Evaluate all badges
  const evaluatedBadges = useMemo(() => {
    return BADGE_DEFINITIONS.map((badge) => evaluateBadgeProgress(badge, progress, sections));
  }, [progress, sections]);

  // Counts and stats
  const totalCount = evaluatedBadges.length;
  const unlockedCount = evaluatedBadges.filter((b) => b.isUnlocked).length;
  const unlockPercentage = Math.round((unlockedCount / Math.max(1, totalCount)) * 100);
  const totalEarnedBadgeXp = evaluatedBadges
    .filter((b) => b.isUnlocked)
    .reduce((sum, b) => sum + b.badge.xpReward, 0);

  // User achievement rank
  const userRankTitle = useMemo(() => {
    if (unlockedCount >= 12) return 'استاد برجسته روان‌شناسی 👑';
    if (unlockedCount >= 8) return 'پژوهشگر ارشد بالینی و شناختی 🎖️';
    if (unlockedCount >= 4) return 'دانش‌پژوه پیشرفته روان‌شناسی 🎓';
    return 'پژوهشگر مستعد مبانی روان‌شناسی 🌱';
  }, [unlockedCount]);

  // Filtered badges
  const filteredBadges = useMemo(() => {
    if (selectedCategory === 'all') return evaluatedBadges;
    return evaluatedBadges.filter((b) => b.badge.category === selectedCategory);
  }, [evaluatedBadges, selectedCategory]);

  const handleInspectBadge = (bInfo: BadgeProgressInfo) => {
    playDuoSound('click');
    setInspectedBadgeInfo(bInfo);
  };

  return (
    <div className="max-w-5xl mx-auto pb-28 flex flex-col gap-6 select-none animate-fadeIn">
      {/* ======================================================== */}
      {/* 1. EDITORIAL TROPHY HALL OF FAME BANNER                  */}
      {/* ======================================================== */}
      <div className="bg-gradient-to-r from-[#5B4BDB] via-[#4636B5] to-[#372996] rounded-3xl p-5 sm:p-8 text-white shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4 sm:gap-5 text-right">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-white/15 border border-white/30 flex items-center justify-center shrink-0">
              <Trophy className="w-9 h-9 sm:w-11 sm:h-11 text-[#FDE68A] fill-[#FDE68A]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-extrabold tracking-wider bg-white/20 px-3 py-1 rounded-full inline-block">
                  تالار افتخارات و نشان‌های علمی
                </span>
                <span className="text-xs font-extrabold bg-black/20 px-2.5 py-0.5 rounded-full text-[#FDE68A]">
                  {userRankTitle}
                </span>
              </div>
              <h1 className="text-xl sm:text-3xl font-black mt-1.5 text-white">
                ویترین نشان‌ها و دستاوردهای علمی
              </h1>
              <p className="text-xs sm:text-sm font-bold text-white/85 mt-1 max-w-xl leading-relaxed">
                با پایان ماژول‌های روان‌شناسی و ثبت رکوردهای تستی، نشان‌های تخصصی را باز کنید و امتیاز تجربه دریافت نمایید.
              </p>
            </div>
          </div>

          {/* Stats Capsule */}
          <div className="bg-white/15 backdrop-blur-xs border border-white/25 rounded-2xl p-4 flex items-center justify-around sm:justify-center gap-6 text-center w-full md:w-auto shrink-0">
            <div>
              <span className="text-2xl sm:text-3xl font-black text-white block">
                {toPersianDigits(unlockedCount)} / {toPersianDigits(totalCount)}
              </span>
              <span className="text-[11px] font-bold text-white/80">نشان بازگشایی‌شده</span>
            </div>
            <div className="w-px h-10 bg-white/25" />
            <div>
              <span className="text-2xl sm:text-3xl font-black text-[#FDE68A] flex items-center justify-center gap-1">
                <Sparkles className="w-5 h-5 text-[#FDE68A]" />
                {toPersianDigits(totalEarnedBadgeXp)}
              </span>
              <span className="text-[11px] font-bold text-white/80">امتیاز نشان‌ها</span>
            </div>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="mt-6 pt-5 border-t border-white/20">
          <div className="flex items-center justify-between text-xs font-black text-white/90 mb-2">
            <span>پیشرفت کلی فتح تالار افتخارات</span>
            <span>{toPersianDigits(unlockPercentage)}٪ کامل شده</span>
          </div>
          <div className="w-full h-3.5 bg-black/25 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-[#FDE68A] rounded-full transition-all duration-700"
              style={{ width: `${unlockPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. CATEGORY FILTER TABS                                  */}
      {/* ======================================================== */}
      <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 max-w-full">
          <button
            onClick={() => {
              playDuoSound('click');
              setSelectedCategory('all');
            }}
            className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs font-extrabold cursor-pointer transition-all whitespace-nowrap flex items-center gap-1.5 ${
              selectedCategory === 'all'
                ? 'bg-[#5B4BDB] text-white shadow-2xs'
                : 'bg-white text-[#47475E] hover:bg-[#F7F5F0] border border-[#E5E1EB]'
            }`}
          >
            <span>همه نشان‌ها</span>
            <span className="text-[10px] bg-black/10 px-1.5 py-0.5 rounded-full">
              {toPersianDigits(totalCount)}
            </span>
          </button>

          <button
            onClick={() => {
              playDuoSound('click');
              setSelectedCategory('modules');
            }}
            className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs font-extrabold cursor-pointer transition-all whitespace-nowrap flex items-center gap-1.5 ${
              selectedCategory === 'modules'
                ? 'bg-[#0F766E] text-white shadow-2xs'
                : 'bg-white text-[#47475E] hover:bg-[#F7F5F0] border border-[#E5E1EB]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>ماژول‌های تخصصی روان‌شناسی</span>
            <span className="text-[10px] bg-black/10 px-1.5 py-0.5 rounded-full">
              {toPersianDigits(evaluatedBadges.filter((b) => b.badge.category === 'modules').length)}
            </span>
          </button>

          <button
            onClick={() => {
              playDuoSound('click');
              setSelectedCategory('quizzes');
            }}
            className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs font-extrabold cursor-pointer transition-all whitespace-nowrap flex items-center gap-1.5 ${
              selectedCategory === 'quizzes'
                ? 'bg-[#5B4BDB] text-white shadow-2xs'
                : 'bg-white text-[#47475E] hover:bg-[#F7F5F0] border border-[#E5E1EB]'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>نقاط عطف آزمون و کوئیز</span>
            <span className="text-[10px] bg-black/10 px-1.5 py-0.5 rounded-full">
              {toPersianDigits(evaluatedBadges.filter((b) => b.badge.category === 'quizzes').length)}
            </span>
          </button>

          <button
            onClick={() => {
              playDuoSound('click');
              setSelectedCategory('streaks_study');
            }}
            className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs font-extrabold cursor-pointer transition-all whitespace-nowrap flex items-center gap-1.5 ${
              selectedCategory === 'streaks_study'
                ? 'bg-[#D97706] text-white shadow-2xs'
                : 'bg-white text-[#47475E] hover:bg-[#F7F5F0] border border-[#E5E1EB]'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>عادات و استمرار مطالعه</span>
            <span className="text-[10px] bg-black/10 px-1.5 py-0.5 rounded-full">
              {toPersianDigits(evaluatedBadges.filter((b) => b.badge.category === 'streaks_study').length)}
            </span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. BADGES GRID                                           */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBadges.map((bInfo) => {
          const { badge, isUnlocked, currentValue, targetValue, progressPercent, tier } = bInfo;

          return (
            <div
              key={badge.id}
              onClick={() => handleInspectBadge(bInfo)}
              className={`bg-white rounded-3xl p-5 border transition-all cursor-pointer flex flex-col justify-between relative group ${
                isUnlocked
                  ? 'border-[#99F6E4] hover:border-[#0F766E] shadow-2xs'
                  : 'border-[#E5E1EB] hover:border-[#C6BAF0] bg-[#FAF8F5]'
              }`}
            >
              {/* Status Ribbon */}
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                    isUnlocked
                      ? 'bg-[#DDF7F2] text-[#0F766E] border border-[#99F6E4]'
                      : 'bg-[#F7F5F0] text-[#686882] border border-[#E5E1EB]'
                  }`}
                >
                  {isUnlocked ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-[#0F766E]" />
                      <span>کسب شد ✓</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3 h-3 text-[#686882]" />
                      <span>قفل است ({toPersianDigits(progressPercent)}٪)</span>
                    </>
                  )}
                </span>

                {/* XP Pill */}
                <span className="text-[10px] font-black text-[#92400E] bg-[#FFF6D6] border border-[#FDE68A] px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#D97706]" />
                  <span>+{toPersianDigits(badge.xpReward)} امتیاز</span>
                </span>
              </div>

              {/* Badge Icon & Graphic */}
              <div className="flex flex-col items-center my-2">
                <div className="transform transition-transform group-hover:scale-105 duration-200">
                  <BadgeIcon
                    type={badge.iconType}
                    isUnlocked={isUnlocked}
                    size={84}
                    tier={tier}
                    showStars={true}
                  />
                </div>

                <h3 className="text-base font-black text-[#1E1E2E] mt-3 text-center">
                  {badge.title}
                </h3>
                <span className="text-[11px] font-bold text-[#686882] -mt-0.5" dir="ltr">
                  {badge.englishTitle}
                </span>

                <p className="text-xs font-bold text-[#47475E] text-center mt-2 leading-relaxed line-clamp-2 px-1">
                  {badge.description}
                </p>
              </div>

              {/* Progress Indicator */}
              <div className="mt-4 pt-3 border-t border-[#E5E1EB]">
                <div className="flex items-center justify-between text-[11px] font-black text-[#686882] mb-1.5">
                  <span>پیشرفت هدف</span>
                  <span className={isUnlocked ? 'text-[#0F766E]' : 'text-[#24243B]'}>
                    {toPersianDigits(currentValue)} / {toPersianDigits(targetValue)} {badge.unitLabel}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-[#F7F5F0] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isUnlocked
                        ? 'bg-[#0F766E]'
                        : progressPercent > 0
                        ? 'bg-[#5B4BDB]'
                        : 'bg-transparent'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* 4. INSPECTION MODAL                                      */}
      {/* ======================================================== */}
      {inspectedBadgeInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1E1E2E]/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl border border-[#E5E1EB] w-full max-w-lg p-6 sm:p-7 text-right shadow-2xl relative">
            <button
              onClick={() => setInspectedBadgeInfo(null)}
              className="absolute top-4 left-4 min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-[#686882] hover:text-[#1E1E2E] rounded-full hover:bg-[#F7F5F0] cursor-pointer"
              aria-label="بستن"
            >
              ✕
            </button>

            <div className="flex items-center gap-4">
              <BadgeIcon
                type={inspectedBadgeInfo.badge.iconType}
                isUnlocked={inspectedBadgeInfo.isUnlocked}
                size={84}
                tier={inspectedBadgeInfo.tier}
                showStars={true}
              />
              <div>
                <span className="text-[11px] font-bold uppercase text-[#686882]" dir="ltr">
                  {inspectedBadgeInfo.badge.englishTitle}
                </span>
                <h3 className="text-xl font-black text-[#1E1E2E]">
                  {inspectedBadgeInfo.badge.title}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                      inspectedBadgeInfo.isUnlocked
                        ? 'bg-[#DDF7F2] text-[#0F766E]'
                        : 'bg-[#F7F5F0] text-[#686882]'
                    }`}
                  >
                    {inspectedBadgeInfo.isUnlocked ? 'نشان بازگشایی شد ✓' : 'قفل'}
                  </span>
                  <span className="text-xs font-black text-[#92400E] bg-[#FFF6D6] px-2.5 py-0.5 rounded-full border border-[#FDE68A]">
                    +{toPersianDigits(inspectedBadgeInfo.badge.xpReward)} امتیاز
                  </span>
                </div>
              </div>
            </div>

            <div className="my-5 p-4 rounded-2xl bg-[#FAF8F5] border border-[#E5E1EB]">
              <h4 className="text-xs font-black text-[#1E1E2E] mb-1">شرح ماموریت نشان:</h4>
              <p className="text-xs font-bold text-[#47475E] leading-relaxed">
                {inspectedBadgeInfo.badge.description}
              </p>

              <div className="mt-4 pt-3 border-t border-[#E5E1EB]">
                <div className="flex items-center justify-between text-xs font-black text-[#24243B] mb-1.5">
                  <span>وضعیت پیشروی شما:</span>
                  <span>
                    {toPersianDigits(inspectedBadgeInfo.currentValue)} از {toPersianDigits(inspectedBadgeInfo.targetValue)}{' '}
                    {inspectedBadgeInfo.badge.unitLabel}
                  </span>
                </div>
                <div className="w-full h-3 bg-[#E5E1EB] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#0F766E] rounded-full transition-all"
                    style={{ width: `${inspectedBadgeInfo.progressPercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Quick action buttons depending on category */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              {inspectedBadgeInfo.badge.moduleSectionId ? (
                <button
                  onClick={() => {
                    const sec = sections.find((s) => s.id === inspectedBadgeInfo.badge.moduleSectionId);
                    if (sec && sec.chapters.length > 0) {
                      onSelectChapter(sec.chapters[0]);
                      setInspectedBadgeInfo(null);
                    }
                  }}
                  className="flex-1 min-h-[44px] bg-[#0F766E] hover:bg-[#115E59] text-white py-3 rounded-2xl text-xs font-extrabold cursor-pointer flex items-center justify-center gap-2 transition-colors"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>مطالعه فصل‌های این ماژول</span>
                </button>
              ) : null}

              <button
                onClick={() => {
                  onStartQuiz();
                  setInspectedBadgeInfo(null);
                }}
                className="flex-1 min-h-[44px] bg-[#5B4BDB] hover:bg-[#4636B5] text-white py-3 rounded-2xl text-xs font-extrabold cursor-pointer flex items-center justify-center gap-2 transition-colors"
              >
                <Zap className="w-4 h-4" />
                <span>شروع آزمون و کوئیز</span>
              </button>

              <button
                onClick={() => setInspectedBadgeInfo(null)}
                className="min-h-[44px] px-4 py-3 rounded-2xl border border-[#E5E1EB] text-[#47475E] text-xs font-bold hover:bg-[#F7F5F0] cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

