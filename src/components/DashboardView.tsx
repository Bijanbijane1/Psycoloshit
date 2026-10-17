import React, { useState, useMemo, useRef } from 'react';
import { Section, Chapter, UserProgress, DuolingoStage, StageCompletionRecord } from '../types/psychology';
import { calculateUserAnalytics } from '../utils/adaptiveEngine';
import {
  BookOpen,
  Zap,
  Crown,
  Lock,
  Check,
  Star,
  Gift,
  Trophy,
  Award,
  Flame,
  Sparkles,
  ChevronLeft,
  X,
  Compass,
  Heart,
  Volume2,
  Filter,
  Navigation,
  ArrowRight,
  Layers,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { DuoMascot } from './DuoMascot';
import { BadgeIcon } from './BadgeIcon';
import { BADGE_DEFINITIONS, evaluateBadgeProgress } from '../data/badgeDefinitions';
import { playDuoSound } from '../utils/duoAudio';
import { SECTION_1_STAGES, isStageUnlocked, getUnlockedStageNumber } from '../data/section1Stages';
import { stageExecutionEngine } from '../services/stageExecutionEngine';
import { DuolingoStageModal } from './DuolingoStageModal';
import { PrerequisiteInspectorModal } from './PrerequisiteInspectorModal';
import confetti from 'canvas-confetti';

interface DashboardViewProps {
  sections: Section[];
  progress: UserProgress;
  onSelectChapter: (chapter: Chapter) => void;
  onStartQuiz: (chapter?: Chapter) => void;
  onOpenNotes: () => void;
  onOpenBadges?: () => void;
  onCompleteStage?: (record: StageCompletionRecord) => void;
}

// Academic Indigo, Sapphire, Amethyst, and Slate unit color themes
const UNIT_THEMES = [
  { bg: 'bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-700', border: 'border-indigo-800', text: 'text-white', lightBg: 'bg-indigo-50/70', name: 'نیلی آکادمیک' },
  { bg: 'bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-700', border: 'border-blue-800', text: 'text-white', lightBg: 'bg-sky-50/70', name: 'یاقوت کبود' },
  { bg: 'bg-gradient-to-r from-violet-700 via-purple-600 to-indigo-700', border: 'border-violet-800', text: 'text-white', lightBg: 'bg-purple-50/70', name: 'آمتیست سلطنتی' },
  { bg: 'bg-gradient-to-r from-teal-700 via-emerald-600 to-teal-700', border: 'border-teal-800', text: 'text-white', lightBg: 'bg-emerald-50/70', name: 'زمرد خرد' },
  { bg: 'bg-gradient-to-r from-slate-800 via-slate-700 to-indigo-900', border: 'border-slate-900', text: 'text-white', lightBg: 'bg-slate-100/70', name: 'سرمه‌ای عمیق' },
  { bg: 'bg-gradient-to-r from-rose-700 via-pink-600 to-rose-700', border: 'border-rose-800', text: 'text-white', lightBg: 'bg-rose-50/70', name: 'مرجانی متین' },
];

// Winding sine offsets in pixels (tuned for seamless mobile and desktop display without horizontal overflow)
const SINE_OFFSETS = [0, 36, 60, 36, 0, -36, -60, -36];

export const DashboardView: React.FC<DashboardViewProps> = ({
  sections,
  progress,
  onSelectChapter,
  onStartQuiz,
  onOpenNotes,
  onOpenBadges,
  onCompleteStage,
}) => {
  const stats = calculateUserAnalytics(progress);

  // Active view mode: 100-stage path vs sections overview
  const [viewMode, setViewMode] = useState<'stages_100' | 'sections_overview'>('stages_100');

  // Unit filter for the 100 stages
  const [unitFilter, setUnitFilter] = useState<number | 'all'>('all');

  // Stage modal states
  const [activeStage, setActiveStage] = useState<DuolingoStage | null>(null);
  const [isStageModalOpen, setIsStageModalOpen] = useState<boolean>(false);
  const [isStageLockedState, setIsStageLockedState] = useState<boolean>(false);
  const [isPrerequisiteInspectorOpen, setIsPrerequisiteInspectorOpen] = useState<boolean>(false);
  const [previewStage, setPreviewStage] = useState<DuolingoStage | null>(null);

  // Automated Curriculum & Difficulty State Management Engine
  const allStages = useMemo(() => stageExecutionEngine.getSortedStages(), []);
  const auditReport = useMemo(() => stageExecutionEngine.runCurriculumAudit(), []);

  // Traditional chapter popup state
  const [selectedNodeChapter, setSelectedNodeChapter] = useState<Chapter | null>(null);
  const [claimedChestIds, setClaimedChestIds] = useState<number[]>([]);
  const [claimedChestModal, setClaimedChestModal] = useState<{
    chestId: number;
    xpReward: number;
    title: string;
  } | null>(null);

  // 100 Stages progression calculations
  const completedStagesMap = progress.completedStages || {};
  const completedStageNumbers = Object.keys(completedStagesMap).map(Number);
  const completedStageCount = completedStageNumbers.length;
  const currentUnlockedStageNumber = stageExecutionEngine.calculateUnlockedStageNumber(progress.completedStages);

  // Find the active stage object
  const currentActiveStage = useMemo(() => {
    return (
      allStages.find((s) => s.stageNumber === currentUnlockedStageNumber) ||
      allStages[0]
    );
  }, [allStages, currentUnlockedStageNumber]);

  // Filter stages based on active unit filter
  const displayedStages = useMemo(() => {
    if (unitFilter === 'all') return allStages;
    return allStages.filter((s) => s.unitIndex === unitFilter);
  }, [allStages, unitFilter]);

  // Group displayed stages into their respective units
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

  const evaluatedBadges = BADGE_DEFINITIONS.map((b) =>
    evaluateBadgeProgress(b, progress, sections)
  );
  const unlockedBadges = evaluatedBadges.filter((b) => b.isUnlocked);

  // Handle stage node click to show tactile preview card
  const handleStageClick = (stage: DuolingoStage) => {
    playDuoSound('click');
    setPreviewStage(stage);
  };

  // Launch stage from preview card
  const handleLaunchStage = (stage: DuolingoStage) => {
    setPreviewStage(null);
    const prereqCheck = stageExecutionEngine.isStagePrerequisiteMet(stage.stageNumber, progress.completedStages);
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

  // Handle start next stage from modal victory screen
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

  // Handle claim milestone chest
  const handleClaimStageChest = (chestId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const alreadyClaimed = claimedChestIds.includes(chestId);
    if (!alreadyClaimed) {
      playDuoSound('chest');
      setClaimedChestIds((prev) => [...prev, chestId]);
      confetti({
        particleCount: 85,
        spread: 80,
        origin: { y: 0.5 },
        colors: ['#FFC800', '#58CC02', '#1CB0F6', '#CE82FF'],
      });
    } else {
      playDuoSound('click');
    }

    setClaimedChestModal({
      chestId,
      xpReward: 50,
      title: alreadyClaimed
        ? `صندوقچه مرحله ${chestId} (قبلاً باز شده)`
        : `صندوقچه طلایی مرحله ${chestId} باز شد! 🎉`,
    });
  };

  // Scroll to active stage node smoothly
  const handleJumpToActiveStage = () => {
    playDuoSound('click');
    setUnitFilter('all');
    setTimeout(() => {
      const el = document.getElementById(`stage-node-${currentUnlockedStageNumber}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  return (
    <div className="flex flex-col lg:flex-row items-start gap-8 pb-20 select-none">
      {/* ======================================================== */}
      {/* MAIN COLUMN: Duolingo Learning Path (100 Chained Stages) */}
      {/* ======================================================== */}
      <div className="flex-1 w-full flex flex-col items-center">
        {/* Top Header Card: 100-Stage Journey Overview (Frosted Glass & Academic Neumorphic) */}
        <div className="w-full max-w-xl lg:max-w-2xl xl:max-w-3xl mb-6 glass-panel rounded-3xl p-4 sm:p-6 shadow-sm border border-white/80 relative overflow-hidden">
          <div className="flex items-center justify-between gap-3 mb-3.5">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-2xl bg-gradient-to-tr from-indigo-100 to-white shadow-2xs border border-indigo-100">
                <DuoMascot mood="streak" size={44} animate={false} />
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    بخش اول: ۱۰۰ مرحله نقشه راه یادگیری
                  </h2>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200/60 shadow-2xs">
                    روان‌شناسی
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-500 mt-0.5">
                  مبانی و فلسفه علم روان‌شناسی
                </p>
              </div>
            </div>

            {/* Quick Play Active Stage Button */}
            <button
              onClick={() => handleStageClick(currentActiveStage)}
              className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white px-4 py-2 rounded-2xl text-xs font-black cursor-pointer flex items-center gap-1.5 shadow-md shadow-indigo-600/25 transition-all hover:scale-102"
              title="شروع مرحله فعال"
            >
              <Zap className="w-3.5 h-3.5 fill-white" />
              <span>مرحله {currentUnlockedStageNumber}</span>
            </button>
          </div>

          {/* Clean Progress bar */}
          <div className="space-y-1.5 pt-3 border-t border-slate-100/80">
            <div className="flex items-center justify-between text-xs font-black">
              <span className="text-slate-600 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                <span>
                  {completedStageCount} از ۱۰۰ مرحله تکمیل شده ({Math.round((completedStageCount / 100) * 100)}٪)
                </span>
              </span>
              <span className="text-indigo-600 font-extrabold">
                سطح فعال: {currentUnlockedStageNumber}
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
              <div
                className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-500 rounded-full transition-all duration-500 shadow-2xs"
                style={{ width: `${Math.max(2, (completedStageCount / 100) * 100)}%` }}
              />
            </div>
          </div>

          {/* Unit Filter Chips & Jump Bar */}
          <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-100 flex-wrap">
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 max-w-full text-xs font-black">
              <button
                onClick={() => setUnitFilter('all')}
                className={`px-2.5 py-1 rounded-xl transition-all cursor-pointer ${
                  unitFilter === 'all'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                همه
              </button>
              {[1, 2, 3, 4, 5].map((uIdx) => (
                <button
                  key={uIdx}
                  onClick={() => setUnitFilter(uIdx)}
                  className={`px-2 py-1 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                    unitFilter === uIdx
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  واحد {uIdx}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {/* Prerequisite & Difficulty State Management Inspector Button */}
              <button
                onClick={() => setIsPrerequisiteInspectorOpen(true)}
                className="text-[11px] font-black text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                title="مشاهده سیستم مدیریت وضعیت، توالی پیش‌نیازها و گیت سختی"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>گیت سختی و پیش‌نیازها</span>
              </button>

              {/* Jump to active button */}
              <button
                onClick={handleJumpToActiveStage}
                className="text-[11px] font-black text-indigo-600 hover:text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-xl flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Navigation className="w-3 h-3" />
                <span>مرحله {currentUnlockedStageNumber}</span>
              </button>
            </div>
          </div>
        </div>

        {/* View Mode Switcher: 100 Stages vs 12 Sections */}
        <div className="w-full max-w-xl flex items-center justify-between mb-6 px-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('stages_100')}
              className={`px-4 py-2 rounded-2xl text-xs font-black cursor-pointer transition-all border-b-3 ${
                viewMode === 'stages_100'
                  ? 'bg-emerald-500 text-white border-emerald-700 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              مسیر ۱۰۰ مرحله‌ای بخش اول (فعال)
            </button>
            <button
              onClick={() => setViewMode('sections_overview')}
              className={`px-4 py-2 rounded-2xl text-xs font-black cursor-pointer transition-all border-b-3 ${
                viewMode === 'sections_overview'
                  ? 'bg-indigo-600 text-white border-indigo-800 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              نمای کلی بخش‌های دیگر
            </button>
          </div>

          <span className="text-[11px] font-bold text-slate-400">
            {viewMode === 'stages_100' ? '۱۰۰ مرحله زنجیره‌ای' : '۱۲ بخش جامع'}
          </span>
        </div>

        {/* ================================================================ */}
        {/* VIEW 1: THE 100-STAGE CHAINED SERPENTINE ROAD                    */}
        {/* ================================================================ */}
        {viewMode === 'stages_100' && (
          <div className="w-full max-w-xl flex flex-col items-center gap-12">
            {groupedUnits.map((unitGroup) => {
              const theme = UNIT_THEMES[(unitGroup.unitIndex - 1) % UNIT_THEMES.length];
              const completedInUnit = unitGroup.stages.filter(
                (s) => completedStagesMap[s.stageNumber] !== undefined
              ).length;
              const isUnitCompleted = completedInUnit === unitGroup.stages.length;

              return (
                <div key={unitGroup.unitIndex} className="w-full flex flex-col items-center">
                  {/* ---------------------------------------------------- */}
                  {/* Unit Dividing Banner                                 */}
                  {/* ---------------------------------------------------- */}
                  <div
                    className={`w-full ${theme.bg} ${theme.text} rounded-3xl p-5 border-b-5 ${theme.border} shadow-md flex items-center justify-between mb-8 transition-transform`}
                  >
                    <div className="flex flex-col text-right min-w-0 flex-1">
                      <span className="text-xs font-black uppercase tracking-wider opacity-90 truncate">
                        واحد {unitGroup.unitIndex} از ۵ · مراحل {unitGroup.stages[0].stageNumber} الی{' '}
                        {unitGroup.stages[unitGroup.stages.length - 1].stageNumber}
                      </span>
                      <h3 className="text-lg sm:text-xl font-black mt-0.5 leading-snug">
                        {unitGroup.unitTitle}
                      </h3>
                      <div className="flex items-center gap-2 mt-2 text-xs font-bold opacity-90 flex-wrap">
                        <span>پیشرفت این واحد:</span>
                        <div className="w-24 h-3 bg-black/20 rounded-full overflow-hidden p-0.5">
                          <div
                            className="h-full bg-white rounded-full transition-all"
                            style={{
                              width: `${(completedInUnit / unitGroup.stages.length) * 100}%`,
                            }}
                          />
                        </div>
                        <span>
                          {completedInUnit}/{unitGroup.stages.length} مرحله
                        </span>
                      </div>
                    </div>

                    {/* Unit Trophy Icon */}
                    <div className="w-12 h-12 rounded-2xl bg-white/20 border-2 border-white/40 flex items-center justify-center text-white shadow-2xs shrink-0">
                      {isUnitCompleted ? (
                        <Trophy className="w-6 h-6 fill-white" />
                      ) : (
                        <BookOpen className="w-6 h-6" />
                      )}
                    </div>
                  </div>

                  {/* ---------------------------------------------------- */}
                  {/* Serpentine Winding Nodes with SVG Road for this Unit  */}
                  {/* ---------------------------------------------------- */}
                  {(() => {
                    const roadPoints = unitGroup.stages.map((st, idx) => ({
                      x: 200 + SINE_OFFSETS[(st.stageNumber - 1) % SINE_OFFSETS.length],
                      y: idx * 136 + 48,
                      isCompleted: completedStagesMap[st.stageNumber] !== undefined,
                      isCurrent: st.stageNumber === currentUnlockedStageNumber,
                    }));

                    let fullRoadPath = '';
                    if (roadPoints.length > 0) {
                      fullRoadPath = `M ${roadPoints[0].x} ${roadPoints[0].y}`;
                      for (let i = 1; i < roadPoints.length; i++) {
                        const prev = roadPoints[i - 1];
                        const curr = roadPoints[i];
                        const dy = curr.y - prev.y;
                        fullRoadPath += ` C ${prev.x} ${prev.y + dy * 0.5}, ${curr.x} ${curr.y - dy * 0.5}, ${curr.x} ${curr.y}`;
                      }
                    }

                    let activeRoadPath = '';
                    const currentIdx = roadPoints.findIndex((p) => p.isCurrent);
                    const maxProgIdx = currentIdx >= 0 ? currentIdx : (roadPoints.filter((p) => p.isCompleted).length > 0 ? roadPoints.length - 1 : 0);
                    if (roadPoints.length > 0 && maxProgIdx > 0) {
                      activeRoadPath = `M ${roadPoints[0].x} ${roadPoints[0].y}`;
                      for (let i = 1; i <= maxProgIdx; i++) {
                        const prev = roadPoints[i - 1];
                        const curr = roadPoints[i];
                        const dy = curr.y - prev.y;
                        activeRoadPath += ` C ${prev.x} ${prev.y + dy * 0.5}, ${curr.x} ${curr.y - dy * 0.5}, ${curr.x} ${curr.y}`;
                      }
                    }

                    const totalUnitHeight = unitGroup.stages.length * 136 + 40;

                    return (
                      <div
                        className="relative w-full max-w-[340px] sm:max-w-[400px] flex flex-col items-center py-2 select-none overflow-x-hidden"
                        style={{ height: totalUnitHeight }}
                      >
                        {/* Continuous SVG Serpentine Road */}
                        <svg
                          className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[400px] pointer-events-none z-0"
                          style={{ height: totalUnitHeight }}
                          viewBox={`0 0 400 ${totalUnitHeight}`}
                          preserveAspectRatio="xMidYMid meet"
                        >
                          {/* Ground Road Base Shadow */}
                          <path
                            d={fullRoadPath}
                            fill="none"
                            stroke="#CBD5E1"
                            strokeWidth="28"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="opacity-75"
                          />
                          {/* Paved Cobblestone Road Surface */}
                          <path
                            d={fullRoadPath}
                            fill="none"
                            stroke="#F8FAFC"
                            strokeWidth="20"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {/* Center Road Markings */}
                          <path
                            d={fullRoadPath}
                            fill="none"
                            stroke="#CBD5E1"
                            strokeWidth="3"
                            strokeDasharray="6 8"
                            strokeLinecap="round"
                          />
                          {/* Energized Completed Road Trail */}
                          {activeRoadPath && (
                            <path
                              d={activeRoadPath}
                              fill="none"
                              stroke="#4F46E5"
                              strokeWidth="6"
                              strokeDasharray="8 6"
                              strokeLinecap="round"
                              className="opacity-95"
                            />
                          )}
                        </svg>

                        {/* Interactive Stepping Stone Nodes */}
                        {unitGroup.stages.map((stage, idx) => {
                          const offsetPx = SINE_OFFSETS[(stage.stageNumber - 1) % SINE_OFFSETS.length];
                          const isCompleted = completedStagesMap[stage.stageNumber] !== undefined;
                          const isCurrent = stage.stageNumber === currentUnlockedStageNumber;
                          const isLocked = !isCompleted && !isCurrent;
                          const stageRecord = completedStagesMap[stage.stageNumber];
                          const isMilestone = stage.stageNumber % 10 === 0;

                          return (
                            <div
                              key={stage.id}
                              id={`stage-node-${stage.stageNumber}`}
                              className="absolute left-1/2 z-10 flex flex-col items-center transition-all duration-300"
                              style={{
                                top: idx * 136 + 10,
                                transform: `translateX(calc(-50% + ${offsetPx}px))`,
                              }}
                            >
                              {/* Duo Mascot perched on current active node! */}
                              {isCurrent && (
                                <div className="absolute -top-19 z-20 flex flex-col items-center pointer-events-none animate-float-mascot">
                                  <div className="bg-white/95 backdrop-blur-md border border-slate-200 border-b-4 border-b-indigo-200/80 rounded-2xl px-3.5 py-1.5 shadow-md text-xs font-black text-indigo-700 flex items-center gap-1.5 duo-bubble-caret relative">
                                    <span>مرحله {stage.stageNumber}: شروع کن!</span>
                                    <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                                  </div>
                                  <DuoMascot mood="happy" size={54} animate={false} className="mt-1" />
                                </div>
                              )}

                              {/* Duolingo 3D Stepping Stone Button - Refined Academic Gems */}
                              <button
                                onClick={() => handleStageClick(stage)}
                                className={`w-19 h-19 sm:w-21 sm:h-21 rounded-full flex items-center justify-center cursor-pointer transition-all active:translate-y-1 relative group ${
                                  isCompleted
                                    ? 'bg-gradient-to-tr from-amber-400 via-amber-300 to-amber-200 border-b-[6px] border-amber-600 text-amber-950 shadow-md hover:scale-105'
                                    : isCurrent
                                    ? 'bg-gradient-to-tr from-indigo-700 via-indigo-600 to-blue-600 border-b-[6px] border-indigo-900 text-white shadow-xl duo-active-node hover:scale-105'
                                    : 'bg-slate-200/85 border-b-[6px] border-slate-300/90 text-slate-400 hover:bg-slate-200'
                                }`}
                                title={`${stage.stageNumber}. ${stage.title} (${isLocked ? 'قفل' : isCompleted ? 'تکمیل شده' : 'مرحله جاری'})`}
                              >
                                {/* Inner icon */}
                                {isCompleted ? (
                                  <Check className="w-8 h-8 stroke-[3.5] text-amber-950" />
                                ) : isCurrent ? (
                                  <Star className="w-8 h-8 fill-white text-white drop-shadow-xs" />
                                ) : (
                                  <Lock className="w-6 h-6 text-slate-400" />
                                )}

                                {/* Level Number badge */}
                                <div
                                  className={`absolute -bottom-2 -left-1 px-2 py-0.5 rounded-full text-[10px] font-black border shadow-2xs ${
                                    isCompleted
                                      ? 'bg-amber-100 text-amber-950 border-amber-300'
                                      : isCurrent
                                      ? 'bg-indigo-100 text-indigo-950 border-indigo-300'
                                      : 'bg-white text-slate-500 border-slate-300'
                                  }`}
                                >
                                  {stage.stageNumber}
                                </div>

                                {/* Milestone Crown for Boss or Checkpoint */}
                                {isMilestone && (
                                  <div className="absolute -top-2 -right-1 p-1 rounded-full bg-[#FFC800] text-amber-950 shadow-xs border border-white">
                                    <Crown className="w-3.5 h-3.5 fill-current" />
                                  </div>
                                )}
                              </button>

                              {/* Stars earned under completed node */}
                              {isCompleted && stageRecord && (
                                <div className="flex items-center gap-0.5 mt-1.5 px-2 py-0.5 bg-amber-50 rounded-full border border-amber-200 shadow-2xs">
                                  {[1, 2, 3].map((sIdx) => (
                                    <Star
                                      key={sIdx}
                                      className={`w-3 h-3 ${
                                        sIdx <= (stageRecord.stars || 3)
                                          ? 'fill-[#FFC800] text-[#FFC800]'
                                          : 'fill-slate-200 text-slate-300'
                                      }`}
                                    />
                                  ))}
                                </div>
                              )}

                              {/* Stage title chip underneath */}
                              <span
                                className={`text-[11px] font-black mt-1 max-w-[130px] text-center truncate ${
                                  isCurrent
                                    ? 'text-[#46A302]'
                                    : isCompleted
                                    ? 'text-amber-900'
                                    : 'text-slate-400'
                                }`}
                              >
                                {stage.title}
                              </span>

                              {/* Milestone Golden Treasure Chest every 10 stages */}
                              {isMilestone && (
                                <div
                                  className="absolute -right-16 top-2 flex flex-col items-center cursor-pointer group"
                                  onClick={(e) => handleClaimStageChest(stage.stageNumber, e)}
                                >
                                  <div
                                    className={`w-12 h-12 rounded-2xl flex items-center justify-center border-b-[4px] transition-transform shadow-md ${
                                      claimedChestIds.includes(stage.stageNumber)
                                        ? 'bg-slate-200 border-slate-300 text-slate-400'
                                        : isCompleted
                                        ? 'bg-[#FFC800] border-[#E5A500] text-amber-950 hover:scale-110 animate-bounce'
                                        : 'bg-[#FF9600] border-[#E58500] text-white hover:scale-105'
                                    }`}
                                    title={
                                      claimedChestIds.includes(stage.stageNumber)
                                        ? 'پاداش باز شد!'
                                        : `صندوقچه جایزه مرحله ${stage.stageNumber}`
                                    }
                                  >
                                    {claimedChestIds.includes(stage.stageNumber) ? (
                                      <Check className="w-5 h-5 text-slate-400" />
                                    ) : (
                                      <Gift className="w-6 h-6 fill-current" />
                                    )}
                                  </div>
                                  <span className="text-[8px] font-black text-slate-500 mt-0.5">
                                    {claimedChestIds.includes(stage.stageNumber)
                                      ? 'باز شد'
                                      : `جایزه ${stage.stageNumber}`}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}

        {/* ================================================================ */}
        {/* VIEW 2: TRADITIONAL SECTIONS OVERVIEW (Sections 2-6)             */}
        {/* ================================================================ */}
        {viewMode === 'sections_overview' && (
          <div className="w-full max-w-xl flex flex-col items-center gap-10">
            {sections.map((section, sectionIdx) => {
              const theme = UNIT_THEMES[sectionIdx % UNIT_THEMES.length];
              const sectionCompletedCount = section.chapters.filter((c) =>
                progress.completedChapters.includes(c.id)
              ).length;

              return (
                <div key={section.id} className="w-full flex flex-col items-center">
                  <div
                    className={`w-full ${theme.bg} ${theme.text} rounded-3xl p-5 border-b-5 ${theme.border} shadow-md flex items-center justify-between mb-6`}
                  >
                    <div className="text-right">
                      <span className="text-xs font-black uppercase opacity-90">
                        بخش {section.id} · {section.subTitle}
                      </span>
                      <h3 className="text-lg sm:text-xl font-black mt-0.5">{section.title}</h3>
                      {section.id === 1 && (
                        <span className="inline-block mt-2 text-[10px] font-black bg-white/20 px-2.5 py-0.5 rounded-full">
                          🔥 دارای ۱۰۰ مرحله کامل زنجیره‌ای فعال
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        if (section.id === 1) {
                          setViewMode('stages_100');
                        } else {
                          playDuoSound('click');
                          onSelectChapter(section.chapters[0]);
                        }
                      }}
                      className="bg-white/20 hover:bg-white/30 border-2 border-white/40 rounded-xl px-3 py-2 flex items-center gap-1.5 text-xs font-black text-white cursor-pointer transition-colors shadow-2xs"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>{section.id === 1 ? 'مشاهده ۱۰۰ مرحله' : 'ورود به بخش'}</span>
                    </button>
                  </div>

                  {/* Chapters cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                    {section.chapters.map((chap) => {
                      const isChapDone = progress.completedChapters.includes(chap.id);
                      return (
                        <div
                          key={chap.id}
                          onClick={() => {
                            playDuoSound('click');
                            onSelectChapter(chap);
                          }}
                          className={`p-4 rounded-2xl border-2 border-b-4 transition-all cursor-pointer flex flex-col justify-between text-right ${
                            isChapDone
                              ? 'bg-amber-50/60 border-amber-300'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div>
                            <span className="text-[10px] font-black text-slate-400 block">
                              {chap.chapterNumber}
                            </span>
                            <h4 className="text-sm font-black text-slate-800 mt-0.5">
                              {chap.title}
                            </h4>
                          </div>

                          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 text-xs font-bold text-slate-500">
                            <span>{chap.estimatedMinutes} دقیقه مطالعه</span>
                            {isChapDone ? (
                              <span className="text-[#58CC02] font-black flex items-center gap-1">
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                                مطالعه شده
                              </span>
                            ) : (
                              <span className="text-indigo-600 font-black">شروع مطالعه</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* RIGHT SIDEBAR WIDGETS (Academic Glassmorphic Style)     */}
      {/* ======================================================== */}
      <div className="w-full lg:w-80 flex flex-col md:grid md:grid-cols-2 lg:flex lg:flex-col gap-5 lg:sticky lg:top-20">
        {/* 1. Academic Psycholingo Card */}
        <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden border border-indigo-500/30">
          <div className="relative z-10 flex flex-col items-start text-right">
            <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 rounded-full mb-1">
              روان‌شناسی آکادمیک
            </span>
            <h3 className="text-lg font-black leading-tight tracking-tight">
              یادگیری عمیق مفاهیم با ۱۰۰ مرحله طبقه‌بندی‌شده
            </h3>
            <p className="text-xs text-slate-300 font-bold mt-1.5 leading-relaxed">
              با مربیگری هوشمند Duo، مبانی، فلسفه و مکاتب روان‌شناسی را گام به گام فرا بگیرید.
            </p>
            <button
              onClick={() => handleStageClick(currentActiveStage)}
              className="mt-4 bg-white text-indigo-950 hover:bg-slate-100 px-4 py-2.5 rounded-xl font-black text-xs cursor-pointer shadow-md shadow-black/20 hover:scale-102 transition-all"
            >
              شروع مرحله {currentUnlockedStageNumber} ⚡
            </button>
          </div>
          <div className="absolute -left-3 -bottom-4 opacity-80 pointer-events-none">
            <DuoMascot mood="super" size={80} animate={false} />
          </div>
        </div>

        {/* 2. Diamond League (لیگ الماس) Widget */}
        <div className="glass-panel rounded-3xl p-4 sm:p-5 shadow-xs border border-white/80">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500 fill-amber-400" />
              <h4 className="text-sm font-black text-slate-900">لیگ برتر آکادمیک (هفته ۱۲)</h4>
            </div>
            <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">رتبه ۳</span>
          </div>

          <div className="flex flex-col gap-2 my-3 text-xs font-bold">
            <div className="flex items-center justify-between p-2 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-950">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-amber-500">۱.</span>
                <span className="text-base">👩‍⚕️</span>
                <span>دکتر سارا کیانی</span>
              </div>
              <span className="font-black text-amber-700">۱۴۲۰ XP</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-400">۲.</span>
                <span className="text-base">👨‍🎓</span>
                <span>امیرمحمد نظری</span>
              </div>
              <span className="font-black text-slate-600">۱۱۹۰ XP</span>
            </div>

            {/* User row */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-indigo-50/90 border-2 border-indigo-600/40 text-indigo-950 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-indigo-600">۳.</span>
                <DuoMascot mood="happy" size={24} animate={false} />
                <span className="font-black">شما (مرحله {currentUnlockedStageNumber})</span>
              </div>
              <span className="font-black text-indigo-700">{completedStageCount * 25 + 875} XP</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl text-slate-500">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-400">۴.</span>
                <span className="text-base">👩‍🏫</span>
                <span>مریم شایسته</span>
              </div>
              <span className="font-black text-slate-400">۷۳۰ XP</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 text-center">
            <span className="text-[11px] font-black text-emerald-600">
              ▲ منطقه صعود به تالار افتخارات
            </span>
          </div>
        </div>

        {/* 3. Daily Quests (ماموریت‌های روزانه) */}
        <div className="glass-panel rounded-3xl p-4 sm:p-5 shadow-xs border border-white/80">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-indigo-600" />
              <h4 className="text-sm font-black text-slate-900">ماموریت‌های امروز</h4>
            </div>
            <span className="text-[10px] font-black text-slate-400">بازنشانی در ۹ ساعت</span>
          </div>

          <div className="space-y-3 my-3">
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                <span>تکمیل ۲ مرحله از مسیر نقشه راه</span>
                <span className="text-indigo-600 font-black">
                  {Math.min(2, completedStageCount)}/۲
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-600 to-blue-500 rounded-full"
                  style={{
                    width: `${Math.min(100, (completedStageCount / 2) * 100)}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                <span>کسب ۵۰ امتیاز XP جدید</span>
                <span className="text-amber-500 font-black">۴۵/۵۰</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full w-[90%]" />
              </div>
            </div>
          </div>
        </div>

        {/* 4. Badges Preview */}
        <div className="glass-panel rounded-3xl p-4 sm:p-5 shadow-xs border border-white/80">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-indigo-600" />
              <h4 className="text-sm font-black text-slate-800">مدال‌ها و دستاوردها</h4>
            </div>
            <span className="text-[11px] font-black text-indigo-600">
              {unlockedBadges.length} باز شده
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 my-3">
            {evaluatedBadges.slice(0, 3).map((bInfo) => (
              <div
                key={bInfo.badge.id}
                className="flex flex-col items-center text-center p-2 rounded-xl bg-slate-50 border border-slate-100"
              >
                <BadgeIcon
                  type={bInfo.badge.iconType}
                  isUnlocked={bInfo.isUnlocked}
                  size={36}
                />
                <span className="text-[10px] font-black text-slate-700 mt-1 line-clamp-1">
                  {bInfo.badge.title}
                </span>
                <span className="text-[9px] font-bold text-slate-400">
                  {bInfo.isUnlocked ? 'کسب شد' : `${bInfo.progressPercent}٪`}
                </span>
              </div>
            ))}
          </div>

          {onOpenBadges && (
            <button
              onClick={onOpenBadges}
              className="w-full mt-1 duo-btn-orange py-2 rounded-xl text-xs font-black text-white flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>مشاهده تالار مدال‌ها و دستاوردها</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* DUOLINGO STAGE MODAL (100 Chained Stages Player)         */}
      {/* ======================================================== */}
      <DuolingoStageModal
        stage={activeStage}
        isOpen={isStageModalOpen}
        isLocked={isStageLockedState}
        previousStageNumber={activeStage ? activeStage.stageNumber - 1 : 1}
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

      {/* ======================================================== */}
      {/* PREREQUISITE & DIFFICULTY GATING STATE INSPECTOR MODAL   */}
      {/* ======================================================== */}
      <PrerequisiteInspectorModal
        isOpen={isPrerequisiteInspectorOpen}
        onClose={() => setIsPrerequisiteInspectorOpen(false)}
      />

      {/* ======================================================== */}
      {/* DUOLINGO STAGE PREVIEW POPOVER CARD                      */}
      {/* ======================================================== */}
      {previewStage && (() => {
        const isDone = completedStagesMap[previewStage.stageNumber] !== undefined;
        const stageRec = completedStagesMap[previewStage.stageNumber];
        const prereq = stageExecutionEngine.isStagePrerequisiteMet(previewStage.stageNumber, progress.completedStages);
        const isUnlocked = prereq.isMet;
        const requiredPrereqNumber = prereq.missingStageNumber ?? (previewStage.stageNumber - 1);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs animate-fadeIn select-none">
            <div className="bg-white border-2 border-b-6 border-slate-300 rounded-3xl p-6 max-w-sm w-full text-right shadow-2xl relative animate-scaleUp">
              {/* Close Button */}
              <button
                onClick={() => setPreviewStage(null)}
                className="absolute top-4 left-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="بستن"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Header Icon & Stage Pill */}
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-xs border-b-4 ${
                    isDone
                      ? 'bg-[#FFC800] border-[#E5A500] text-amber-950'
                      : isUnlocked
                      ? 'bg-[#58CC02] border-[#46A302] text-white'
                      : 'bg-slate-200 border-slate-300 text-slate-400'
                  }`}
                >
                  {isDone ? (
                    <Check className="w-7 h-7 stroke-[3.5]" />
                  ) : isUnlocked ? (
                    <Star className="w-7 h-7 fill-white" />
                  ) : (
                    <Lock className="w-6 h-6" />
                  )}
                </div>

                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                    {previewStage.unitTitle}
                  </span>
                  <h3 className="text-base sm:text-lg font-black text-slate-800 mt-0.5">
                    مرحله {previewStage.stageNumber}: {previewStage.title}
                  </h3>
                </div>
              </div>

              {/* Stars if completed */}
              {isDone && (
                <div className="flex items-center justify-between p-3 rounded-2xl bg-amber-50/80 border border-amber-200 mb-3">
                  <span className="text-xs font-black text-amber-900">ستاره‌های کسب شده:</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3].map((starIdx) => (
                      <Star
                        key={starIdx}
                        className={`w-4 h-4 ${
                          starIdx <= (stageRec?.stars || 3)
                            ? 'fill-[#FFC800] text-[#FFC800]'
                            : 'fill-slate-200 text-slate-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Stage Specs Chips */}
              <div className="grid grid-cols-2 gap-2 my-3 text-xs font-bold text-slate-600">
                <div className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-50 border border-slate-200">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  <span>{previewStage.questions.length} سوال ترکیبی</span>
                </div>
                <div className="flex items-center gap-1.5 p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-black">
                  <Zap className="w-4 h-4 text-[#FFC800] fill-[#FFC800]" />
                  <span>+{previewStage.xpReward} XP پاداش</span>
                </div>
              </div>

              {/* Stage Key Takeaway */}
              <p className="text-xs font-bold text-slate-500 leading-relaxed mb-4 bg-slate-50/60 p-3 rounded-xl border border-slate-100">
                💡 <span className="font-black text-slate-700">هدف یادگیری:</span> {previewStage.keyTakeaway}
              </p>

              {/* Locked Warning or Launch Action */}
              {!isUnlocked ? (
                <div className="space-y-3">
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-800">
                    🔒 این مرحله به دلیل رعایت پیش‌نیاز قفل است. ابتدا باید مرحله {requiredPrereqNumber} را کامل کنید.
                  </div>
                  <button
                    onClick={() => {
                      setPreviewStage(null);
                      const targetStage = allStages.find((s) => s.stageNumber === requiredPrereqNumber);
                      if (targetStage) {
                        setTimeout(() => {
                          const el = document.getElementById(`stage-node-${requiredPrereqNumber}`);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          handleStageClick(targetStage);
                        }, 100);
                      }
                    }}
                    className="duo-btn-blue w-full py-3 rounded-2xl text-xs font-black cursor-pointer shadow-xs"
                  >
                    پرش به مرحله پیش‌نیاز ({requiredPrereqNumber})
                  </button>
                </div>
              ) : isDone ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleLaunchStage(previewStage)}
                    className="duo-btn-yellow flex-1 py-3.5 rounded-2xl text-xs font-black cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>مرور و تمرین مجدد (+۱۰ XP)</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleLaunchStage(previewStage)}
                  className="duo-btn-green w-full py-3.5 rounded-2xl text-sm font-black cursor-pointer shadow-md flex items-center justify-center gap-2"
                >
                  <Zap className="w-4 h-4 fill-white" />
                  <span>شروع مرحله {previewStage.stageNumber}</span>
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* ======================================================== */}
      {/* MILESTONE CHEST REWARD DIALOG                            */}
      {/* ======================================================== */}
      {claimedChestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn select-none">
          <div className="bg-white border-2 border-b-6 border-slate-300 rounded-3xl p-6 sm:p-7 max-w-sm w-full text-center shadow-2xl relative animate-scaleUp">
            <button
              onClick={() => setClaimedChestModal(null)}
              className="absolute top-4 left-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-20 h-20 mx-auto mb-3 rounded-3xl bg-amber-100 border-2 border-b-4 border-amber-300 flex items-center justify-center text-amber-600 shadow-md">
              <Gift className="w-10 h-10 fill-amber-500 text-amber-600 animate-bounce" />
            </div>

            <span className="text-xs font-black uppercase tracking-wider text-amber-800 bg-amber-100 px-3 py-1 rounded-full border border-amber-300">
              پاداش صندوقچه طلایی
            </span>

            <h3 className="text-xl font-black text-slate-800 mt-2">
              {claimedChestModal.title}
            </h3>

            <p className="text-xs font-bold text-slate-500 mt-2 leading-relaxed">
              به پاس پیشرفت مداوم و تکمیل مراحل در زنجیره ۱۰۰ مرحله‌ای روان‌شناسی!
            </p>

            <div className="flex items-center justify-center gap-3 my-4">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-black text-xs">
                <Zap className="w-4 h-4 fill-amber-500 text-amber-500" />
                <span>+۵۰ XP تجربه</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 font-black text-xs">
                <Sparkles className="w-4 h-4 text-sky-500 fill-sky-500" />
                <span>+۱۵ الماس 💎</span>
              </div>
            </div>

            <button
              onClick={() => setClaimedChestModal(null)}
              className="duo-btn-green w-full py-3.5 rounded-2xl text-sm font-black cursor-pointer shadow-sm"
            >
              عالیه! دریافت پاداش
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
