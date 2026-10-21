import React, { useState, useMemo, useEffect } from 'react';
import {
  Section,
  Chapter,
  UserProgress,
  DuolingoStage,
  StageCompletionRecord,
} from '../types/psychology';
import {
  BookOpen,
  Lock,
  Check,
  Star,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  X,
  Navigation,
  Layers,
  ShieldCheck,
  RotateCcw,
  CloudOff,
  RefreshCw,
  AlertTriangle,
  BookMarked,
  Clock,
  CheckCircle2,
  ArrowLeft,
  Zap,
  Compass,
} from 'lucide-react';
import { playDuoSound } from '../utils/duoAudio';
import { getUnlockedStageNumber } from '../data/section1Stages';
import { stageExecutionEngine } from '../services/stageExecutionEngine';
import { DuolingoStageModal } from './DuolingoStageModal';
import { PrerequisiteInspectorModal } from './PrerequisiteInspectorModal';
import { BookReaderView } from './BookReaderView';
import { NotebookView } from './NotebookView';
import { submitStageOrQuizReward } from '../utils/cloudSync';
import { toPersianDigits } from '../utils/persianDigits';

export type LearningSubMode = 'stages_100' | 'sections_overview' | 'book_reader' | 'notes';

interface LearningViewProps {
  sections: Section[];
  currentChapter: Chapter;
  progress: UserProgress;
  initialSubMode?: LearningSubMode;
  onSubModeChange?: (mode: LearningSubMode) => void;
  onSelectChapter: (chapter: Chapter) => void;
  onStartQuiz: (chapter?: Chapter) => void;
  onToggleBookmark: (chapterId: string) => void;
  onTogglePin: (chapterId: string) => void;
  onSaveNote: (chapterId: string, noteText: string) => void;
  onMarkCompleted: (chapterId: string) => void;
  onAskMentorAboutChapter: (chapterTitle: string, sectionTitle: string) => void;
  onOpenPomodoro?: () => void;
  onUpdateSettings: (newSettings: Partial<UserProgress['customSettings']>) => void;
  onCompleteStage?: (record: StageCompletionRecord) => void;
  onClaimStageChest?: (stageNumber: number) => void;
}

interface UnitEditorialTheme {
  id: number;
  name: string;
  accentHex: string;
  tintHex: string;
  headerBgClass: string;
  headerBorderClass: string;
  badgeBgClass: string;
  badgeTextClass: string;
  accentTextClass: string;
  progressBarClass: string;
  activeRowBgClass: string;
  activeRowBorderClass: string;
  ctaButtonClass: string;
}

const UNIT_EDITORIAL_THEMES: UnitEditorialTheme[] = [
  {
    id: 1,
    name: 'بنفش شناختی',
    accentHex: '#7056D8',
    tintHex: '#EAE4FF',
    headerBgClass: 'bg-[#EAE4FF]/75',
    headerBorderClass: 'border-[#7056D8]/30',
    badgeBgClass: 'bg-[#7056D8]',
    badgeTextClass: 'text-white',
    accentTextClass: 'text-[#36345F]',
    progressBarClass: 'bg-[#7056D8]',
    activeRowBgClass: 'bg-[#EAE4FF]/55',
    activeRowBorderClass: 'border-[#7056D8]',
    ctaButtonClass: 'bg-[#7056D8] hover:bg-[#5E43C4] text-white',
  },
  {
    id: 2,
    name: 'لاجوردی پژوهش',
    accentHex: '#3976E4',
    tintHex: '#E1ECFF',
    headerBgClass: 'bg-[#E1ECFF]/80',
    headerBorderClass: 'border-[#3976E4]/30',
    badgeBgClass: 'bg-[#3976E4]',
    badgeTextClass: 'text-white',
    accentTextClass: 'text-[#1E3A8A]',
    progressBarClass: 'bg-[#3976E4]',
    activeRowBgClass: 'bg-[#E1ECFF]/55',
    activeRowBorderClass: 'border-[#3976E4]',
    ctaButtonClass: 'bg-[#3976E4] hover:bg-[#2B62C7] text-white',
  },
  {
    id: 3,
    name: 'فیروزه‌ای عصب‌شناختی',
    accentHex: '#149D9A',
    tintHex: '#DDF3E9',
    headerBgClass: 'bg-[#DDF3E9]/80',
    headerBorderClass: 'border-[#149D9A]/30',
    badgeBgClass: 'bg-[#149D9A]',
    badgeTextClass: 'text-white',
    accentTextClass: 'text-[#134E4A]',
    progressBarClass: 'bg-[#149D9A]',
    activeRowBgClass: 'bg-[#DDF3E9]/55',
    activeRowBorderClass: 'border-[#149D9A]',
    ctaButtonClass: 'bg-[#149D9A] hover:bg-[#0F827F] text-white',
  },
  {
    id: 4,
    name: 'رز ادراکی',
    accentHex: '#D85B89',
    tintHex: '#FBE2ED',
    headerBgClass: 'bg-[#FBE2ED]/80',
    headerBorderClass: 'border-[#D85B89]/30',
    badgeBgClass: 'bg-[#D85B89]',
    badgeTextClass: 'text-white',
    accentTextClass: 'text-[#701A3C]',
    progressBarClass: 'bg-[#D85B89]',
    activeRowBgClass: 'bg-[#FBE2ED]/55',
    activeRowBorderClass: 'border-[#D85B89]',
    ctaButtonClass: 'bg-[#D85B89] hover:bg-[#BF4673] text-white',
  },
  {
    id: 5,
    name: 'سبز یادگیری و هوشیاری',
    accentHex: '#389D77',
    tintHex: '#FFF0C8',
    headerBgClass: 'bg-[#FFF0C8]/75',
    headerBorderClass: 'border-[#E5A33D]/40',
    badgeBgClass: 'bg-[#389D77]',
    badgeTextClass: 'text-white',
    accentTextClass: 'text-[#24243B]',
    progressBarClass: 'bg-[#389D77]',
    activeRowBgClass: 'bg-[#DDF3E9]/55',
    activeRowBorderClass: 'border-[#389D77]',
    ctaButtonClass: 'bg-[#389D77] hover:bg-[#2D8262] text-white',
  },
];

