import React, { useState, useMemo } from 'react';
import { Section, Chapter, UserProgress } from '../types/psychology';
import { BadgeDefinition, BadgeProgressInfo, BadgeCategory } from '../types/badges';
import { BADGE_DEFINITIONS, evaluateBadgeProgress } from '../data/badgeDefinitions';
import { BadgeIcon } from './BadgeIcon';
import { DuoMascot } from './DuoMascot';
import { playDuoSound } from '../utils/duoAudio';
import {
  Award,
  Trophy,
  Sparkles,
  Lock,
  CheckCircle2,
  ChevronLeft,
  BookOpen,
  Zap,
  Flame,
  ArrowRight,
  Filter,
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
  const unlockPercentage = Math.round((unlockedCount / totalCount) * 100);
  const totalEarnedBadgeXp = evaluatedBadges
    .filter((b) => b.isUnlocked)
    .reduce((sum, b) => sum + b.badge.xpReward, 0);

  // User achievement rank
  const userRankTitle = useMemo(() => {
    if (unlockedCount >= 12) return 'استاد اعظم و نابغه‌ی روان‌لینگو 🦉👑';
    if (unlockedCount >= 8) return 'پژوهشگر ارشد بالینی و شناختی 🎖️';
    if (unlockedCount >= 4) return 'دانش‌پژوه پیشرفته روان‌شناسی 🎓';
    return 'کارآموز مستعد مبانی روان‌شناسی 🌱';
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
    <div className="max-w-5xl mx-auto pb-24 flex flex-col gap-6 select-none animate-fadeIn">
      {/* ======================================================== */}
      {/* 1. DUOLINGO TROPHY HALL OF FAME BANNER                   */}
      {/* ======================================================== */}
      <div className="bg-gradient-to-r from-[#FFC800] via-[#FF9600] to-[#E55A00] border-b-6 border-[#C74600] rounded-3xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
        {/* Background decorative stars */}
        <div className="absolute top-2 left-6 text-white/20 text-7xl font-black select-none pointer-events-none">
          ★
        </div>
        <div className="absolute -bottom-6 right-1/3 text-white/10 text-9xl font-black select-none pointer-events-none">
          🏆
        </div>

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-5 text-right">
            <div className="w-20 h-20 rounded-3xl bg-white/20 border-3 border-white/40 flex items-center justify-center shrink-0 shadow-inner">
              <Trophy className="w-12 h-12 text-white fill-amber-100 drop-shadow-md animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider bg-white/25 px-3 py-1 rounded-full inline-block">
                  تالار افتخارات و مدال‌های روان‌لینگو
                </span>
                <span className="text-xs font-black bg-amber-900/30 px-2 py-0.5 rounded-full text-amber-100">
                  {userRankTitle}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black mt-1.5 text-white drop-shadow-xs">
                ویترین مدال‌ها و دستاوردهای علمی
              </h1>
              <p className="text-xs sm:text-sm font-bold text-amber-100 mt-1 max-w-xl">
                با پایان ماژول‌های روان‌شناسی و ثبت رکوردهای تستی، مدال‌های نفیس سه‌بعدی را باز کنید و امتیاز تجربه (XP) بگیرید!
              </p>
            </div>
          </div>

          {/* Stats Capsule */}
          <div className="bg-white/15 backdrop-blur-xs border-2 border-white/30 rounded-2xl p-4 flex items-center gap-6 text-center shrink-0">
            <div>
              <span className="text-2xl sm:text-3xl font-black text-white block">
                {unlockedCount} / {totalCount}
              </span>
              <span className="text-[11px] font-bold text-amber-100">مدال بازگشایی‌شده</span>
            </div>
            <div className="w-px h-10 bg-white/30" />
            <div>
              <span className="text-2xl sm:text-3xl font-black text-amber-200 block flex items-center justify-center gap-1">
                <Sparkles className="w-5 h-5 text-amber-200" />
                {totalEarnedBadgeXp}
              </span>
              <span className="text-[11px] font-bold text-amber-100">امتیاز XP مدال‌ها</span>
            </div>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="mt-6 pt-5 border-t border-white/20">
          <div className="flex items-center justify-between text-xs font-black text-amber-100 mb-2">
            <span>پیشرفت کلی فتح تالار افتخارات</span>
            <span>{unlockPercentage}٪ کامل شده</span>
          </div>
          <div className="w-full h-4 bg-black/20 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-white rounded-full transition-all duration-700 shadow-sm"
              style={{ width: `${unlockPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. CATEGORY FILTER TABS                                  */}
      {/* ======================================================== */}
      <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
          <button
            onClick={() => {
              playDuoSound('click');
              setSelectedCategory('all');
            }}
            className={`px-4 py-2 rounded-2xl text-xs font-black cursor-pointer transition-all whitespace-nowrap flex items-center gap-1.5 ${
              selectedCategory === 'all'
                ? 'duo-btn-green text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border-2 border-slate-200'
            }`}
          >
            <span>همه نشان‌ها</span>
            <span className="text-[10px] bg-black/10 px-1.5 py-0.5 rounded-full">
              {totalCount}
            </span>
          </button>

          <button
            onClick={() => {
              playDuoSound('click');
              setSelectedCategory('modules');
            }}
            className={`px-4 py-2 rounded-2xl text-xs font-black cursor-pointer transition-all whitespace-nowrap flex items-center gap-1.5 ${
              selectedCategory === 'modules'
                ? 'duo-btn-blue text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border-2 border-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>ماژول‌های تخصصی روان‌شناسی</span>
            <span className="text-[10px] bg-black/10 px-1.5 py-0.5 rounded-full">
              {evaluatedBadges.filter((b) => b.badge.category === 'modules').length}
            </span>
          </button>

          <button
            onClick={() => {
              playDuoSound('click');
              setSelectedCategory('quizzes');
            }}
            className={`px-4 py-2 rounded-2xl text-xs font-black cursor-pointer transition-all whitespace-nowrap flex items-center gap-1.5 ${
              selectedCategory === 'quizzes'
                ? 'duo-btn-purple text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border-2 border-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>نقاط عطف آزمون و کوئیز</span>
            <span className="text-[10px] bg-black/10 px-1.5 py-0.5 rounded-full">
              {evaluatedBadges.filter((b) => b.badge.category === 'quizzes').length}
            </span>
          </button>

          <button
            onClick={() => {
              playDuoSound('click');
              setSelectedCategory('streaks_study');
            }}
            className={`px-4 py-2 rounded-2xl text-xs font-black cursor-pointer transition-all whitespace-nowrap flex items-center gap-1.5 ${
              selectedCategory === 'streaks_study'
                ? 'duo-btn-orange text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border-2 border-slate-200'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>عادات و استمرار مطالعه</span>
            <span className="text-[10px] bg-black/10 px-1.5 py-0.5 rounded-full">
              {evaluatedBadges.filter((b) => b.badge.category === 'streaks_study').length}
            </span>
          </button>
        </div>

        {/* Motivational Tip from Duo */}
        <div className="hidden lg:flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-2xl text-xs font-bold text-emerald-800">
          <DuoMascot mood="happy" size={26} animate={false} />
          <span>با کلیک روی هر مدال، جزئیات و راهنمای فتح آن را ببینید!</span>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. BADGES 3D GRID                                        */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBadges.map((bInfo) => {
          const { badge, isUnlocked, currentValue, targetValue, progressPercent, tier } = bInfo;

          return (
            <div
              key={badge.id}
              onClick={() => handleInspectBadge(bInfo)}
              className={`bg-white rounded-3xl p-5 border-2 transition-all cursor-pointer flex flex-col justify-between relative group ${
                isUnlocked
                  ? 'border-b-5 border-emerald-400 hover:border-emerald-500 hover:shadow-md'
                  : 'border-b-4 border-slate-200 hover:border-slate-300 bg-slate-50/50'
              }`}
            >
              {/* Status Ribbon */}
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                    isUnlocked
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {isUnlocked ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>کسب شد ✓</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3 h-3 text-slate-500" />
                      <span>قفل است ({progressPercent}٪)</span>
                    </>
                  )}
                </span>

                {/* XP Pill */}
                <span className="text-[10px] font-black text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-600" />
                  <span>+{badge.xpReward} XP</span>
                </span>
              </div>

              {/* Badge Icon & Graphic */}
              <div className="flex flex-col items-center my-2">
                <div className="transform transition-transform group-hover:scale-110 duration-200">
                  <BadgeIcon
                    type={badge.iconType}
                    isUnlocked={isUnlocked}
                    size={84}
                    tier={tier}
                    showStars={true}
                  />
                </div>

                <h3 className="text-base font-black text-slate-800 mt-3 text-center">
                  {badge.title}
                </h3>
                <span className="text-[11px] font-bold text-slate-400 -mt-0.5">
                  {badge.englishTitle}
                </span>

                <p className="text-xs font-bold text-slate-500 text-center mt-2 leading-relaxed line-clamp-2 px-1">
                  {badge.description}
                </p>
              </div>

              {/* Progress Indicator */}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between text-[11px] font-black text-slate-500 mb-1.5">
                  <span>پیشرفت هدف</span>
                  <span className={isUnlocked ? 'text-emerald-600' : 'text-slate-700'}>
                    {currentValue} / {targetValue} {badge.unitLabel}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isUnlocked
                        ? 'bg-[#58CC02]'
                        : progressPercent > 0
                        ? 'bg-[#1CB0F6]'
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl border-2 border-b-6 border-slate-300 w-full max-w-lg p-6 sm:p-7 text-right shadow-2xl relative">
            <button
              onClick={() => setInspectedBadgeInfo(null)}
              className="absolute top-4 left-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
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
                <span className="text-[11px] font-black uppercase text-slate-400">
                  {inspectedBadgeInfo.badge.englishTitle}
                </span>
                <h3 className="text-xl font-black text-slate-900">
                  {inspectedBadgeInfo.badge.title}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                      inspectedBadgeInfo.isUnlocked
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {inspectedBadgeInfo.isUnlocked ? 'مدال بازگشایی شد ✓' : 'قفل'}
                  </span>
                  <span className="text-xs font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    +{inspectedBadgeInfo.badge.xpReward} XP
                  </span>
                </div>
              </div>
            </div>

            <div className="my-5 p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <h4 className="text-xs font-black text-slate-700 mb-1">شرح ماموریت مدال:</h4>
              <p className="text-xs font-bold text-slate-600 leading-relaxed">
                {inspectedBadgeInfo.badge.description}
              </p>

              <div className="mt-4 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between text-xs font-black text-slate-700 mb-1">
                  <span>وضعیت پیشروی شما:</span>
                  <span>
                    {inspectedBadgeInfo.currentValue} از {inspectedBadgeInfo.targetValue}{' '}
                    {inspectedBadgeInfo.badge.unitLabel}
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#58CC02] rounded-full transition-all"
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
                  className="flex-1 duo-btn-blue py-3 rounded-2xl text-xs font-black cursor-pointer flex items-center justify-center gap-2"
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
                className="flex-1 duo-btn-green py-3 rounded-2xl text-xs font-black cursor-pointer flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" />
                <span>شروع آزمون و کوئیز</span>
              </button>

              <button
                onClick={() => setInspectedBadgeInfo(null)}
                className="px-4 py-3 rounded-2xl border-2 border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-100"
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
