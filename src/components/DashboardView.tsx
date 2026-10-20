import React, { useState, useMemo } from 'react';
import { Section, Chapter, UserProgress, DuolingoStage, StageCompletionRecord } from '../types/psychology';
import { calculateUserAnalytics } from '../utils/adaptiveEngine';
import {
  BookOpen,
  Zap,
  Lock,
  Check,
  Star,
  Award,
  Flame,
  ChevronLeft,
  X,
  Layers,
  ShieldCheck,
  RotateCcw,
  CloudOff,
  RefreshCw,
  AlertTriangle,
  Clock,
  ArrowLeft,
  Compass,
  Sparkles,
  User,
  Target,
} from 'lucide-react';
import { BadgeIcon } from './BadgeIcon';
import { BADGE_DEFINITIONS, evaluateBadgeProgress } from '../data/badgeDefinitions';
import { playDuoSound } from '../utils/duoAudio';
import { stageExecutionEngine } from '../services/stageExecutionEngine';
import { DuolingoStageModal } from './DuolingoStageModal';
import { submitStageOrQuizReward } from '../utils/cloudSync';
import { toPersianDigits } from '../utils/persianDigits';
import { LearningSubMode } from './LearningView';

interface DashboardViewProps {
  sections: Section[];
  progress: UserProgress;
  currentChapter?: Chapter;
  onSelectChapter: (chapter: Chapter) => void;
  onStartQuiz: (chapter?: Chapter) => void;
  onOpenNotes: () => void;
  onOpenBadges?: () => void;
  onOpenLearning?: (subMode?: LearningSubMode) => void;
  onOpenMentor?: () => void;
  onOpenUserPanel?: () => void;
  onCompleteStage?: (record: StageCompletionRecord) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  sections,
  progress,
  currentChapter,
  onSelectChapter,
  onStartQuiz,
  onOpenNotes,
  onOpenBadges,
  onOpenLearning,
  onOpenMentor,
  onOpenUserPanel,
  onCompleteStage,
}) => {
  const stats = calculateUserAnalytics(progress);

  // Stage modal states for launching "Continue Learning" directly from Home
  const [activeStage, setActiveStage] = useState<DuolingoStage | null>(null);
  const [isStageModalOpen, setIsStageModalOpen] = useState<boolean>(false);
  const [isStageLockedState, setIsStageLockedState] = useState<boolean>(false);
  const [previewStage, setPreviewStage] = useState<DuolingoStage | null>(null);

  const allStages = useMemo(() => stageExecutionEngine.getSortedStages(), []);

  const completedStagesMap = progress.completedStages || {};
  const completedStageNumbers = Object.keys(completedStagesMap).map(Number);
  const completedStageCount = completedStageNumbers.length;
  const verifiedStageCount = completedStageNumbers.filter((num) => {
    const rec = completedStagesMap[num];
    return Boolean(rec?.verified === true || rec?.source === 'online-verified');
  }).length;
  const offlineLocalStageCount = Math.max(0, completedStageCount - verifiedStageCount);
  const currentUnlockedStageNumber = stageExecutionEngine.calculateUnlockedStageNumber(
    progress.completedStages
  );
  const [verifyingStageNum, setVerifyingStageNum] = useState<number | null>(null);
  const [verifyFeedbackMsg, setVerifyFeedbackMsg] = useState<string | null>(null);

  const currentActiveStage = useMemo(() => {
    return (
      allStages.find((s) => s.stageNumber === currentUnlockedStageNumber) || allStages[0]
    );
  }, [allStages, currentUnlockedStageNumber]);

  const evaluatedBadges = BADGE_DEFINITIONS.map((b) =>
    evaluateBadgeProgress(b, progress, sections)
  );
  const unlockedBadges = evaluatedBadges.filter((b) => b.isUnlocked);

  const allChapters = useMemo(() => sections.flatMap((s) => s.chapters), [sections]);
  const recommendedChapter = useMemo(() => {
    if (progress.pinnedChapters.length > 0) {
      const pinned = allChapters.find((c) => c.id === progress.pinnedChapters[0]);
      if (pinned) return pinned;
    }
    if (currentChapter) return currentChapter;
    const firstIncomplete = allChapters.find((c) => !progress.completedChapters.includes(c.id));
    return firstIncomplete || allChapters[0];
  }, [allChapters, progress.pinnedChapters, progress.completedChapters, currentChapter]);

  const handleStageClick = (stage: DuolingoStage) => {
    playDuoSound('click');
    setPreviewStage(stage);
  };

  const handleLaunchStage = (stage: DuolingoStage) => {
    setPreviewStage(null);
    const prereqCheck = stageExecutionEngine.isStagePrerequisiteMet(
      stage.stageNumber,
      progress.completedStages
    );
    if (!prereqCheck.isMet) {
      playDuoSound('wrong');
      setActiveStage(stage);
      setIsStageLockedState(true);
      setIsStageModalOpen(true);
      return;
    }

    playDuoSound('click');
    setActiveStage(stage);
    setIsStageLockedState(false);
    setIsStageModalOpen(true);
  };

  const handleStartNextStage = (nextStageNumber: number) => {
    const nextSt = allStages.find((s) => s.stageNumber === nextStageNumber);
    if (nextSt) {
      setActiveStage(nextSt);
      setIsStageLockedState(false);
      setIsStageModalOpen(true);
    } else {
      setIsStageModalOpen(false);
    }
  };

  const handleVerifyStageOnlineClick = async (
    stage: DuolingoStage,
    rec?: StageCompletionRecord
  ) => {
    playDuoSound('click');
    setVerifyFeedbackMsg(null);
    if (rec?.stageAnswers && Object.keys(rec.stageAnswers).length > 0) {
      setVerifyingStageNum(stage.stageNumber);
      const res = await submitStageOrQuizReward(
        {
          rewardType: 'stage_completion',
          stageNumber: stage.stageNumber,
          stars: rec.stars,
          score: rec.score,
          totalQuestions: rec.totalQuestions,
          xpEarned: rec.xpEarned,
          stageAnswers: rec.stageAnswers,
          idempotencyKey: `verify_stage_${stage.stageNumber}_${rec.completedAt || 'local'}`,
        },
        progress.streakDays
      );
      setVerifyingStageNum(null);
      if (res.ok) {
        if (onCompleteStage) {
          onCompleteStage({
            ...rec,
            verified: true,
            source: 'online-verified',
          });
        }
        setVerifyFeedbackMsg('تأیید شده در سرور (امتیاز ثبت شد)');
        return;
      }
      if (res.code === 'PREREQUISITE_NOT_MET') {
        setVerifyFeedbackMsg(
          'مرحله قبلی در حالت آفلاین تکمیل شده است. برای ثبت امتیاز (XP) در لیدربورد جهانی، ابتدا مرحله قبلی را به صورت آنلاین تأیید کنید.'
        );
        return;
      }
    }
    handleLaunchStage(stage);
  };

  const overallProgressPercent = Math.round((completedStageCount / 100) * 100);

  return (
    <div className="space-y-6 pb-20">
      {/* ================================================================== */}
      {/* 1. CALM EDITORIAL WELCOME & DAILY STUDY COCKPIT HEADER             */}
      {/* ================================================================== */}
      <section aria-label="میز کار روزانه و ادامه یادگیری" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-2.5 border-b border-[#E5E1EB]">
          <div>
            <span className="text-xs font-extrabold tracking-wide text-[#7056D8] block mb-1">
              استودیو دیجیتال آموزش و کنکور روان‌شناسی
            </span>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-[#24243B] leading-tight">
              میز کار مطالعه روزانه شما
            </h1>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFF0C8] border border-[#E5A33D]/40 text-xs font-extrabold text-[#5C3D0E]">
              <Flame className="w-3.5 h-3.5 text-[#E5A33D] fill-[#E5A33D]" />
              <span>{toPersianDigits(progress.streakDays)} روز پیوستگی</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EAE4FF] border border-[#7056D8]/30 text-xs font-extrabold text-[#36345F]">
              <Target className="w-3.5 h-3.5 text-[#7056D8]" />
              <span>ایستگاه فعلی: درس {toPersianDigits(currentUnlockedStageNumber)}</span>
            </span>
          </div>
        </div>

        {/* ================================================================ */}
        {/* 2. DOMINANT "CONTINUE LEARNING" HERO CARD                        */}
        {/* ================================================================ */}
        <div className="rounded-3xl bg-[#36345F] text-white p-5 sm:p-7 border border-[#24243B] shadow-sm relative overflow-hidden">
          <svg
            className="hidden md:block absolute left-0 top-0 h-full w-64 pointer-events-none opacity-20"
            viewBox="0 0 240 220"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="60" cy="110" r="85" stroke="#EAE4FF" strokeWidth="2" />
            <circle cx="95" cy="110" r="55" fill="#7056D8" fillOpacity="0.45" />
            <circle cx="40" cy="70" r="28" fill="#149D9A" fillOpacity="0.55" />
            <circle cx="75" cy="150" r="14" fill="#E5A33D" fillOpacity="0.8" />
          </svg>

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl text-right">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#7056D8] text-white text-[11px] font-extrabold">
                  <span>بهترین گام بعدی شما</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/12 text-[#EAE4FF] text-[11px] font-bold">
                  <span>
                    واحد {toPersianDigits(currentActiveStage?.unitIndex || 1)} ·{' '}
                    {currentActiveStage?.unitTitle}
                  </span>
                </span>
              </div>

              <h2 className="text-lg sm:text-2xl font-black text-white leading-snug">
                درس {toPersianDigits(currentUnlockedStageNumber)}: {currentActiveStage?.title}
              </h2>

              {currentActiveStage?.keyTakeaway && (
                <p className="text-xs sm:text-sm text-[#EAE4FF]/90 font-medium leading-relaxed max-w-xl">
                  {currentActiveStage.keyTakeaway}
                </p>
              )}

              {/* Overall Curriculum Progress & Provenance Status */}
              <div className="pt-2 space-y-2.5 max-w-lg">
                <div className="flex items-center justify-between text-xs font-bold text-[#EAE4FF]">
                  <span>
                    پیشرفت کل برنامه: {toPersianDigits(completedStageCount)} از ۱۰۰ درس (
                    {toPersianDigits(overallProgressPercent)}٪)
                  </span>
                  <span className="text-[#FFF0C8]">
                    +{toPersianDigits(currentActiveStage?.xpReward || 25)} XP پاداش این درس
                  </span>
                </div>

                <div className="w-full h-2.5 bg-white/15 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#E5A33D] rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(3, overallProgressPercent)}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#DDF3E9] text-[#134E4A] text-[11px] font-extrabold">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#389D77] shrink-0" />
                    <span>
                      تأیید شده در سرور (امتیاز ثبت شد): {toPersianDigits(verifiedStageCount)}
                    </span>
                  </span>
                  {offlineLocalStageCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#FFF0C8] text-[#5C3D0E] text-[11px] font-extrabold">
                      <CloudOff className="w-3.5 h-3.5 text-[#C98A27] shrink-0" />
                      <span>
                        ذخیره محلی/آفلاین (بدون امتیاز لیدربورد):{' '}
                        {toPersianDigits(offlineLocalStageCount)}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Single Dominant Primary Action + Full Curriculum Link */}
            <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2.5 shrink-0">
              <button
                onClick={() => handleLaunchStage(currentActiveStage)}
                className="px-6 py-3.5 rounded-2xl bg-[#E5A33D] hover:bg-[#D8962E] text-[#24243B] text-sm font-black cursor-pointer flex items-center justify-center gap-2.5 shadow-sm transition-colors min-h-[48px]"
              >
                <span>ادامه درس فعلی · درس {toPersianDigits(currentUnlockedStageNumber)}</span>
                <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => handleStageClick(currentActiveStage)}
                  className="flex-1 sm:flex-initial px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-[#EAE4FF] text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5 transition-colors min-h-[44px]"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>چکیده درس</span>
                </button>

                {onOpenLearning && (
                  <button
                    onClick={() => {
                      playDuoSound('click');
                      onOpenLearning('stages_100');
                    }}
                    className="flex-1 sm:flex-initial px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-[#FFF0C8] text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1.5 transition-colors min-h-[44px]"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>کل برنامه ۱۰۰ مرحله‌ای</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ================================================================ */}
        {/* 3. COMPACT 4-CARD QUICK ACTION ROW (CORE DESTINATIONS)           */}
        {/* ================================================================ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() => {
              playDuoSound('click');
              if (onOpenLearning) {
                onOpenLearning('stages_100');
              }
            }}
            className="p-4 rounded-2xl bg-[#EAE4FF]/75 hover:bg-[#EAE4FF] border border-[#7056D8]/25 text-right flex flex-col justify-between gap-2 cursor-pointer transition-colors min-h-[92px]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[#36345F]">بخش یادگیری و دروس</span>
              <Compass className="w-4 h-4 text-[#7056D8] shrink-0" />
            </div>
            <span className="text-[11px] font-medium text-[#36345F]/85">
              واحدهای ۱ تا ۵، ۱۰۰ درس تعاملی و کتابچه مرجع
            </span>
          </button>

          <button
            onClick={() => {
              playDuoSound('click');
              onStartQuiz();
            }}
            className="p-4 rounded-2xl bg-[#E1ECFF]/75 hover:bg-[#E1ECFF] border border-[#3976E4]/25 text-right flex flex-col justify-between gap-2 cursor-pointer transition-colors min-h-[92px]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[#1E3A8A]">مرکز آزمون و تمرین</span>
              <Zap className="w-4 h-4 text-[#3976E4] shrink-0" />
            </div>
            <span className="text-[11px] font-medium text-[#1E3A8A]/85">
              بانک سوالات مفهومی و کیس‌های بالینی
            </span>
          </button>

          <button
            onClick={() => {
              playDuoSound('click');
              if (onOpenMentor) {
                onOpenMentor();
              }
            }}
            className="p-4 rounded-2xl bg-[#FBE2ED]/75 hover:bg-[#FBE2ED] border border-[#D85B89]/30 text-right flex flex-col justify-between gap-2 cursor-pointer transition-colors min-h-[92px]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[#701A3C]">استاد راهنما</span>
              <Sparkles className="w-4 h-4 text-[#D85B89] shrink-0" />
            </div>
            <span className="text-[11px] font-medium text-[#701A3C]/85">
              پرسش و تحلیل مفهومی مباحث روان‌شناسی
            </span>
          </button>

          <button
            onClick={() => {
              playDuoSound('click');
              if (onOpenUserPanel) {
                onOpenUserPanel();
              } else {
                onOpenNotes();
              }
            }}
            className="p-4 rounded-2xl bg-[#DDF3E9]/75 hover:bg-[#DDF3E9] border border-[#149D9A]/25 text-right flex flex-col justify-between gap-2 cursor-pointer transition-colors min-h-[92px]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-[#134E4A]">پنل کاربری و کارنامه</span>
              <User className="w-4 h-4 text-[#149D9A] shrink-0" />
            </div>
            <span className="text-[11px] font-medium text-[#134E4A]/85">
              آمار پیشرفت، مدال‌ها، یادداشت‌ها و ابزارها
            </span>
          </button>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 4. COMPACT PROGRESS SNAPSHOT & RECOMMENDED CHAPTER                 */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Right Column (7 cols): Study Consistency & Recommended Textbook Chapter */}
        <div className="lg:col-span-7 space-y-5">
          {/* Study Consistency & Verification Snapshot */}
          <section
            aria-label="خلاصه وضعیت مطالعه"
            className="bg-white rounded-3xl border border-[#E5E1EB] p-5 sm:p-6 shadow-2xs space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E1EB]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#EAE4FF] flex items-center justify-center">
                  <Flame className="w-4 h-4 text-[#7056D8]" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-black text-[#24243B]">
                    وضعیت پیوستگی و پیشرفت شما
                  </h2>
                  <span className="text-[11px] font-medium text-[#69697E]">
                    نمای خلاصه عملکرد واقعی شما در برنامه درسی
                  </span>
                </div>
              </div>

              {onOpenUserPanel && (
                <button
                  onClick={() => {
                    playDuoSound('click');
                    onOpenUserPanel();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#F7F5F0] hover:bg-[#EAE4FF]/50 border border-[#E5E1EB] text-xs font-extrabold text-[#36345F] flex items-center gap-1 cursor-pointer min-h-[40px]"
                >
                  <span>کارنامه کامل</span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-right">
              <div className="p-3.5 rounded-2xl bg-[#F7F5F0] border border-[#E5E1EB]">
                <span className="text-[11px] font-medium text-[#69697E] block">
                  درس‌های تکمیل‌شده
                </span>
                <span className="text-sm sm:text-base font-black text-[#24243B] mt-1 block tabular-nums">
                  {toPersianDigits(completedStageCount)} از ۱۰۰
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#DDF3E9]/65 border border-[#389D77]/30">
                <span className="text-[11px] font-medium text-[#134E4A] block">
                  تأییدشده آنلاین
                </span>
                <span className="text-sm sm:text-base font-black text-[#134E4A] mt-1 block tabular-nums">
                  {toPersianDigits(verifiedStageCount)} درس
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#FFF0C8]/70 border border-[#E5A33D]/40">
                <span className="text-[11px] font-medium text-[#5C3D0E] block">
                  پیوستگی مطالعه
                </span>
                <span className="text-sm sm:text-base font-black text-[#5C3D0E] mt-1 block tabular-nums">
                  {toPersianDigits(progress.streakDays)} روز
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#E1ECFF]/70 border border-[#3976E4]/30">
                <span className="text-[11px] font-medium text-[#1E3A8A] block">
                  دقت پاسخ‌گویی
                </span>
                <span className="text-sm sm:text-base font-black text-[#1E3A8A] mt-1 block tabular-nums">
                  {toPersianDigits(stats.accuracyRate)}٪
                </span>
              </div>
            </div>

            {offlineLocalStageCount > 0 && (
              <div className="p-4 rounded-2xl bg-[#FFF0C8] border border-[#E5A33D] text-right flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#5C3D0E]">
                    <CloudOff className="w-4 h-4 text-[#C98A27] shrink-0" />
                    <span>
                      {toPersianDigits(offlineLocalStageCount)} درس ذخیره‌شده به‌صورت محلی
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-[#5C3D0E]/90 leading-relaxed">
                    برای ثبت امتیاز این درس‌ها در جدول ملی، آن‌ها را به‌صورت آنلاین تأیید کنید.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const firstOfflineStageNum = completedStageNumbers
                      .sort((a, b) => a - b)
                      .find((num) => {
                        const r = completedStagesMap[num];
                        return !(r?.verified === true || r?.source === 'online-verified');
                      });
                    if (firstOfflineStageNum) {
                      const st = allStages.find((s) => s.stageNumber === firstOfflineStageNum);
                      if (st) handleStageClick(st);
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#24243B] hover:bg-[#36345F] text-white text-xs font-extrabold cursor-pointer transition-colors shrink-0 min-h-[44px]"
                >
                  بررسی و تأیید آنلاین
                </button>
              </div>
            )}
          </section>

          {/* Recommended Textbook Chapter Quick-Resume */}
          {recommendedChapter && (
            <section
              aria-label="پیشنهاد مطالعه از کتابچه مرجع"
              className="bg-white rounded-3xl border border-[#E5E1EB] p-5 sm:p-6 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 text-right">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg bg-[#DDF3E9] text-[#134E4A]">
                    کتابچه مرجع دانشگاهی
                  </span>
                  <span className="text-xs font-bold text-[#69697E]">
                    {recommendedChapter.chapterNumber}
                  </span>
                </div>
                <h3 className="text-base font-black text-[#24243B]">
                  {recommendedChapter.title}
                </h3>
                <div className="flex items-center gap-3 text-xs font-medium text-[#69697E]">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#149D9A]" />
                    <span>{toPersianDigits(recommendedChapter.estimatedMinutes)} دقیقه مطالعه</span>
                  </span>
                  <span>·</span>
                  <span>
                    {toPersianDigits(recommendedChapter.flashcards?.length || 0)} واژه تخصصی
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  playDuoSound('click');
                  onSelectChapter(recommendedChapter);
                }}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#149D9A] hover:bg-[#0F827F] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-colors min-h-[44px]"
              >
                <BookOpen className="w-4 h-4" />
                <span>مطالعه متن فصل</span>
              </button>
            </section>
          )}
        </div>

        {/* Left Column (5 cols): Recent Achievements & Notes Snapshot */}
        <aside
          aria-label="دستاوردها و یادداشت‌ها"
          className="lg:col-span-5 space-y-5"
        >
          <div className="bg-white rounded-3xl border border-[#E5E1EB] p-5 sm:p-6 shadow-2xs">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#E5E1EB]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#FFF0C8] flex items-center justify-center">
                  <Award className="w-4 h-4 text-[#C98A27]" />
                </div>
                <h3 className="text-sm font-extrabold text-[#24243B]">دستاوردهای علمی</h3>
              </div>
              <span className="text-[11px] font-bold text-[#69697E]">
                {toPersianDigits(unlockedBadges.length)} از {toPersianDigits(evaluatedBadges.length)}{' '}
                نشان
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5 my-4">
              {evaluatedBadges.slice(0, 3).map((bInfo) => (
                <div
                  key={bInfo.badge.id}
                  className={`flex flex-col items-center text-center p-2.5 rounded-2xl border ${
                    bInfo.isUnlocked
                      ? 'bg-[#FFF0C8]/50 border-[#E5A33D]/50'
                      : 'bg-[#F7F5F0] border-[#E5E1EB]'
                  }`}
                >
                  <BadgeIcon
                    type={bInfo.badge.iconType}
                    isUnlocked={bInfo.isUnlocked}
                    size={34}
                  />
                  <span className="text-[10px] font-extrabold text-[#24243B] mt-1.5 line-clamp-1">
                    {bInfo.badge.title}
                  </span>
                  <span className="text-[9px] font-bold text-[#69697E] mt-0.5 tabular-nums">
                    {bInfo.isUnlocked ? 'کسب‌شده' : `${toPersianDigits(bInfo.progressPercent)}٪`}
                  </span>
                </div>
              ))}
            </div>

            {onOpenBadges && (
              <button
                onClick={onOpenBadges}
                className="w-full py-2.5 px-3 rounded-xl bg-[#F7F5F0] hover:bg-[#EAE4FF]/50 border border-[#E5E1EB] text-[#24243B] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors min-h-[44px]"
              >
                <span>مشاهده همه دستاوردها در پنل کاربری</span>
                <ChevronLeft className="w-3.5 h-3.5 text-[#69697E]" />
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* ======================================================== */}
      {/* INTERACTIVE STAGE MODAL (100 Chained Stages Player)      */}
      {/* ======================================================== */}
      <DuolingoStageModal
        stage={activeStage}
        isOpen={isStageModalOpen}
        isLocked={isStageLockedState}
        previousStageNumber={activeStage ? activeStage.stageNumber - 1 : 1}
        previousStageVerified={
          activeStage && activeStage.stageNumber > 1
            ? Boolean(
                completedStagesMap[activeStage.stageNumber - 1]?.verified === true ||
                  completedStagesMap[activeStage.stageNumber - 1]?.source === 'online-verified'
              )
            : true
        }
        existingRecord={activeStage ? completedStagesMap[activeStage.stageNumber] : undefined}
        streakDays={progress.streakDays}
        onClose={() => {
          setIsStageModalOpen(false);
        }}
        onCompleteStage={(record) => {
          if (onCompleteStage) {
            onCompleteStage(record);
          }
        }}
        onStartNextStage={handleStartNextStage}
      />

      {/* ======================================================== */}
      {/* LESSON DETAILS & PROVENANCE INSPECTOR MODAL              */}
      {/* ======================================================== */}
      {previewStage &&
        (() => {
          const isDone = completedStagesMap[previewStage.stageNumber] !== undefined;
          const stageRec = completedStagesMap[previewStage.stageNumber];
          const isStageVerified = Boolean(
            stageRec?.verified === true || stageRec?.source === 'online-verified'
          );
          const prevStageRec =
            previewStage.stageNumber > 1
              ? completedStagesMap[previewStage.stageNumber - 1]
              : undefined;
          const isPrevStageOffline =
            previewStage.stageNumber > 1 &&
            prevStageRec !== undefined &&
            !(prevStageRec.verified === true || prevStageRec.source === 'online-verified');

          const prereq = stageExecutionEngine.isStagePrerequisiteMet(
            previewStage.stageNumber,
            progress.completedStages
          );
          const isUnlocked = prereq.isMet;
          const requiredPrereqNumber = prereq.missingStageNumber ?? previewStage.stageNumber - 1;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#24243B]/55 backdrop-blur-[2px] select-none">
              <div className="bg-white border border-[#E5E1EB] rounded-3xl p-5 sm:p-6 max-w-md w-full max-h-[90dvh] overflow-y-auto overscroll-contain text-right shadow-2xl relative">
                <button
                  onClick={() => {
                    setPreviewStage(null);
                    setVerifyFeedbackMsg(null);
                  }}
                  className="absolute top-3.5 left-3.5 p-2 rounded-xl text-[#69697E] hover:text-[#24243B] hover:bg-[#F7F5F0] transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="بستن"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-3.5 mb-4 pl-10">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center border shrink-0 font-black text-sm ${
                      isDone
                        ? 'bg-[#DDF3E9] border-[#389D77]/40 text-[#134E4A]'
                        : isUnlocked
                        ? 'bg-[#EAE4FF] border-[#7056D8]/40 text-[#36345F]'
                        : 'bg-[#F7F5F0] border-[#E5E1EB] text-[#69697E]'
                    }`}
                  >
                    {isDone ? (
                      <Check className="w-6 h-6 text-[#389D77] stroke-[2.75]" />
                    ) : isUnlocked ? (
                      <span>{toPersianDigits(previewStage.stageNumber)}</span>
                    ) : (
                      <Lock className="w-5 h-5" />
                    )}
                  </div>

                  <div>
                    <span className="text-[11px] font-extrabold text-[#7056D8]">
                      {previewStage.unitTitle}
                    </span>
                    <h3 className="text-base font-black text-[#24243B] mt-0.5">
                      درس {toPersianDigits(previewStage.stageNumber)}: {previewStage.title}
                    </h3>
                  </div>
                </div>

                {isDone && (
                  <div className="space-y-2 mb-3.5">
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-[#F7F5F0] border border-[#E5E1EB]">
                      <span className="text-xs font-bold text-[#24243B]">ستاره‌های کسب‌شده:</span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3].map((starIdx) => (
                          <Star
                            key={starIdx}
                            className={`w-4 h-4 ${
                              starIdx <= (stageRec?.stars || 3)
                                ? 'fill-[#E5A33D] text-[#E5A33D]'
                                : 'fill-[#E5E1EB] text-[#CFC9DA]'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    {isStageVerified ? (
                      <div className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-[#DDF3E9] border border-[#389D77]/40 text-[#134E4A] text-xs font-extrabold">
                        <ShieldCheck className="w-4 h-4 text-[#389D77] shrink-0" />
                        <span>تأیید شده در سرور (امتیاز ثبت شد)</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-[#FFF0C8] border border-[#E5A33D] text-[#5C3D0E] text-xs font-extrabold">
                        <CloudOff className="w-4 h-4 text-[#C98A27] shrink-0" />
                        <span>ذخیره محلی/آفلاین (بدون امتیاز لیدربورد)</span>
                      </div>
                    )}
                  </div>
                )}

                {isUnlocked && isPrevStageOffline && (
                  <div className="p-3 mb-3.5 rounded-2xl bg-[#FFF0C8] border border-[#E5A33D] text-[#5C3D0E] text-xs font-bold leading-relaxed flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#C98A27] shrink-0 mt-0.5" />
                    <span>
                      مرحله قبلی در حالت آفلاین تکمیل شده است. برای ثبت امتیاز (XP) در لیدربورد جهانی، ابتدا مرحله قبلی را به صورت آنلاین تأیید کنید.
                    </span>
                  </div>
                )}

                {verifyFeedbackMsg && (
                  <div className="p-3 mb-3.5 rounded-2xl bg-[#DDF3E9] border border-[#389D77]/40 text-[#134E4A] text-xs font-extrabold">
                    {verifyFeedbackMsg}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5 my-3.5 text-xs font-extrabold text-[#24243B]">
                  <div className="flex items-center gap-1.5 p-2.5 rounded-2xl bg-[#F7F5F0] border border-[#E5E1EB]">
                    <Layers className="w-4 h-4 text-[#3976E4]" />
                    <span>{toPersianDigits(previewStage.questions.length)} پرسش تخصصی</span>
                  </div>
                  <div className="flex items-center gap-1.5 p-2.5 rounded-2xl bg-[#FFF0C8]/70 border border-[#E5A33D]/40 text-[#5C3D0E]">
                    <Zap className="w-4 h-4 text-[#C98A27] fill-[#E5A33D]" />
                    <span>+{toPersianDigits(previewStage.xpReward)} XP پاداش</span>
                  </div>
                </div>

                <div className="text-xs font-medium text-[#24243B] leading-relaxed mb-4 bg-[#F7F5F0] p-3.5 rounded-2xl border border-[#E5E1EB]">
                  <span className="font-extrabold text-[#36345F] block mb-1">
                    چکیده و هدف یادگیری:
                  </span>
                  {previewStage.keyTakeaway}
                </div>

                {!isUnlocked ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-[#FFE5DC] border border-[#EF786B] rounded-2xl text-xs font-extrabold text-[#7C2D12]">
                      این درس پیش‌نیاز دارد. ابتدا درس {toPersianDigits(requiredPrereqNumber)} را کامل کنید.
                    </div>
                    <button
                      onClick={() => {
                        setPreviewStage(null);
                        const targetStage = allStages.find(
                          (s) => s.stageNumber === requiredPrereqNumber
                        );
                        if (targetStage) {
                          handleStageClick(targetStage);
                        }
                      }}
                      className="w-full py-3 rounded-2xl bg-[#7056D8] hover:bg-[#5E43C4] text-white text-xs font-extrabold cursor-pointer transition-colors min-h-[44px]"
                    >
                      مشاهده درس پیش‌نیاز ({toPersianDigits(requiredPrereqNumber)})
                    </button>
                  </div>
                ) : isDone ? (
                  <div className="flex flex-col gap-2">
                    {!isStageVerified && (
                      <button
                        disabled={verifyingStageNum === previewStage.stageNumber}
                        onClick={() => handleVerifyStageOnlineClick(previewStage, stageRec)}
                        className="w-full py-3 rounded-2xl bg-[#389D77] hover:bg-[#2D8262] text-white text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1.5 transition-colors min-h-[44px]"
                      >
                        {verifyingStageNum === previewStage.stageNumber ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="w-4 h-4" />
                        )}
                        <span>تأیید آنلاین و دریافت XP</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleLaunchStage(previewStage)}
                      className="w-full py-3 rounded-2xl bg-[#F7F5F0] hover:bg-[#EAE4FF]/50 border border-[#CFC9DA] text-[#24243B] text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1.5 transition-colors min-h-[44px]"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>مرور و تمرین مجدد درس</span>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleLaunchStage(previewStage)}
                    className="w-full py-3.5 rounded-2xl bg-[#7056D8] hover:bg-[#5E43C4] text-white text-sm font-extrabold cursor-pointer flex items-center justify-center gap-2 transition-colors min-h-[48px]"
                  >
                    <span>شروع درس {toPersianDigits(previewStage.stageNumber)}</span>
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })()}
    </div>
  );
};