export const UnitEditorialIllustration: React.FC<{ unitIndex: number }> = ({ unitIndex }) => {
  switch ((unitIndex - 1) % 5) {
    case 0:
      return (
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true" className="shrink-0">
          <rect width="56" height="56" rx="16" fill="#FFFFFF" fillOpacity="0.85" />
          <circle cx="23" cy="28" r="12" fill="#7056D8" fillOpacity="0.18" stroke="#7056D8" strokeWidth="2" />
          <circle cx="33" cy="28" r="12" fill="#36345F" fillOpacity="0.14" stroke="#36345F" strokeWidth="2" />
          <path d="M28 18V38" stroke="#E5A33D" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="28" cy="28" r="3.5" fill="#7056D8" />
        </svg>
      );
    case 1:
      return (
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true" className="shrink-0">
          <rect width="56" height="56" rx="16" fill="#FFFFFF" fillOpacity="0.85" />
          <path
            d="M10 38C16 38 19 16 28 16C37 16 40 38 46 38"
            stroke="#3976E4"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <line x1="10" y1="38" x2="46" y2="38" stroke="#36345F" strokeWidth="1.75" strokeLinecap="round" />
          <line x1="28" y1="16" x2="28" y2="38" stroke="#E5A33D" strokeWidth="1.75" strokeDasharray="3 3" />
          <circle cx="28" cy="16" r="3.5" fill="#3976E4" />
          <circle cx="20" cy="28" r="2.5" fill="#149D9A" />
          <circle cx="36" cy="28" r="2.5" fill="#149D9A" />
        </svg>
      );
    case 2:
      return (
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true" className="shrink-0">
          <rect width="56" height="56" rx="16" fill="#FFFFFF" fillOpacity="0.85" />
          <path d="M15 36L26 22L40 20L36 37L15 36Z" stroke="#149D9A" strokeWidth="1.8" strokeOpacity="0.5" />
          <line x1="15" y1="36" x2="40" y2="20" stroke="#36345F" strokeWidth="1.8" />
          <circle cx="15" cy="36" r="4" fill="#149D9A" />
          <circle cx="26" cy="22" r="4.5" fill="#36345F" />
          <circle cx="40" cy="20" r="4" fill="#E5A33D" />
          <circle cx="36" cy="37" r="3.5" fill="#389D77" />
        </svg>
      );
    case 3:
      return (
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true" className="shrink-0">
          <rect width="56" height="56" rx="16" fill="#FFFFFF" fillOpacity="0.85" />
          <path
            d="M10 28C15 19 21 15 28 15C35 15 41 19 46 28C41 37 35 41 28 41C21 41 15 37 10 28Z"
            stroke="#D85B89"
            strokeWidth="2.2"
          />
          <circle cx="28" cy="28" r="7.5" fill="#D85B89" fillOpacity="0.2" stroke="#36345F" strokeWidth="2" />
          <circle cx="28" cy="28" r="3" fill="#D85B89" />
        </svg>
      );
    default:
      return (
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true" className="shrink-0">
          <rect width="56" height="56" rx="16" fill="#FFFFFF" fillOpacity="0.85" />
          <circle cx="28" cy="28" r="14" stroke="#E5A33D" strokeWidth="2" strokeDasharray="4 3" />
          <circle cx="28" cy="28" r="9" fill="#389D77" fillOpacity="0.18" stroke="#389D77" strokeWidth="2.2" />
          <circle cx="28" cy="28" r="3.5" fill="#36345F" />
        </svg>
      );
  }
};

