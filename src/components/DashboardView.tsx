import React, { useState, useMemo } from 'react';
import {
  Section,
  Chapter,
  UserProgress,
  DuolingoStage,
  StageCompletionRecord,
  LearningDisciplineId,
} from '../types/psychology';
import { ArrowLeft, Award, Check } from 'lucide-react';
import { playDuoSound } from '../utils/duoAudio';
import { stageExecutionEngine } from '../services/stageExecutionEngine';
import { DuolingoStageModal } from './DuolingoStageModal';
import { toPersianDigits } from '../utils/persianDigits';
import { LearningSubMode } from './LearningView';
import {
  calculateAuthoritativeUserXp,
  DEFAULT_DAILY_XP_TARGET,
  LEARNING_DISCIPLINES,
  DEFAULT_LEARNING_DISCIPLINE_ID,
  getDisciplineDefinition,
} from '../utils/storage';
import { renderDisciplineIcon } from './Navbar';

interface DashboardViewProps {
  sections: Section[];
  progress: UserProgress;
  currentChapter?: Chapter;
  activeDiscipline?: LearningDisciplineId;
  onSelectDiscipline?: (disciplineId: LearningDisciplineId) => void;
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
  progress,
  activeDiscipline = DEFAULT_LEARNING_DISCIPLINE_ID,
  onSelectDiscipline,
  onStartQuiz,
  onOpenBadges,
  onCompleteStage,
}) => {
  // Stage modal states for launching "Continue Learning" directly from Home
  const [activeStage, setActiveStage] = useState<DuolingoStage | null>(null);
  const [isStageModalOpen, setIsStageModalOpen] = useState<boolean>(false);
  const [isStageLockedState, setIsStageLockedState] = useState<boolean>(false);

  const activeDisciplineMeta = useMemo(
    () => getDisciplineDefinition(activeDiscipline),
    [activeDiscipline]
  );

  const allStages = useMemo(() => stageExecutionEngine.getSortedStages(), []);

  const completedStagesMap = progress.completedStages || {};
  const completedStageNumbers = Object.keys(completedStagesMap).map(Number);
  const completedStageCount = completedStageNumbers.length;
  const currentUnlockedStageNumber = stageExecutionEngine.calculateUnlockedStageNumber(
    progress.completedStages
  );

  const currentActiveStage = useMemo(() => {
    return (
      allStages.find((s) => s.stageNumber === currentUnlockedStageNumber) || allStages[0]
    );
  }, [allStages, currentUnlockedStageNumber]);

  const handleLaunchStage = (stage: DuolingoStage) => {
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

  const overallProgressPercent = Math.round((completedStageCount / 100) * 100);
  const userXp = calculateAuthoritativeUserXp(progress);
  const dailyTarget = progress.dailyTargetXp || DEFAULT_DAILY_XP_TARGET;
  const dailyXp = progress.dailyXp || 0;
  const isDailyMissionDone = Boolean(progress.dailyMissionCompleted || dailyXp >= dailyTarget);

  return (
    <div className="max-w-xl mx-auto space-y-4 px-3.5 sm:px-4 py-3 sm:py-5 pb-24 select-none">
      {/* ================================================================ */}
      {/* GROUP A: COMPACT PAGE HEADING & MULTI-DISCIPLINE SELECTOR BAR    */}
      {/* ================================================================ */}
      <header className="space-y-3 text-right">
        <div className="space-y-0.5">
          <span className="text-[11px] font-bold text-[#7056D8] tracking-wide block">
            {activeDisciplineMeta.deskTitle}
          </span>
          <h1 className="text-lg sm:text-xl font-black text-[#24243B] tracking-tight">
            خانه
          </h1>
        </div>

        {/* Prominent Multi-Discipline Learning Selector */}
        <nav
          aria-label="انتخاب حوزه یادگیری"
          data-testid="dashboard-discipline-selector"
          className="bg-white rounded-2xl border border-[#E5E1EB] p-2 shadow-2xs"
        >
          <div className="flex items-center justify-between px-1.5 pb-1.5 text-[11px]">
            <span className="font-extrabold text-[#24243B]">مسیرها و حوزه‌های یادگیری</span>
            <span className="text-[#69697E] font-medium">
              حوزه فعال: <strong className="text-[#24243B] font-extrabold">{activeDisciplineMeta.label}</strong>
            </span>
          </div>

          <div
            role="radiogroup"
            aria-label="حوزه‌های آموزشی پشتیبانی‌شده"
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5"
          >
            {LEARNING_DISCIPLINES.map((discipline) => {
              const isSelected = discipline.id === activeDisciplineMeta.id;
              return (
                <button
                  key={discipline.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  data-discipline-id={discipline.id}
                  data-active={isSelected ? 'true' : 'false'}
                  onClick={() => {
                    playDuoSound('click');
                    onSelectDiscipline?.(discipline.id);
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all cursor-pointer shrink-0 min-h-[44px] border ${
                    isSelected
                      ? `${discipline.palette.activeBg} ${discipline.palette.activeText} ${discipline.palette.activeBorder} font-extrabold shadow-2xs`
                      : 'bg-[#F7F5F0]/70 hover:bg-[#F7F5F0] text-[#24243B] border-transparent hover:border-[#E5E1EB] font-bold'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-white/15 text-white'
                        : `${discipline.palette.badgeBg} ${discipline.palette.iconColor}`
                    }`}
                  >
                    {renderDisciplineIcon(discipline.iconName, 'w-3.5 h-3.5')}
                  </span>
                  <span className="whitespace-nowrap">{discipline.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {/* ================================================================ */}
      {/* GROUP B: CONTINUE LEARNING OR HONEST FUTURE-CURRICULUM STATE     */}
      {/* ================================================================ */}
      {activeDisciplineMeta.hasCurriculum ? (
        <section
          aria-label="ادامه یادگیری"
          className="rounded-2xl bg-[#36345F] text-white p-5 sm:p-6 border border-[#24243B] shadow-sm relative overflow-hidden"
        >
          <div className="space-y-3.5 text-right">
            <div className="text-xs font-bold text-[#EAE4FF]/80">
              واحد {toPersianDigits(currentActiveStage.unitIndex || 1)} · {currentActiveStage.unitTitle}
            </div>

            <div>
              <span className="text-xs text-[#FFF0C8] font-bold block mb-1">
                درس {toPersianDigits(currentUnlockedStageNumber)} از ۱۰۰
              </span>
              <h2 className="text-base sm:text-lg font-black text-white leading-snug">
                {currentActiveStage.title}
              </h2>
            </div>

            {/* One concise progress indicator */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs font-bold text-[#EAE4FF]">
                <span>پیشرفت برنامه</span>
                <span className="tabular-nums">{toPersianDigits(overallProgressPercent)}٪</span>
              </div>
              <div className="w-full h-2 bg-white/15 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#E5A33D] rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(3, overallProgressPercent)}%` }}
                />
              </div>
            </div>

            {/* One primary button: ادامه یادگیری */}
            <div className="pt-2">
              <button
                onClick={() => handleLaunchStage(currentActiveStage)}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#E5A33D] hover:bg-[#D8962E] text-[#24243B] text-xs sm:text-sm font-black cursor-pointer flex items-center justify-center gap-2 shadow-sm transition-colors min-h-[48px]"
              >
                <span>ادامه یادگیری</span>
                <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section
          aria-label={`وضعیت سرفصل ${activeDisciplineMeta.label}`}
          data-testid="discipline-empty-curriculum-state"
          className="rounded-2xl bg-white text-[#24243B] p-5 sm:p-6 border border-[#E5E1EB] shadow-2xs space-y-4 text-right"
        >
          <div className="flex items-start gap-3">
            <span
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${activeDisciplineMeta.palette.badgeBg} ${activeDisciplineMeta.palette.iconColor}`}
            >
              {renderDisciplineIcon(activeDisciplineMeta.iconName, 'w-5 h-5')}
            </span>
            <div className="space-y-1 min-w-0">
              <span className="text-xs font-bold text-[#69697E] block">
                حوزه انتخاب‌شده: {activeDisciplineMeta.label} · در حال تدوین سرفصل اختصاصی
              </span>
              <h2 className="text-base sm:text-lg font-black text-[#24243B] leading-snug">
                {activeDisciplineMeta.deskTitle}
              </h2>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-[#24243B]/90 leading-relaxed">
            {activeDisciplineMeta.subtitle}
          </p>

          <div className="rounded-xl bg-[#F7F5F0] border border-[#E5E1EB] p-3.5 text-xs text-[#69697E] leading-relaxed">
            {activeDisciplineMeta.upcomingSummary} تمامی پیشرفت‌ها، امتیازهای تجربه (XP)، یادداشت‌ها و دستاوردهای شما در روان‌مستر بدون هیچ تغییری محفوظ است.
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                playDuoSound('click');
                onSelectDiscipline?.('psychology');
              }}
              className="px-5 py-3 rounded-xl bg-[#36345F] hover:bg-[#24243B] text-white text-xs sm:text-sm font-black cursor-pointer flex items-center justify-center gap-2 transition-colors min-h-[46px]"
            >
              <span>ادامه مسیر فعال روانشناسی (درس {toPersianDigits(currentUnlockedStageNumber)} از ۱۰۰)</span>
              <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
            </button>

            <button
              type="button"
              onClick={() => {
                playDuoSound('click');
                onStartQuiz();
              }}
              className="px-4 py-3 rounded-xl bg-[#F7F5F0] hover:bg-[#EAE4FF]/60 text-[#24243B] border border-[#E5E1EB] text-xs font-extrabold cursor-pointer flex items-center justify-center transition-colors min-h-[46px]"
            >
              <span>ورود به مرکز آزمون‌ها</span>
            </button>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* GROUP C: ONE COMPACT PROGRESS SUMMARY                            */}
      {/* ================================================================ */}
      <section
        aria-label="خلاصه آمار پیشرفت"
        className="bg-white rounded-2xl border border-[#E5E1EB] px-4 py-3.5 shadow-2xs space-y-3"
      >
        <div className="flex items-center justify-between text-xs divide-x-reverse divide-x divide-[#E5E1EB] text-center">
          <div className="flex-1 px-2">
            <span className="text-[11px] text-[#69697E] block mb-0.5">پیوستگی مطالعه</span>
            <span className="text-xs sm:text-sm font-black text-[#24243B] tabular-nums">
              {toPersianDigits(progress.streakDays)} روز
            </span>
          </div>

          <div className="flex-1 px-2">
            <span className="text-[11px] text-[#69697E] block mb-0.5">دروس تکمیل‌شده</span>
            <span className="text-xs sm:text-sm font-black text-[#24243B] tabular-nums">
              {toPersianDigits(completedStageCount)} از ۱۰۰
            </span>
          </div>

          <div className="flex-1 px-2">
            <span className="text-[11px] text-[#69697E] block mb-0.5">مجموع امتیاز</span>
            <span className="text-xs sm:text-sm font-black text-[#7056D8] tabular-nums">
              {toPersianDigits(userXp)} XP
            </span>
          </div>
        </div>

        <div className="pt-2.5 border-t border-[#E5E1EB] flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#69697E]">
            <span>ماموریت روزانه:</span>
            <span className="font-black text-[#24243B] tabular-nums">
              {toPersianDigits(Math.min(dailyXp, dailyTarget))} / {toPersianDigits(dailyTarget)} XP
            </span>
            {isDailyMissionDone && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#DDF3E9] text-[#134E4A] text-[10px] font-extrabold">
                <Check className="w-3 h-3 text-[#389D77]" />
                <span>تکمیل شد</span>
              </span>
            )}
          </div>

          {onOpenBadges && (
            <button
              type="button"
              onClick={() => {
                playDuoSound('click');
                onOpenBadges();
              }}
              className="inline-flex items-center gap-1 text-xs font-extrabold text-[#7056D8] hover:text-[#5B46E8] cursor-pointer transition-colors"
            >
              <Award className="w-3.5 h-3.5 text-[#E5A33D]" />
              <span>مشاهده همه دستاوردها</span>
            </button>
          )}
        </div>
      </section>

      {/* Active Stage Modal (Launched from Continue Learning) */}
      {activeStage && isStageModalOpen && (
        <DuolingoStageModal
          isOpen={isStageModalOpen}
          onClose={() => setIsStageModalOpen(false)}
          stage={activeStage}
          isLocked={isStageLockedState}
          onCompleteStage={(record: StageCompletionRecord) => {
            if (onCompleteStage) onCompleteStage(record);
          }}
          onStartNextStage={handleStartNextStage}
        />
      )}
    </div>
  );
};