export const LearningView: React.FC<LearningViewProps> = ({
  sections,
  currentChapter,
  progress,
  initialSubMode = 'stages_100',
  onSubModeChange,
  onSelectChapter,
  onStartQuiz,
  onToggleBookmark,
  onTogglePin,
  onSaveNote,
  onMarkCompleted,
  onAskMentorAboutChapter,
  onOpenPomodoro,
  onUpdateSettings,
  onCompleteStage,
  onClaimStageChest,
}) => {
  const [subMode, setSubMode] = useState<LearningSubMode>(initialSubMode);

  useEffect(() => {
    setSubMode(initialSubMode);
  }, [initialSubMode]);

  const handleSwitchSubMode = (nextMode: LearningSubMode) => {
    playDuoSound('click');
    setSubMode(nextMode);
    if (onSubModeChange) {
      onSubModeChange(nextMode);
    }
  };

  // Unit filter for the 100 stages
  const [unitFilter, setUnitFilter] = useState<number | 'all'>('all');

  // Stage modal states
  const [activeStage, setActiveStage] = useState<DuolingoStage | null>(null);
  const [isStageModalOpen, setIsStageModalOpen] = useState<boolean>(false);
  const [isStageLockedState, setIsStageLockedState] = useState<boolean>(false);
  const [isPrerequisiteInspectorOpen, setIsPrerequisiteInspectorOpen] = useState<boolean>(false);
  const [previewStage, setPreviewStage] = useState<DuolingoStage | null>(null);

  // Unit Guidebook modal state
  const [guidebookUnit, setGuidebookUnit] = useState<{
    unitIndex: number;
    unitTitle: string;
    stages: DuolingoStage[];
  } | null>(null);

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

  const [expandedUnits, setExpandedUnits] = useState<Record<number, boolean>>(() => {
    const activeUnitIdx = currentActiveStage?.unitIndex || 1;
    return { [activeUnitIdx]: true };
  });

  useEffect(() => {
    if (unitFilter !== 'all') {
      setExpandedUnits((prev) => ({ ...prev, [unitFilter]: true }));
    } else if (currentActiveStage?.unitIndex) {
      setExpandedUnits((prev) => ({ ...prev, [currentActiveStage.unitIndex]: true }));
    }
  }, [unitFilter, currentActiveStage?.unitIndex]);

  const toggleUnitExpanded = (unitIndex: number) => {
    playDuoSound('click');
    setExpandedUnits((prev) => ({
      ...prev,
      [unitIndex]: !prev[unitIndex],
    }));
  };

  const handleExpandAllUnits = (expand: boolean) => {
    playDuoSound('click');
    const next: Record<number, boolean> = {};
    [1, 2, 3, 4, 5].forEach((u) => {
      next[u] = expand;
    });
    setExpandedUnits(next);
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

  const displayedStages = useMemo(() => {
    if (unitFilter === 'all') return allStages;
    return allStages.filter((s) => s.unitIndex === unitFilter);
  }, [allStages, unitFilter]);

  const groupedUnits = useMemo(() => {
    const units: { unitIndex: number; unitTitle: string; stages: DuolingoStage[] }[] = [];
    const map = new Map<number, DuolingoStage[]>();

    displayedStages.forEach((st) => {
      if (!map.has(st.unitIndex)) {
        map.set(st.unitIndex, []);
      }
      map.get(st.unitIndex)!.push(st);
    });

    map.forEach((stages, unitIndex) => {
      units.push({
        unitIndex,
        unitTitle: stages[0].unitTitle,
        stages,
      });
    });

    return units.sort((a, b) => a.unitIndex - b.unitIndex);
  }, [displayedStages]);

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

  const handleJumpToActiveStage = () => {
    playDuoSound('click');
    setUnitFilter('all');
    if (currentActiveStage?.unitIndex) {
      setExpandedUnits((prev) => ({ ...prev, [currentActiveStage.unitIndex]: true }));
    }
    setTimeout(() => {
      const el = document.getElementById(`stage-node-${currentUnlockedStageNumber}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const handleOpenChapterInReader = (chapter: Chapter) => {
    onSelectChapter(chapter);
    setSubMode('book_reader');
    if (onSubModeChange) {
      onSubModeChange('book_reader');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const notesCount = Object.values(progress.chapterNotes || {}).filter(
    (t) => t && t.trim().length > 0
  ).length;

  return (
    <div className="space-y-6 pb-20">
      {/* ================================================================== */}
      {/* 1. LEARNING DESTINATION HEADER & SUB-NAVIGATION                    */}
      {/* ================================================================== */}
      <section aria-label="بخش یادگیری و منابع درسی" className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-3 border-b border-[#E5E1EB]">
          <div>
            <span className="text-xs font-extrabold tracking-wide text-[#7056D8] block mb-1">
              بخش یادگیری · سرفصل‌ها و منابع دانشگاهی
            </span>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-[#24243B] leading-tight">
              برنامه درسی ۱۰۰ مرحله‌ای و کتابچه مرجع
            </h1>
          </div>

          {/* Primary Learning Mode Switcher */}
          <div className="grid grid-cols-2 sm:inline-flex items-center p-1 rounded-2xl bg-white border border-[#E5E1EB] text-xs font-bold gap-1 w-full lg:w-auto">
            <button
              onClick={() => handleSwitchSubMode('stages_100')}
              className={`px-3.5 py-2 rounded-xl cursor-pointer transition-colors min-h-[44px] flex items-center justify-center gap-1.5 whitespace-nowrap ${
                subMode === 'stages_100'
                  ? 'bg-[#36345F] text-white font-extrabold'
                  : 'text-[#69697E] hover:text-[#24243B]'
              }`}
            >
              <Compass className="w-3.5 h-3.5 shrink-0" />
              <span>مسیر ۱۰۰ مرحله‌ای</span>
            </button>

            <button
              onClick={() => handleSwitchSubMode('sections_overview')}
              className={`px-3.5 py-2 rounded-xl cursor-pointer transition-colors min-h-[44px] flex items-center justify-center gap-1.5 whitespace-nowrap ${
                subMode === 'sections_overview'
                  ? 'bg-[#36345F] text-white font-extrabold'
                  : 'text-[#69697E] hover:text-[#24243B]'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>فهرست فصول ({toPersianDigits(sections.length)} بخش)</span>
            </button>

            <button
              onClick={() => handleSwitchSubMode('book_reader')}
              className={`px-3.5 py-2 rounded-xl cursor-pointer transition-colors min-h-[44px] flex items-center justify-center gap-1.5 whitespace-nowrap ${
                subMode === 'book_reader'
                  ? 'bg-[#149D9A] text-white font-extrabold'
                  : 'text-[#69697E] hover:text-[#24243B]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span>متن کتابچه مرجع</span>
            </button>

            <button
              onClick={() => handleSwitchSubMode('notes')}
              className={`px-3.5 py-2 rounded-xl cursor-pointer transition-colors min-h-[44px] flex items-center justify-center gap-1.5 whitespace-nowrap ${
                subMode === 'notes'
                  ? 'bg-[#EF786B] text-white font-extrabold'
                  : 'text-[#69697E] hover:text-[#24243B]'
              }`}
            >
              <BookMarked className="w-3.5 h-3.5 shrink-0" />
              <span>یادداشت‌ها ({toPersianDigits(notesCount)})</span>
            </button>
          </div>
        </div>

        {/* Compact Active Station & Provenance Bar when inside 100 Stages */}
        {subMode === 'stages_100' && (
          <div className="bg-white rounded-2xl border border-[#E5E1EB] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 shadow-2xs">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EAE4FF] text-[#36345F] font-extrabold">
                <span>ایستگاه فعلی: درس {toPersianDigits(currentUnlockedStageNumber)} از ۱۰۰</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#DDF3E9] text-[#134E4A] font-extrabold">
                <ShieldCheck className="w-3.5 h-3.5 text-[#389D77]" />
                <span>تأیید آنلاین: {toPersianDigits(verifiedStageCount)} درس</span>
              </span>
              {offlineLocalStageCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFF0C8] text-[#5C3D0E] font-extrabold">
                  <CloudOff className="w-3.5 h-3.5 text-[#C98A27]" />
                  <span>ذخیره محلی: {toPersianDigits(offlineLocalStageCount)} درس</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  playDuoSound('click');
                  setIsPrerequisiteInspectorOpen(true);
                }}
                className="flex-1 sm:flex-initial justify-center px-3.5 py-2 rounded-xl bg-[#FFF0C8]/80 hover:bg-[#FFF0C8] border border-[#E5A33D]/40 text-[#5C3D0E] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors min-h-[44px]"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#C98A27]" />
                <span>نقشه پیش‌نیازها و سطوح</span>
              </button>

              <button
                onClick={() => handleLaunchStage(currentActiveStage)}
                className="flex-1 sm:flex-initial justify-center px-4 py-2 rounded-xl bg-[#7056D8] hover:bg-[#5E43C4] text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors min-h-[44px]"
              >
                <span>شروع درس {toPersianDigits(currentUnlockedStageNumber)}</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ================================================================== */}
      {/* 2. SUB-MODE 1: 100-STAGE STRUCTURED CURRICULUM                     */}
      {/* ================================================================== */}
      {subMode === 'stages_100' && (
        <div className="space-y-5">
          {/* Unit Filter & Curriculum Controls Bar */}
          <div className="bg-white rounded-2xl border border-[#E5E1EB] p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs font-bold w-full sm:w-auto pb-0.5 sm:pb-0">
              <button
                onClick={() => setUnitFilter('all')}
                className={`px-3.5 py-2 rounded-xl transition-colors cursor-pointer whitespace-nowrap border min-h-[44px] ${
                  unitFilter === 'all'
                    ? 'bg-[#24243B] border-[#24243B] text-white font-extrabold'
                    : 'bg-[#F7F5F0] border-[#E5E1EB] text-[#69697E] hover:text-[#24243B]'
                }`}
              >
                همه واحدها (۵ واحد)
              </button>
              {[1, 2, 3, 4, 5].map((uIdx) => {
                const theme = UNIT_EDITORIAL_THEMES[(uIdx - 1) % UNIT_EDITORIAL_THEMES.length];
                const isSelected = unitFilter === uIdx;
                return (
                  <button
                    key={uIdx}
                    onClick={() => setUnitFilter(uIdx)}
                    className={`px-3.5 py-2 rounded-xl transition-colors cursor-pointer whitespace-nowrap border min-h-[44px] ${
                      isSelected
                        ? `${theme.badgeBgClass} border-transparent text-white font-extrabold`
                        : 'bg-[#F7F5F0] border-[#E5E1EB] text-[#69697E] hover:text-[#24243B]'
                    }`}
                  >
                    واحد {toPersianDigits(uIdx)}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={handleJumpToActiveStage}
                className="flex-1 sm:flex-initial justify-center text-xs font-extrabold text-[#36345F] bg-[#EAE4FF] hover:bg-[#DDD3FF] px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors min-h-[44px]"
                title="پرش به درس فعال فعلی"
              >
                <Navigation className="w-3.5 h-3.5 text-[#7056D8]" />
                <span>درس فعال ({toPersianDigits(currentUnlockedStageNumber)})</span>
              </button>

              {unitFilter === 'all' && (
                <button
                  onClick={() => {
                    const allOpen = [1, 2, 3, 4, 5].every((u) => expandedUnits[u]);
                    handleExpandAllUnits(!allOpen);
                  }}
                  className="flex-1 sm:flex-initial justify-center text-xs font-bold text-[#69697E] hover:text-[#24243B] bg-[#F7F5F0] border border-[#E5E1EB] px-3.5 py-2 rounded-xl cursor-pointer transition-colors min-h-[44px]"
                >
                  {[1, 2, 3, 4, 5].every((u) => expandedUnits[u])
                    ? 'بستن همه واحدها'
                    : 'باز کردن همه واحدها'}
                </button>
              )}
            </div>
          </div>

          {/* Structured Expandable Units & Vertical Lesson Lists */}
          <div className="space-y-5">
            {groupedUnits.map((unitGroup) => {
              const completedInUnit = unitGroup.stages.filter(
                (s) => completedStagesMap[s.stageNumber] !== undefined
              ).length;
              const verifiedInUnit = unitGroup.stages.filter((s) => {
                const r = completedStagesMap[s.stageNumber];
                return Boolean(r?.verified === true || r?.source === 'online-verified');
              }).length;
              const isUnitCompleted = completedInUnit === unitGroup.stages.length;
              const hasActiveStage = unitGroup.stages.some(
                (s) => s.stageNumber === currentUnlockedStageNumber
              );
              const unitTheme =
                UNIT_EDITORIAL_THEMES[(unitGroup.unitIndex - 1) % UNIT_EDITORIAL_THEMES.length];
              const isExpanded = Boolean(expandedUnits[unitGroup.unitIndex]);
              const unitProgressPct = Math.round(
                (completedInUnit / unitGroup.stages.length) * 100
              );
              const firstStageNum = unitGroup.stages[0].stageNumber;
              const lastStageNum = unitGroup.stages[unitGroup.stages.length - 1].stageNumber;

              return (
                <section
                  key={unitGroup.unitIndex}
                  aria-label={`واحد ${toPersianDigits(unitGroup.unitIndex)}: ${unitGroup.unitTitle}`}
                  className="rounded-3xl bg-white border border-[#E5E1EB] overflow-hidden shadow-2xs"
                >
                  {/* Unit Header Band */}
                  <div
                    className={`${unitTheme.headerBgClass} border-b ${unitTheme.headerBorderClass} p-4 sm:p-6 transition-colors`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                        <UnitEditorialIllustration unitIndex={unitGroup.unitIndex} />

                        <div className="min-w-0 flex-1 text-right">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`px-2.5 py-0.5 rounded-lg text-[11px] font-extrabold ${unitTheme.badgeBgClass} ${unitTheme.badgeTextClass}`}
                            >
                              واحد {toPersianDigits(unitGroup.unitIndex)} از ۵
                            </span>
                            <span className="text-xs font-bold text-[#69697E]">
                              درس‌های {toPersianDigits(firstStageNum)} تا {toPersianDigits(lastStageNum)} ({toPersianDigits(unitGroup.stages.length)} درس)
                            </span>
                            {isUnitCompleted ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#DDF3E9] text-[#134E4A] text-[11px] font-extrabold">
                                <CheckCircle2 className="w-3.5 h-3.5 text-[#389D77]" />
                                <span>واحد تکمیل شد</span>
                              </span>
                            ) : hasActiveStage ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-white text-[#24243B] border border-[#E5E1EB] text-[11px] font-extrabold">
                                <span>در حال مطالعه</span>
                              </span>
                            ) : null}
                          </div>

                          <h3
                            className={`text-base sm:text-lg font-black ${unitTheme.accentTextClass} mt-1.5 leading-snug`}
                          >
                            {unitGroup.unitTitle}
                          </h3>

                          <div className="flex flex-wrap items-center gap-3 mt-2.5">
                            <div className="w-36 sm:w-44 h-2 bg-white/80 rounded-full overflow-hidden border border-[#E5E1EB]">
                              <div
                                className={`h-full ${unitTheme.progressBarClass} rounded-full transition-all duration-300`}
                                style={{ width: `${Math.max(4, unitProgressPct)}%` }}
                              />
                            </div>
                            <span className="text-xs font-extrabold text-[#24243B] tabular-nums">
                              {toPersianDigits(completedInUnit)} از {toPersianDigits(unitGroup.stages.length)} تکمیل‌شده ({toPersianDigits(unitProgressPct)}٪)
                            </span>
                            {verifiedInUnit > 0 && (
                              <span className="text-[11px] font-bold text-[#389D77]">
                                · {toPersianDigits(verifiedInUnit)} تأیید آنلاین
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Unit Header Actions: Guidebook & Expand/Collapse Toggle */}
                      <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            playDuoSound('click');
                            setGuidebookUnit(unitGroup);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#F7F5F0] border border-[#CFC9DA] text-[#24243B] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors min-h-[44px]"
                          title={`چکیده علمی ${unitGroup.unitTitle}`}
                        >
                          <BookOpen className="w-4 h-4 text-[#7056D8] shrink-0" />
                          <span>راهنمای واحد</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleUnitExpanded(unitGroup.unitIndex)}
                          aria-expanded={isExpanded}
                          aria-controls={`unit-lessons-panel-${unitGroup.unitIndex}`}
                          className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#F7F5F0] border border-[#CFC9DA] text-[#24243B] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors min-h-[44px]"
                        >
                          <span>{isExpanded ? 'بستن فهرست' : 'مشاهده درس‌ها'}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-[#69697E] shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-[#69697E] shrink-0" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Ordered Vertical Lesson List */}
                  {isExpanded && (
                    <div
                      id={`unit-lessons-panel-${unitGroup.unitIndex}`}
                      className="divide-y divide-[#E5E1EB]"
                    >
                      {unitGroup.stages.map((stage) => {
                        const stageRecord = completedStagesMap[stage.stageNumber];
                        const isCompleted = stageRecord !== undefined;
                        const isCurrent = stage.stageNumber === currentUnlockedStageNumber;
                        const isLocked = !isCompleted && !isCurrent;
                        const isVerifiedOnline = Boolean(
                          stageRecord?.verified === true ||
                            stageRecord?.source === 'online-verified'
                        );

                        return (
                          <div
                            key={stage.id}
                            id={`stage-node-${stage.stageNumber}`}
                            className={`p-4 sm:px-6 transition-colors ${
                              isCurrent
                                ? `${unitTheme.activeRowBgClass} border-r-4 ${unitTheme.activeRowBorderClass}`
                                : isCompleted
                                ? 'bg-white hover:bg-[#F7F5F0]/60'
                                : 'bg-[#F7F5F0]/40 hover:bg-[#F7F5F0]/80'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                              <div
                                onClick={() => handleStageClick(stage)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleStageClick(stage);
                                  }
                                }}
                                className="flex items-start gap-3.5 text-right cursor-pointer flex-1 min-w-0"
                              >
                                <div
                                  className={`w-11 h-11 rounded-2xl flex flex-col items-center justify-center shrink-0 border font-extrabold text-xs ${
                                    isCompleted
                                      ? isVerifiedOnline
                                        ? 'bg-[#DDF3E9] border-[#389D77]/40 text-[#134E4A]'
                                        : 'bg-[#FFF0C8] border-[#E5A33D]/60 text-[#5C3D0E]'
                                      : isCurrent
                                      ? `${unitTheme.badgeBgClass} border-transparent text-white shadow-2xs`
                                      : 'bg-white border-[#E5E1EB] text-[#69697E]'
                                  }`}
                                >
                                  {isCompleted ? (
                                    <Check className="w-5 h-5 stroke-[2.75]" />
                                  ) : isLocked ? (
                                    <Lock className="w-4 h-4 text-[#69697E]" />
                                  ) : (
                                    <span className="text-xs font-black tabular-nums">
                                      {toPersianDigits(stage.stageNumber)}
                                    </span>
                                  )}
                                </div>

                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-[11px] font-extrabold text-[#69697E]">
                                      درس {toPersianDigits(stage.stageNumber)}
                                    </span>

                                    {isCurrent && (
                                      <span
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold ${unitTheme.badgeBgClass} text-white`}
                                      >
                                        <span>نوبت مطالعه شما</span>
                                      </span>
                                    )}

                                    {isCompleted && isVerifiedOnline && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#DDF3E9] text-[#134E4A] text-[10px] font-extrabold">
                                        <ShieldCheck className="w-3 h-3 text-[#389D77]" />
                                        <span>تأییدشده آنلاین</span>
                                      </span>
                                    )}

                                    {isCompleted && !isVerifiedOnline && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FFF0C8] text-[#5C3D0E] text-[10px] font-extrabold">
                                        <CloudOff className="w-3 h-3 text-[#C98A27]" />
                                        <span>ذخیره محلی (نیازمند تأیید)</span>
                                      </span>
                                    )}

                                    {isLocked && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#E5E1EB]/80 text-[#69697E] text-[10px] font-bold">
                                        <Lock className="w-2.5 h-2.5" />
                                        <span>
                                          پیش‌نیاز: درس {toPersianDigits(stage.stageNumber - 1)}
                                        </span>
                                      </span>
                                    )}
                                  </div>

                                  <h4
                                    className={`text-sm sm:text-base font-extrabold leading-snug ${
                                      isLocked ? 'text-[#69697E]' : 'text-[#24243B]'
                                    }`}
                                  >
                                    {stage.title}
                                  </h4>

                                  {isCurrent && stage.keyTakeaway && (
                                    <p className="text-xs font-medium text-[#24243B]/85 leading-relaxed pt-0.5">
                                      {stage.keyTakeaway}
                                    </p>
                                  )}

                                  <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-bold text-[#69697E]">
                                    <span>{toPersianDigits(stage.questions.length)} پرسش مفهومی</span>
                                    <span>·</span>
                                    <span>+{toPersianDigits(stage.xpReward)} XP</span>
                                    {isCompleted && stageRecord && (
                                      <>
                                        <span>·</span>
                                        <span className="inline-flex items-center gap-0.5 text-[#C98A27]">
                                          {[1, 2, 3].map((sIdx) => (
                                            <Star
                                              key={sIdx}
                                              className={`w-3 h-3 ${
                                                sIdx <= (stageRecord.stars || 3)
                                                  ? 'fill-[#E5A33D] text-[#E5A33D]'
                                                  : 'fill-[#E5E1EB] text-[#CFC9DA]'
                                              }`}
                                            />
                                          ))}
                                          <span className="mr-1 text-[10px] font-extrabold text-[#5C3D0E]">
                                            ({toPersianDigits(stageRecord.stars || 3)} ستاره)
                                          </span>
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Contextual Lesson Action Button */}
                              <div className="flex items-center justify-end gap-2 w-full sm:w-auto shrink-0">
                                {isCurrent ? (
                                  <button
                                    onClick={() => handleLaunchStage(stage)}
                                    className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1.5 transition-colors min-h-[44px] ${unitTheme.ctaButtonClass}`}
                                  >
                                    <span>شروع درس {toPersianDigits(stage.stageNumber)}</span>
                                    <ArrowLeft className="w-3.5 h-3.5" />
                                  </button>
                                ) : isCompleted ? (
                                  <>
                                    {!isVerifiedOnline && (
                                      <button
                                        disabled={verifyingStageNum === stage.stageNumber}
                                        onClick={() => handleVerifyStageOnlineClick(stage, stageRecord)}
                                        className="flex-1 sm:flex-initial justify-center px-3 py-2 rounded-xl bg-[#FFF0C8] hover:bg-[#FCE5A8] border border-[#E5A33D] text-[#5C3D0E] text-xs font-extrabold cursor-pointer flex items-center gap-1.5 transition-colors min-h-[44px]"
                                      >
                                        {verifyingStageNum === stage.stageNumber ? (
                                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <ShieldCheck className="w-3.5 h-3.5 text-[#389D77]" />
                                        )}
                                        <span>تأیید آنلاین</span>
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleLaunchStage(stage)}
                                      className="flex-1 sm:flex-initial justify-center px-3.5 py-2 rounded-xl bg-white hover:bg-[#F7F5F0] border border-[#CFC9DA] text-[#24243B] text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-colors min-h-[44px]"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5 text-[#69697E]" />
                                      <span>مرور درس</span>
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => handleStageClick(stage)}
                                    className="w-full sm:w-auto justify-center px-3.5 py-2 rounded-xl bg-white hover:bg-[#F7F5F0] border border-[#E5E1EB] text-[#69697E] text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-colors min-h-[44px]"
                                  >
                                    <Lock className="w-3.5 h-3.5" />
                                    <span>جزئیات پیش‌نیاز</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {unitGroup.unitIndex === 5 && (
                    <div className="p-4 sm:p-6 bg-gradient-to-r from-[#FFF6D6] to-[#FFE5DC] border-t border-[#E5E1EB] flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-3 text-right">
                        <div className="w-12 h-12 rounded-2xl bg-[#E5A33D] text-white flex items-center justify-center text-xl font-black shrink-0 shadow-md">
                          🎁
                        </div>
                        <div>
                          <span className="text-xs font-black text-[#5C3D0E]">
                            صندوقچه طلایی نهایی (مرحله ۱۰۰)
                          </span>
                          <p className="text-xs font-bold text-[#24243B] mt-0.5">
                            پاداش ویژه +۱۵۰ الماس و نشان افتخار قهرمانی
                          </p>
                        </div>
                      </div>

                      {progress.claimedStageChests?.includes(100) ? (
                        <span className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#DDF3E9] text-[#134E4A] text-xs font-extrabold border border-[#389D77]/40 shrink-0">
                          <Check className="w-4 h-4 text-[#389D77]" />
                          <span>دریافت شد (+۱۵۰ الماس)</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            const prereq = stageExecutionEngine.isStagePrerequisiteMet(
                              100,
                              progress.completedStages
                            );
                            const isStage100Completed = Boolean(progress.completedStages?.[100]);
                            if (!prereq.isMet || !isStage100Completed) {
                              const missingNum = !prereq.isMet ? prereq.missingStageNumber || 1 : 100;
                              setVerifyFeedbackMsg(
                                `امکان دریافت پاداش صندوقچه وجود ندارد: ابتدا باید مراحل پیش‌نیاز (از جمله مرحله ${toPersianDigits(
                                  missingNum
                                )}) را کامل کنید.`
                              );
                              return;
                            }
                            if (onClaimStageChest) {
                              onClaimStageChest(100);
                            }
                          }}
                          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold cursor-pointer transition-all shadow-sm shrink-0 min-h-[44px] ${
                            stageExecutionEngine.isStagePrerequisiteMet(
                              100,
                              progress.completedStages
                            ).isMet && Boolean(progress.completedStages?.[100])
                              ? 'bg-[#E5A33D] hover:bg-[#D4922C] text-white'
                              : 'bg-[#E5E1EB] text-[#69697E] cursor-not-allowed'
                          }`}
                        >
                          باز کردن صندوقچه ۱۰۰ (+۱۵۰ الماس)
                        </button>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 3. SUB-MODE 2: TEXTBOOK SECTIONS OVERVIEW                          */}
      {/* ================================================================== */}
      {subMode === 'sections_overview' && (
        <div className="space-y-5">
          {sections.map((section, secIdx) => {
            const secTheme = UNIT_EDITORIAL_THEMES[secIdx % UNIT_EDITORIAL_THEMES.length];
            return (
              <section
                key={section.id}
                className="rounded-3xl bg-white border border-[#E5E1EB] overflow-hidden shadow-2xs"
              >
                <div
                  className={`${secTheme.headerBgClass} border-b ${secTheme.headerBorderClass} p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
                >
                  <div className="text-right">
                    <span
                      className={`inline-block text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg ${secTheme.badgeBgClass} ${secTheme.badgeTextClass}`}
                    >
                      بخش {toPersianDigits(section.id)} · {section.subTitle}
                    </span>
                    <h3 className={`text-base sm:text-lg font-black ${secTheme.accentTextClass} mt-1.5`}>
                      {section.title}
                    </h3>
                  </div>

                  <button
                    onClick={() => {
                      playDuoSound('click');
                      handleOpenChapterInReader(section.chapters[0]);
                    }}
                    className={`w-full sm:w-auto justify-center rounded-xl px-4 py-2.5 flex items-center gap-1.5 text-xs font-extrabold cursor-pointer shrink-0 min-h-[44px] ${secTheme.ctaButtonClass}`}
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>مطالعه کتابچه بخش {toPersianDigits(section.id)}</span>
                  </button>
                </div>

                <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {section.chapters.map((chap) => {
                    const isChapDone = progress.completedChapters.includes(chap.id);
                    return (
                      <div
                        key={chap.id}
                        onClick={() => {
                          playDuoSound('click');
                          handleOpenChapterInReader(chap);
                        }}
                        className={`p-4 rounded-2xl border transition-colors cursor-pointer flex flex-col justify-between text-right ${
                          isChapDone
                            ? 'bg-[#DDF3E9]/45 border-[#389D77]/40'
                            : 'bg-[#F7F5F0]/60 border-[#E5E1EB] hover:bg-white hover:border-[#CFC9DA]'
                        }`}
                      >
                        <div>
                          <span className="text-[11px] font-bold text-[#69697E] block">
                            {chap.chapterNumber}
                          </span>
                          <h4 className="text-sm font-extrabold text-[#24243B] mt-1">
                            {chap.title}
                          </h4>
                        </div>

                        <div className="flex items-center justify-between mt-3.5 pt-2.5 border-t border-[#E5E1EB] text-xs font-bold text-[#69697E]">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {toPersianDigits(chap.estimatedMinutes)} دقیقه مطالعه
                          </span>
                          {isChapDone ? (
                            <span className="text-[#389D77] font-extrabold flex items-center gap-1">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              مطالعه شده
                            </span>
                          ) : (
                            <span className="text-[#7056D8] font-extrabold flex items-center gap-1">
                              <span>مطالعه فصل</span>
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ================================================================== */}
      {/* 4. SUB-MODE 3: FULL ACADEMIC TEXTBOOK READER (`BookReaderView`)    */}
      {/* ================================================================== */}
      {subMode === 'book_reader' && (
        <BookReaderView
          sections={sections}
          currentChapter={currentChapter}
          onSelectChapter={handleOpenChapterInReader}
          onStartQuiz={onStartQuiz}
          progress={progress}
          onToggleBookmark={onToggleBookmark}
          onTogglePin={onTogglePin}
          onSaveNote={onSaveNote}
          onMarkCompleted={onMarkCompleted}
          onAskMentorAboutChapter={onAskMentorAboutChapter}
          onOpenPomodoro={onOpenPomodoro}
          onUpdateSettings={onUpdateSettings}
        />
      )}

      {/* ================================================================== */}
      {/* 5. SUB-MODE 4: PERSONAL STUDY NOTEBOOK & FLASHCARDS (`NotebookView`)*/}
      {/* ================================================================== */}
      {subMode === 'notes' && (
        <NotebookView
          sections={sections}
          progress={progress}
          onSelectChapter={handleOpenChapterInReader}
          onSaveNote={onSaveNote}
        />
      )}

      {/* ================================================================== */}
      {/* MODALS: INTERACTIVE STAGE PLAYER, PREREQUISITES, GUIDEBOOK, PREVIEW*/}
      {/* ================================================================== */}
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
          setTimeout(() => {
            const nextUnlocked = getUnlockedStageNumber(progress.completedStages);
            const el = document.getElementById(`stage-node-${nextUnlocked}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 150);
        }}
        onCompleteStage={(record) => {
          if (onCompleteStage) {
            onCompleteStage(record);
          }
        }}
        onStartNextStage={handleStartNextStage}
      />

      <PrerequisiteInspectorModal
        isOpen={isPrerequisiteInspectorOpen}
        onClose={() => setIsPrerequisiteInspectorOpen(false)}
      />

      {guidebookUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#24243B]/55 backdrop-blur-[2px] select-none">
          <div className="bg-white border border-[#E5E1EB] rounded-3xl p-5 sm:p-6 max-w-lg w-full text-right shadow-2xl relative max-h-[85dvh] flex flex-col">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#E5E1EB]">
              <div className="flex items-center gap-3 min-w-0">
                <UnitEditorialIllustration unitIndex={guidebookUnit.unitIndex} />
                <div className="min-w-0">
                  <span className="text-[11px] font-extrabold text-[#7056D8]">
                    راهنمای علمی واحد {toPersianDigits(guidebookUnit.unitIndex)}
                  </span>
                  <h3 className="text-base font-black text-[#24243B] truncate">
                    {guidebookUnit.unitTitle}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setGuidebookUnit(null)}
                className="p-2 rounded-xl text-[#69697E] hover:text-[#24243B] hover:bg-[#F7F5F0] cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                aria-label="بستن راهنما"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-2.5 my-4 pr-1 overscroll-contain">
              {guidebookUnit.stages.map((st) => {
                const isStDone = completedStagesMap[st.stageNumber] !== undefined;
                return (
                  <div
                    key={st.id}
                    onClick={() => {
                      setGuidebookUnit(null);
                      handleStageClick(st);
                    }}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-colors ${
                      isStDone
                        ? 'bg-[#DDF3E9]/50 border-[#389D77]/40'
                        : 'bg-[#F7F5F0] border-[#E5E1EB] hover:border-[#CFC9DA]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-extrabold text-[#24243B]">
                      <span>
                        درس {toPersianDigits(st.stageNumber)}: {st.title}
                      </span>
                      {isStDone && <Check className="w-4 h-4 text-[#389D77] stroke-[2.75]" />}
                    </div>
                    <p className="text-xs font-medium text-[#69697E] mt-1.5 leading-relaxed">
                      {st.keyTakeaway}
                    </p>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setGuidebookUnit(null)}
              className="w-full py-3 rounded-2xl bg-[#36345F] hover:bg-[#24243B] text-white text-xs font-extrabold cursor-pointer transition-colors min-h-[44px]"
            >
              بستن راهنمای واحد
            </button>
          </div>
        </div>
      )}

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
                          setExpandedUnits((prev) => ({
                            ...prev,
                            [targetStage.unitIndex]: true,
                          }));
                          setTimeout(() => {
                            const el = document.getElementById(
                              `stage-node-${requiredPrereqNumber}`
                            );
                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            handleStageClick(targetStage);
                          }, 100);
                        }
                      }}
                      className="w-full py-3 rounded-2xl bg-[#7056D8] hover:bg-[#5E43C4] text-white text-xs font-extrabold cursor-pointer transition-colors min-h-[44px]"
                    >
                      رفتن به درس پیش‌نیاز ({toPersianDigits(requiredPrereqNumber)})
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
