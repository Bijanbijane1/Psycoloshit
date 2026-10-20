import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Chapter, Section } from '../types/psychology.ts';
import {
  type ActiveExamAttemptPayload,
  type ExamAttemptAnswerRecord,
  type ExamAttemptRecord,
  type ExamBlueprint,
  type SubmittedExamAttemptPayload,
  type UserExamHistorySummary,
  estimateKonkoorScaledScore,
  fetchExamBlueprints,
  startOrResumeExamAttempt,
  saveExamAttemptAnswer,
  submitExamAttempt,
  fetchExamAttemptReview,
  fetchUserExamHistory,
  saveLocalAttemptBackup,
  loadLocalSessionSnapshot,
} from '../services/examService.ts';
import { toPersianDigits } from '../utils/persianDigits.ts';
import {
  Clock,
  Flag,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Award,
  BookOpen,
  BarChart3,
  Play,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  LayoutGrid,
  History,
  Sparkles,
  ShieldCheck,
  Target,
  Trash2,
  Check,
  ArrowRight,
  Filter,
  TrendingUp,
  Layers,
  Timer,
  FileText,
  HelpCircle,
} from 'lucide-react';

export interface EntranceExamSimulatorProps {
  sections: Section[];
  onSelectChapter?: (chapter: Chapter) => void;
  onExamSubmitted?: (xpEarned: number, attempt: ExamAttemptRecord) => void;
  initialAttemptIdToReview?: string | null;
}

type SimulatorScreen = 'catalog' | 'runner' | 'review' | 'history';
type PaletteFilter = 'all' | 'answered' | 'unanswered' | 'flagged';
type ReviewFilter = 'all' | 'wrong' | 'unanswered' | 'correct' | 'flagged';
type BlueprintCategoryFilter = 'all' | ExamBlueprint['examType'];

function formatDurationClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return toPersianDigits(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
  }
  return toPersianDigits(`${pad(minutes)}:${pad(seconds)}`);
}

function formatReadableDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  if (mins === 0) return `${toPersianDigits(secs)} ثانیه`;
  if (secs === 0) return `${toPersianDigits(mins)} دقیقه`;
  return `${toPersianDigits(mins)} دقیقه و ${toPersianDigits(secs)} ثانیه`;
}

function getCategoryLabel(examType: ExamBlueprint['examType']): string {
  switch (examType) {
    case 'comprehensive':
      return 'آزمون جامع کنکور';
    case 'diagnostic':
      return 'تعیین سطح استاندارد';
    case 'subject':
      return 'موضوعی و ضرایب';
    case 'timed_drill':
      return 'تمرین سرعتی زمان‌دار';
    default:
      return 'آزمون استاندارد';
  }
}

export const EntranceExamSimulator: React.FC<EntranceExamSimulatorProps> = ({
  sections,
  onSelectChapter,
  onExamSubmitted,
  initialAttemptIdToReview,
}) => {
  const [screen, setScreen] = useState<SimulatorScreen>('catalog');
  const [blueprints, setBlueprints] = useState<ExamBlueprint[]>([]);
  const [historyData, setHistoryData] = useState<UserExamHistorySummary | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<BlueprintCategoryFilter>('all');
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(true);
  const [isStartingAttempt, setIsStartingAttempt] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Active Attempt Runner State
  const [activeSession, setActiveSession] = useState<ActiveExamAttemptPayload | null>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState<number>(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isMobilePaletteOpen, setIsMobilePaletteOpen] = useState<boolean>(false);
  const [paletteFilter, setPaletteFilter] = useState<PaletteFilter>('all');
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [saveSyncStatus, setSaveSyncStatus] = useState<'saved' | 'saving' | 'local'>('saved');

  // Review Screen State
  const [activeReview, setActiveReview] = useState<SubmittedExamAttemptPayload | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');

  // Per-question time tracking ref
  const questionEnterTimestampRef = useRef<number>(Date.now());
  const autoSubmitTriggeredRef = useRef<boolean>(false);

  const loadCatalogAndHistory = useCallback(async () => {
    setIsLoadingCatalog(true);
    setErrorBanner(null);
    try {
      const [bpList, hist] = await Promise.all([
        fetchExamBlueprints(),
        fetchUserExamHistory(),
      ]);
      setBlueprints(bpList);
      setHistoryData(hist);
    } catch {
      setErrorBanner('خطا در بارگذاری اطلاعات آزمون‌ها. نسخه آفلاین فعال شد.');
    } finally {
      setIsLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    loadCatalogAndHistory();
  }, [loadCatalogAndHistory]);

  // Open specific attempt review if requested via props
  useEffect(() => {
    if (initialAttemptIdToReview) {
      fetchExamAttemptReview(initialAttemptIdToReview).then((rev) => {
        if (rev) {
          setActiveReview(rev);
          setScreen('review');
        }
      });
    }
  }, [initialAttemptIdToReview]);

  // Accumulate time spent on the current question before switching or submitting
  const commitCurrentQuestionTime = useCallback((): Record<string, ExamAttemptAnswerRecord> | null => {
    if (!activeSession) return null;
    const currentQ = activeSession.questions[currentQuestionIdx];
    if (!currentQ) return activeSession.answers;

    const now = Date.now();
    const deltaSecs = Math.max(0, Math.round((now - questionEnterTimestampRef.current) / 1000));
    questionEnterTimestampRef.current = now;

    if (deltaSecs <= 0) return activeSession.answers;

    const existingAns: ExamAttemptAnswerRecord = activeSession.answers[currentQ.id] ?? {
      attemptId: activeSession.attempt.id,
      questionId: currentQ.id,
      sectionId: currentQ.sectionId,
      selectedIndex: null,
      isFlagged: false,
      timeSpentSeconds: 0,
      isCorrect: null,
      revision: 0,
      updatedAt: new Date().toISOString(),
    };

    const updatedAnswer: ExamAttemptAnswerRecord = {
      ...existingAns,
      timeSpentSeconds: (existingAns.timeSpentSeconds || 0) + deltaSecs,
      updatedAt: new Date().toISOString(),
    };

    const nextAnswers: Record<string, ExamAttemptAnswerRecord> = {
      ...activeSession.answers,
      [currentQ.id]: updatedAnswer,
    };

    saveLocalAttemptBackup(activeSession.attempt.id, nextAnswers);
    return nextAnswers;
  }, [activeSession, currentQuestionIdx]);

  // Handle Exam Submission
  const handleConfirmSubmitExam = useCallback(
    async (isAutoTimerExpired = false) => {
      if (!activeSession || isSubmitting) return;
      setIsSubmitting(true);
      setIsSubmitModalOpen(false);
      setErrorBanner(null);

      try {
        const updatedAnswersMap = commitCurrentQuestionTime() ?? activeSession.answers;
        const answersList = Object.values(updatedAnswersMap).map((a: ExamAttemptAnswerRecord) => ({
          questionId: a.questionId,
          selectedIndex: a.selectedIndex,
          isFlagged: a.isFlagged,
          timeSpentSeconds: a.timeSpentSeconds,
        }));

        const totalTimeSpent = answersList.reduce((s, a) => s + (a.timeSpentSeconds || 0), 0);

        const reviewPayload = await submitExamAttempt(
          {
            attemptId: activeSession.attempt.id,
            answers: answersList,
            durationSecondsUsed: totalTimeSpent,
          },
          {
            ...activeSession,
            answers: updatedAnswersMap,
          }
        );

        setActiveReview(reviewPayload);
        setActiveSession(null);
        setReviewFilter('all');
        setScreen('review');

        if (onExamSubmitted && !reviewPayload.alreadySubmitted) {
          onExamSubmitted(reviewPayload.xpAwarded, reviewPayload.attempt);
        }

        // Refresh history in background
        fetchUserExamHistory().then(setHistoryData).catch(() => {});
      } catch (err: any) {
        setErrorBanner(
          err?.message ||
            (isAutoTimerExpired
              ? 'زمان قانونی آزمون به پایان رسیده است، اما ارتباط با سرور برای ثبت نهایی برقرار نشد. پاسخ‌های شما محفوظ است؛ لطفاً دکمه ثبت نهایی آزمون را بزنید.'
              : 'خطا در ثبت نهایی آزمون. لطفاً دوباره تلاش کنید.')
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [activeSession, isSubmitting, commitCurrentQuestionTime, onExamSubmitted]
  );

  // Live countdown timer when in 'runner' screen
  useEffect(() => {
    if (screen !== 'runner' || !activeSession) return;
    autoSubmitTriggeredRef.current = false;

    const expiresMs = Date.parse(activeSession.attempt.expiresAt);
    const updateClock = () => {
      const now = Date.now();
      const secsLeft = Number.isFinite(expiresMs)
        ? Math.max(0, Math.floor((expiresMs - now) / 1000))
        : Math.max(0, remainingSeconds - 1);

      setRemainingSeconds(secsLeft);

      if (secsLeft <= 0 && !autoSubmitTriggeredRef.current) {
        autoSubmitTriggeredRef.current = true;
        handleConfirmSubmitExam(true);
      }
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, [screen, activeSession, handleConfirmSubmitExam]);

  const handleStartExam = async (blueprintId: string, forceNew = false) => {
    setIsStartingAttempt(blueprintId);
    setErrorBanner(null);
    try {
      const session = await startOrResumeExamAttempt({ blueprintId, forceNew });
      setActiveSession(session);
      setRemainingSeconds(session.remainingSeconds);
      setCurrentQuestionIdx(0);
      questionEnterTimestampRef.current = Date.now();
      setPaletteFilter('all');
      setIsMobilePaletteOpen(false);
      setScreen('runner');
    } catch {
      setErrorBanner('خطا در آماده‌سازی جلسه آزمون. لطفاً مجدداً تلاش کنید.');
    } finally {
      setIsStartingAttempt(null);
    }
  };

  const handleSelectQuestionIndex = (nextIdx: number) => {
    if (!activeSession) return;
    if (nextIdx < 0 || nextIdx >= activeSession.questions.length) return;
    const updatedAnswers = commitCurrentQuestionTime();
    if (updatedAnswers) {
      const currentQ = activeSession.questions[currentQuestionIdx];
      const currentAns = updatedAnswers[currentQ.id];
      setActiveSession((prev: ActiveExamAttemptPayload | null) =>
        prev ? { ...prev, answers: updatedAnswers } : null
      );
      if (currentAns) {
        saveExamAttemptAnswer({
          attemptId: activeSession.attempt.id,
          questionId: currentQ.id,
          selectedIndex: currentAns.selectedIndex,
          isFlagged: currentAns.isFlagged,
          timeSpentSeconds: currentAns.timeSpentSeconds,
          clientUpdatedAt: currentAns.updatedAt,
        });
      }
    }
    setCurrentQuestionIdx(nextIdx);
    questionEnterTimestampRef.current = Date.now();
    setIsMobilePaletteOpen(false);
  };

  const handleChooseOption = async (optionIdx: number | null) => {
    if (!activeSession) return;
    const currentQ = activeSession.questions[currentQuestionIdx];
    if (!currentQ) return;

    const now = Date.now();
    const deltaSecs = Math.max(0, Math.round((now - questionEnterTimestampRef.current) / 1000));
    questionEnterTimestampRef.current = now;

    const prevAns = activeSession.answers[currentQ.id];
    const nextSelected =
      optionIdx !== null && prevAns?.selectedIndex === optionIdx ? null : optionIdx;
    const nextTimeSpent = (prevAns?.timeSpentSeconds || 0) + deltaSecs;
    const nextFlagged = Boolean(prevAns?.isFlagged);
    const clientUpdatedAt = new Date().toISOString();

    const updatedAns: ExamAttemptAnswerRecord = {
      attemptId: activeSession.attempt.id,
      questionId: currentQ.id,
      sectionId: currentQ.sectionId,
      selectedIndex: nextSelected,
      isFlagged: nextFlagged,
      timeSpentSeconds: nextTimeSpent,
      isCorrect: null,
      revision: (prevAns?.revision ?? 0) + 1,
      updatedAt: clientUpdatedAt,
    };

    const nextAnswers: Record<string, ExamAttemptAnswerRecord> = {
      ...activeSession.answers,
      [currentQ.id]: updatedAns,
    };

    setActiveSession({
      ...activeSession,
      answers: nextAnswers,
    });
    saveLocalAttemptBackup(activeSession.attempt.id, nextAnswers);

    setSaveSyncStatus('saving');
    const res = await saveExamAttemptAnswer({
      attemptId: activeSession.attempt.id,
      questionId: currentQ.id,
      selectedIndex: nextSelected,
      isFlagged: nextFlagged,
      timeSpentSeconds: nextTimeSpent,
      clientUpdatedAt,
    });
    setSaveSyncStatus(res.ok ? 'saved' : 'local');
  };

  const handleToggleFlag = async () => {
    if (!activeSession) return;
    const currentQ = activeSession.questions[currentQuestionIdx];
    if (!currentQ) return;

    const prevAns = activeSession.answers[currentQ.id];
    const nextFlagged = !prevAns?.isFlagged;
    const nextSelected = prevAns?.selectedIndex ?? null;
    const nextTimeSpent = prevAns?.timeSpentSeconds ?? 0;
    const clientUpdatedAt = new Date().toISOString();

    const updatedAns: ExamAttemptAnswerRecord = {
      attemptId: activeSession.attempt.id,
      questionId: currentQ.id,
      sectionId: currentQ.sectionId,
      selectedIndex: nextSelected,
      isFlagged: nextFlagged,
      timeSpentSeconds: nextTimeSpent,
      isCorrect: null,
      revision: (prevAns?.revision ?? 0) + 1,
      updatedAt: clientUpdatedAt,
    };

    const nextAnswers: Record<string, ExamAttemptAnswerRecord> = {
      ...activeSession.answers,
      [currentQ.id]: updatedAns,
    };

    setActiveSession({
      ...activeSession,
      answers: nextAnswers,
    });
    saveLocalAttemptBackup(activeSession.attempt.id, nextAnswers);

    setSaveSyncStatus('saving');
    const res = await saveExamAttemptAnswer({
      attemptId: activeSession.attempt.id,
      questionId: currentQ.id,
      selectedIndex: nextSelected,
      isFlagged: nextFlagged,
      timeSpentSeconds: nextTimeSpent,
      clientUpdatedAt,
    });
    setSaveSyncStatus(res.ok ? 'saved' : 'local');
  };

  const handleOpenAttemptFromHistory = async (attempt: ExamAttemptRecord) => {
    if (attempt.status === 'in_progress') {
      await handleStartExam(attempt.blueprintId, false);
      return;
    }
    const review = await fetchExamAttemptReview(attempt.id);
    if (review) {
      setActiveReview(review);
      setReviewFilter('all');
      setScreen('review');
    } else {
      setErrorBanner('جزئیات پاسخ‌نامه این آزمون یافت نشد.');
    }
  };

  const findChapterById = useCallback(
    (chapterId: string): Chapter | null => {
      for (const sec of sections) {
        const found = sec.chapters.find((c) => c.id === chapterId);
        if (found) return found;
      }
      return null;
    },
    [sections]
  );

  // Runner computed stats
  const runnerStats = useMemo(() => {
    if (!activeSession) {
      return { answered: 0, flagged: 0, unanswered: 0, total: 0 };
    }
    let answered = 0;
    let flagged = 0;
    for (const q of activeSession.questions) {
      const a = activeSession.answers[q.id];
      if (a?.selectedIndex !== null && a?.selectedIndex !== undefined) {
        answered++;
      }
      if (a?.isFlagged) {
        flagged++;
      }
    }
    const total = activeSession.questions.length;
    return {
      answered,
      flagged,
      unanswered: Math.max(0, total - answered),
      total,
    };
  }, [activeSession]);

  const filteredBlueprints = useMemo(() => {
    if (categoryFilter === 'all') return blueprints;
    return blueprints.filter((bp) => bp.examType === categoryFilter);
  }, [blueprints, categoryFilter]);

  const inProgressByBlueprint = useMemo(() => {
    const map = new Map<string, ExamAttemptRecord>();
    if (historyData?.attempts) {
      for (const att of historyData.attempts) {
        if (att.status === 'in_progress') {
          const exp = Date.parse(att.expiresAt);
          if (Number.isFinite(exp) && exp > Date.now()) {
            map.set(att.blueprintId, att);
          }
        }
      }
    }
    for (const bp of blueprints) {
      if (!map.has(bp.id)) {
        const localSnap = loadLocalSessionSnapshot(bp.id);
        if (localSnap) {
          map.set(bp.id, localSnap.attempt);
        }
      }
    }
    return map;
  }, [historyData, blueprints]);

  // ==============================================================
  // SCREEN 1: ACTIVE EXAM ATTEMPT RUNNER
  // ==============================================================
  if (screen === 'runner' && activeSession) {
    const currentQ = activeSession.questions[currentQuestionIdx];
    const currentAns = currentQ ? activeSession.answers[currentQ.id] : undefined;
    const isLowTime = remainingSeconds <= 300; // < 5 mins

    const filteredPaletteQuestions = activeSession.questions.filter((q) => {
      const a = activeSession.answers[q.id];
      const isAnswered = a?.selectedIndex !== null && a?.selectedIndex !== undefined;
      if (paletteFilter === 'answered') return isAnswered;
      if (paletteFilter === 'unanswered') return !isAnswered;
      if (paletteFilter === 'flagged') return Boolean(a?.isFlagged);
      return true;
    });

    return (
      <div className="space-y-4 pb-8" dir="rtl">
        {/* Sticky Exam Runner Header */}
        <div className="sticky top-16 z-30 bg-white/95 backdrop-blur-md border-2 border-[#24243B] rounded-2xl p-3.5 sm:p-4 shadow-[0_6px_0_0_#24243B]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Title & Section */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#EAE4FF] border-2 border-[#24243B] flex items-center justify-center shrink-0">
                <Timer className="w-5 h-5 text-[#5842BC]" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-black text-[#24243B] truncate">
                  {activeSession.blueprint.title}
                </h2>
                <div className="flex items-center gap-2 text-xs text-[#64647A] font-bold">
                  <span>
                    سوال {toPersianDigits(currentQuestionIdx + 1)} از{' '}
                    {toPersianDigits(activeSession.questions.length)}
                  </span>
                  <span>•</span>
                  <span className="text-[#197D64]">
                    {saveSyncStatus === 'saving'
                      ? 'در حال ذخیره...'
                      : saveSyncStatus === 'saved'
                      ? 'ذخیره خودکار فعال'
                      : 'ذخیره در حافظه دستگاه'}
                  </span>
                </div>
              </div>
            </div>

            {/* Countdown Timer & Submit */}
            <div className="flex items-center gap-2 sm:gap-3 ms-auto">
              <div
                aria-live="polite"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-[#24243B] font-black text-sm sm:text-base tabular-nums ${
                  isLowTime
                    ? 'bg-[#FFE4E6] text-[#BE123C] animate-pulse'
                    : 'bg-[#FFF5D6] text-[#24243B]'
                }`}
              >
                <Clock className="w-4 h-4 shrink-0" />
                <span>{formatDurationClock(remainingSeconds)}</span>
              </div>

              <button
                type="button"
                onClick={() => setIsMobilePaletteOpen((prev) => !prev)}
                className="lg:hidden min-h-[44px] px-3 py-2 rounded-xl bg-[#F4F1EA] hover:bg-[#EAE4FF] border-2 border-[#24243B] text-xs font-black text-[#24243B] flex items-center gap-1.5 transition"
              >
                <LayoutGrid className="w-4 h-4 text-[#5842BC]" />
                <span>پاسخ‌برگ</span>
              </button>

              <button
                type="button"
                onClick={() => setIsSubmitModalOpen(true)}
                disabled={isSubmitting}
                className="min-h-[44px] px-3.5 sm:px-4 py-2 rounded-xl bg-[#279B7A] hover:bg-[#1E7E62] text-white border-2 border-[#24243B] shadow-[0_3px_0_0_#24243B] active:translate-y-0.5 active:shadow-none text-xs sm:text-sm font-black flex items-center gap-1.5 transition"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>ثبت نهایی آزمون</span>
              </button>
            </div>
          </div>

          {/* Quick Status Progress Bar */}
          <div className="mt-3 pt-2.5 border-t border-[#E6E2D8] flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
            <div className="flex items-center gap-3 sm:gap-4">
              <span className="flex items-center gap-1 text-[#197D64]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#279B7A] border border-[#24243B]" />
                پاسخ‌داده‌شده: {toPersianDigits(runnerStats.answered)}
              </span>
              <span className="flex items-center gap-1 text-[#64647A]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E6E2D8] border border-[#24243B]" />
                بی‌پاسخ: {toPersianDigits(runnerStats.unanswered)}
              </span>
              <span className="flex items-center gap-1 text-[#B87B1E]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F5B84B] border border-[#24243B]" />
                نشان‌دار: {toPersianDigits(runnerStats.flagged)}
              </span>
            </div>
            <span className="text-[11px] text-[#64647A]">
              {activeSession.blueprint.negativeMarking
                ? 'قانون نمره منفی: هر ۳ پاسخ غلط یک پاسخ صحیح را خنثی می‌کند'
                : 'بدون نمره منفی (ویژه تعیین سطح)'}
            </span>
          </div>
        </div>

        {errorBanner && (
          <div
            role="alert"
            className="bg-[#FFE4E6] border-2 border-[#24243B] rounded-2xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm font-bold text-[#9F1239] shadow-[0_4px_0_0_#24243B]"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0 text-[#BE123C]" />
              <span>{errorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => handleConfirmSubmitExam(false)}
              disabled={isSubmitting}
              className="px-3.5 py-2 rounded-xl bg-[#24243B] text-white text-xs font-black hover:bg-[#3A3A59] transition shrink-0"
            >
              {isSubmitting ? 'در حال ارسال...' : 'تلاش مجدد برای ثبت نهایی'}
            </button>
          </div>
        )}

        {/* Main Exam Grid: Question Card + Question Palette Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Active Question Card (8 cols on desktop) */}
          <div className="lg:col-span-8 bg-white border-2 border-[#24243B] rounded-2xl p-4 sm:p-6 shadow-[0_6px_0_0_#24243B] space-y-5">
            {currentQ && (
              <>
                {/* Question Top Metadata & Flag Action */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E6E2D8]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-[#24243B] text-white text-xs font-black">
                      سوال {toPersianDigits(currentQ.questionNumber)}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-[#EAE4FF] text-[#4C38B0] border border-[#24243B]/20 text-xs font-bold">
                      {currentQ.sectionTitle}
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-[#F4F1EA] text-[#55556A] text-[11px] font-bold">
                      سطح:{' '}
                      {currentQ.difficulty === 'hard'
                        ? 'پیشرفته کنکوری'
                        : currentQ.difficulty === 'medium'
                        ? 'متوسط'
                        : 'مقدماتی'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleFlag}
                    className={`min-h-[44px] px-3 py-1.5 rounded-xl border-2 border-[#24243B] text-xs font-black flex items-center gap-1.5 transition ${
                      currentAns?.isFlagged
                        ? 'bg-[#FFF0C8] text-[#9A6412] shadow-[0_2px_0_0_#24243B]'
                        : 'bg-[#F7F5F0] text-[#55556A] hover:bg-[#FFF5D6]'
                    }`}
                  >
                    <Flag
                      className={`w-4 h-4 ${
                        currentAns?.isFlagged ? 'fill-[#E5A33D] text-[#9A6412]' : ''
                      }`}
                    />
                    <span>
                      {currentAns?.isFlagged ? 'نشان‌دار شد' : 'نشان‌دار کردن سوال'}
                    </span>
                  </button>
                </div>

                {/* Question Stem */}
                <div className="py-2">
                  <p className="text-base sm:text-lg font-extrabold text-[#24243B] leading-8">
                    {currentQ.question}
                  </p>
                </div>

                {/* 4 Multiple Choice Options */}
                <div className="space-y-3">
                  {currentQ.options.map((optText: string, idx: number) => {
                    const isSelected = currentAns?.selectedIndex === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleChooseOption(idx)}
                        className={`w-full min-h-[54px] p-3.5 sm:p-4 rounded-xl border-2 text-right transition flex items-start gap-3 ${
                          isSelected
                            ? 'bg-[#E5F7F1] border-[#24243B] shadow-[0_4px_0_0_#24243B] translate-y-[-1px]'
                            : 'bg-[#FAF8F4] hover:bg-[#F2EFE8] border-[#24243B]/40 hover:border-[#24243B]'
                        }`}
                      >
                        <span
                          className={`w-7 h-7 rounded-lg border-2 border-[#24243B] flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${
                            isSelected
                              ? 'bg-[#279B7A] text-white'
                              : 'bg-white text-[#24243B]'
                          }`}
                        >
                          {isSelected ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            toPersianDigits(idx + 1)
                          )}
                        </span>
                        <span className="text-sm sm:text-base font-bold text-[#24243B] leading-7 flex-1">
                          {optText}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Clear Option & Question Navigation Controls */}
                <div className="pt-4 border-t border-[#E6E2D8] flex flex-wrap items-center justify-between gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleSelectQuestionIndex(currentQuestionIdx - 1)}
                    disabled={currentQuestionIdx === 0}
                    className="min-h-[44px] px-4 py-2 rounded-xl border-2 border-[#24243B] bg-[#F7F5F0] hover:bg-[#EAE4FF] disabled:opacity-40 disabled:pointer-events-none text-xs sm:text-sm font-black text-[#24243B] flex items-center gap-1.5 transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                    <span>سوال قبلی</span>
                  </button>

                  {currentAns?.selectedIndex !== null &&
                    currentAns?.selectedIndex !== undefined && (
                      <button
                        type="button"
                        onClick={() => handleChooseOption(null)}
                        className="min-h-[44px] px-3.5 py-2 rounded-xl border-2 border-[#24243B] bg-[#FFE4E6] hover:bg-[#FECDD3] text-xs font-black text-[#BE123C] flex items-center gap-1.5 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف گزینه (سفید گذاشتن)</span>
                      </button>
                    )}

                  {currentQuestionIdx < activeSession.questions.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => handleSelectQuestionIndex(currentQuestionIdx + 1)}
                      className="min-h-[44px] px-4 py-2 rounded-xl border-2 border-[#24243B] bg-[#5842BC] hover:bg-[#4935A3] text-white shadow-[0_3px_0_0_#24243B] active:translate-y-0.5 active:shadow-none text-xs sm:text-sm font-black flex items-center gap-1.5 transition ms-auto"
                    >
                      <span>سوال بعدی</span>
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsSubmitModalOpen(true)}
                      className="min-h-[44px] px-4 py-2 rounded-xl border-2 border-[#24243B] bg-[#279B7A] hover:bg-[#1E7E62] text-white shadow-[0_3px_0_0_#24243B] active:translate-y-0.5 active:shadow-none text-xs sm:text-sm font-black flex items-center gap-1.5 transition ms-auto"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>بررسی و ثبت نهایی آزمون</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Question Palette (Desktop Sidebar + Mobile Toggle Drawer) */}
          <div
            className={`lg:col-span-4 bg-white border-2 border-[#24243B] rounded-2xl p-4 sm:p-5 shadow-[0_6px_0_0_#24243B] space-y-4 ${
              isMobilePaletteOpen ? 'block' : 'hidden lg:block'
            }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#E6E2D8]">
              <h3 className="text-sm font-black text-[#24243B] flex items-center gap-1.5">
                <LayoutGrid className="w-4 h-4 text-[#5842BC]" />
                <span>پاسخ‌برگ و نقشه سوالات</span>
              </h3>
              <span className="text-xs font-bold text-[#64647A]">
                {toPersianDigits(runnerStats.answered)}/{toPersianDigits(runnerStats.total)}
              </span>
            </div>

            {/* Palette Filter Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'all', label: `همه (${toPersianDigits(runnerStats.total)})` },
                  { id: 'unanswered', label: `نزده (${toPersianDigits(runnerStats.unanswered)})` },
                  { id: 'answered', label: `زده (${toPersianDigits(runnerStats.answered)})` },
                  { id: 'flagged', label: `نشان‌دار (${toPersianDigits(runnerStats.flagged)})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPaletteFilter(tab.id)}
                  className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border text-xs font-bold transition ${
                    paletteFilter === tab.id
                      ? 'bg-[#24243B] text-white border-[#24243B]'
                      : 'bg-[#F7F5F0] text-[#55556A] border-[#D8D3C8] hover:bg-[#EAE4FF]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Numbered Question Grid */}
            <div className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-5 gap-2 max-h-[320px] overflow-y-auto p-1">
              {filteredPaletteQuestions.map((q) => {
                const a = activeSession.answers[q.id];
                const isAnswered = a?.selectedIndex !== null && a?.selectedIndex !== undefined;
                const isFlagged = Boolean(a?.isFlagged);
                const actualIndex = q.questionNumber - 1;
                const isCurrent = actualIndex === currentQuestionIdx;

                let btnStyle = 'bg-[#F7F5F0] text-[#24243B] border-[#24243B]/40';
                if (isAnswered) {
                  btnStyle = 'bg-[#D8F3EC] text-[#14634E] border-[#24243B]';
                }
                if (isFlagged) {
                  btnStyle = 'bg-[#FFF0C8] text-[#9A6412] border-[#24243B]';
                }
                if (isCurrent) {
                  btnStyle += ' ring-2 ring-[#5842BC] ring-offset-1 font-black scale-105';
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => handleSelectQuestionIndex(actualIndex)}
                    className={`min-w-[44px] min-h-[44px] rounded-xl border-2 text-xs font-bold flex flex-col items-center justify-center relative transition ${btnStyle}`}
                    title={`سوال ${toPersianDigits(q.questionNumber)} - ${q.sectionTitle}`}
                  >
                    <span>{toPersianDigits(q.questionNumber)}</span>
                    {isAnswered && (
                      <span className="text-[10px] font-black opacity-80">
                        گزینه {toPersianDigits((a?.selectedIndex ?? 0) + 1)}
                      </span>
                    )}
                    {isFlagged && (
                      <span className="absolute -top-1 -left-1 w-3 h-3 rounded-full bg-[#E5A33D] border border-[#24243B]" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Submit CTA inside Palette */}
            <div className="pt-3 border-t border-[#E6E2D8]">
              <button
                type="button"
                onClick={() => setIsSubmitModalOpen(true)}
                disabled={isSubmitting}
                className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-[#279B7A] hover:bg-[#1E7E62] text-white border-2 border-[#24243B] shadow-[0_3px_0_0_#24243B] text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تحویل پاسخ‌برگ و مشاهده کارنامه</span>
              </button>
            </div>
          </div>
        </div>

        {/* Submit Confirmation Modal */}
        {isSubmitModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border-2 border-[#24243B] rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-[0_8px_0_0_#24243B] space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#FFF0C8] border-2 border-[#24243B] flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6 text-[#C98A27]" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-[#24243B]">
                    تأیید ثبت نهایی آزمون
                  </h3>
                  <p className="text-xs text-[#64647A] font-bold">
                    پس از ثبت نهایی، امکان تغییر گزینه‌ها وجود نخواهد داشت.
                  </p>
                </div>
              </div>

              <div className="bg-[#F7F5F0] border-2 border-[#24243B]/20 rounded-xl p-3.5 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-black text-[#197D64]">
                    {toPersianDigits(runnerStats.answered)}
                  </div>
                  <div className="text-[11px] font-bold text-[#64647A]">پاسخ‌داده‌شده</div>
                </div>
                <div>
                  <div className="text-lg font-black text-[#55556A]">
                    {toPersianDigits(runnerStats.unanswered)}
                  </div>
                  <div className="text-[11px] font-bold text-[#64647A]">سوال نزده</div>
                </div>
                <div>
                  <div className="text-lg font-black text-[#C98A27]">
                    {toPersianDigits(runnerStats.flagged)}
                  </div>
                  <div className="text-[11px] font-bold text-[#64647A]">نشان‌دار</div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="flex-1 min-h-[46px] py-2.5 px-4 rounded-xl border-2 border-[#24243B] bg-[#F7F5F0] hover:bg-[#EAE4FF] text-xs sm:text-sm font-black text-[#24243B] transition"
                >
                  بازگشت به آزمون
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmSubmitExam(false)}
                  disabled={isSubmitting}
                  className="flex-1 min-h-[46px] py-2.5 px-4 rounded-xl border-2 border-[#24243B] bg-[#279B7A] hover:bg-[#1E7E62] text-white shadow-[0_3px_0_0_#24243B] text-xs sm:text-sm font-black transition"
                >
                  {isSubmitting ? 'در حال محاسبه کارنامه...' : 'ثبت قطعی و صدور کارنامه'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==============================================================
  // SCREEN 2: POST-EXAM KARNAMEH & DETAILED EXPLANATION REVIEW
  // ==============================================================
  if (screen === 'review' && activeReview) {
    const { attempt, blueprint, questions, xpAwarded } = activeReview;
    const rawPct = attempt.rawScorePercent ?? 0;
    const weightedPct = attempt.weightedScorePercent ?? rawPct;
    const scaledScore = estimateKonkoorScaledScore(weightedPct);

    const weakestSection = [...attempt.sectionBreakdown].sort(
      (a, b) => a.rawScorePercent - b.rawScorePercent
    )[0];

    const filteredReviewQuestions = questions.filter((q) => {
      if (reviewFilter === 'wrong') return q.isCorrect === false;
      if (reviewFilter === 'unanswered') return q.selectedIndex === null;
      if (reviewFilter === 'correct') return q.isCorrect === true;
      if (reviewFilter === 'flagged') return q.isFlagged;
      return true;
    });

    return (
      <div className="space-y-6 pb-8" dir="rtl">
        {/* Top Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setScreen('catalog');
              loadCatalogAndHistory();
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-white hover:bg-[#EAE4FF] border-2 border-[#24243B] shadow-[0_3px_0_0_#24243B] text-xs sm:text-sm font-black text-[#24243B] flex items-center gap-2 transition"
          >
            <ArrowRight className="w-4 h-4" />
            <span>بازگشت به فهرست آزمون‌های جامع</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setScreen('history')}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#F4F1EA] hover:bg-[#EAE4FF] border-2 border-[#24243B] text-xs font-black text-[#24243B] flex items-center gap-1.5 transition"
            >
              <History className="w-4 h-4 text-[#5842BC]" />
              <span>تاریخچه کارنامه‌ها</span>
            </button>
            <button
              type="button"
              onClick={() => handleStartExam(blueprint.id, true)}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#5842BC] hover:bg-[#4935A3] text-white border-2 border-[#24243B] shadow-[0_3px_0_0_#24243B] text-xs font-black flex items-center gap-1.5 transition"
            >
              <RotateCcw className="w-4 h-4" />
              <span>شرکت مجدد در این آزمون</span>
            </button>
          </div>
        </div>

        {/* Official Konkoor Karnameh Hero Card */}
        <div className="bg-white border-2 border-[#24243B] rounded-2xl p-5 sm:p-6 shadow-[0_6px_0_0_#24243B] space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E6E2D8] pb-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#D8F3EC] text-[#14634E] border border-[#24243B]/20 text-xs font-black">
                <ShieldCheck className="w-4 h-4" />
                <span>کارنامه رسمی شبیه‌ساز کنکور روان‌مستر</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-[#24243B]">
                {blueprint.title}
              </h2>
              <p className="text-xs text-[#64647A] font-bold">
                زمان صرف‌شده: {formatReadableDuration(attempt.durationSecondsUsed)} • وضعیت:{' '}
                {attempt.status === 'expired' ? 'ثبت خودکار در پایان زمان' : 'ثبت نهایی توسط داوطلب'}
              </p>
            </div>

            {xpAwarded > 0 && (
              <div className="px-3.5 py-2 rounded-xl bg-[#FFF0C8] border-2 border-[#24243B] flex items-center gap-2">
                <Award className="w-5 h-5 text-[#C98A27]" />
                <div>
                  <div className="text-xs font-black text-[#24243B]">
                    +{toPersianDigits(xpAwarded)} امتیاز تجربه (XP)
                  </div>
                  <div className="text-[10px] font-bold text-[#64647A]">
                    ثبت‌شده در کارنامه و لیگ
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Primary Score Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-[#EAE4FF] border-2 border-[#24243B]">
              <div className="text-xs font-bold text-[#4C38B0]">تراز تخمینی کنکور</div>
              <div className="text-xl sm:text-2xl font-black text-[#24243B] mt-1">
                {toPersianDigits(scaledScore.toLocaleString('en-US'))}
              </div>
              <div className="text-[11px] font-bold text-[#55556A] mt-0.5">از ۱۰,۰۰۰ تراز استاندارد</div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#D8F3EC] border-2 border-[#24243B]">
              <div className="text-xs font-bold text-[#14634E]">درصد وزنی کل (با ضرایب)</div>
              <div className="text-xl sm:text-2xl font-black text-[#24243B] mt-1">
                {toPersianDigits(weightedPct)}٪
              </div>
              <div className="text-[11px] font-bold text-[#55556A] mt-0.5">
                درصد خام: {toPersianDigits(rawPct)}٪
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#FFF5D6] border-2 border-[#24243B]">
              <div className="text-xs font-bold text-[#9A6412]">عملکرد پاسخ‌دهی</div>
              <div className="text-base sm:text-lg font-black text-[#24243B] mt-1 flex items-center gap-2">
                <span className="text-[#197D64]">{toPersianDigits(attempt.correctCount)} صحیح</span>
                <span>•</span>
                <span className="text-[#BE123C]">{toPersianDigits(attempt.wrongCount)} غلط</span>
              </div>
              <div className="text-[11px] font-bold text-[#55556A] mt-0.5">
                سوالات نزده: {toPersianDigits(attempt.unansweredCount)}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F7F5F0] border-2 border-[#24243B]">
              <div className="text-xs font-bold text-[#55556A]">میانگین زمان هر سوال</div>
              <div className="text-xl sm:text-2xl font-black text-[#24243B] mt-1">
                {toPersianDigits(
                  Math.max(
                    1,
                    Math.round(
                      attempt.durationSecondsUsed / Math.max(1, attempt.questionIds.length)
                    )
                  )
                )}{' '}
                <span className="text-xs font-bold">ثانیه</span>
              </div>
              <div className="text-[11px] font-bold text-[#64647A] mt-0.5">
                کل سوالات: {toPersianDigits(attempt.questionIds.length)}
              </div>
            </div>
          </div>

          {/* Section-by-Section Breakdown */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm sm:text-base font-black text-[#24243B] flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#5842BC]" />
              <span>کارنامه تفکیکی دروس و ضرایب تخصصی</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {attempt.sectionBreakdown.map((sec) => {
                const barWidth = Math.max(0, Math.min(100, Math.round(sec.rawScorePercent)));
                return (
                  <div
                    key={sec.sectionId}
                    className="p-3.5 rounded-xl bg-[#FAF8F4] border-2 border-[#24243B]/30 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-black text-[#24243B]">
                        {sec.sectionTitle}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-[#EAE4FF] text-[#4C38B0] text-[11px] font-black">
                        ضریب {toPersianDigits(sec.weight)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs font-bold text-[#55556A]">
                      <span>
                        صحیح: {toPersianDigits(sec.correctCount)} | غلط:{' '}
                        {toPersianDigits(sec.wrongCount)} | نزده:{' '}
                        {toPersianDigits(sec.unansweredCount)}
                      </span>
                      <span
                        className={`font-black ${
                          sec.rawScorePercent >= 60
                            ? 'text-[#197D64]'
                            : sec.rawScorePercent >= 30
                            ? 'text-[#C98A27]'
                            : 'text-[#BE123C]'
                        }`}
                      >
                        {toPersianDigits(sec.rawScorePercent)}٪
                      </span>
                    </div>

                    <div className="w-full h-2.5 bg-[#E6E2D8] rounded-full overflow-hidden border border-[#24243B]/20">
                      <div
                        className={`h-full rounded-full ${
                          sec.rawScorePercent >= 60
                            ? 'bg-[#279B7A]'
                            : sec.rawScorePercent >= 30
                            ? 'bg-[#F5B84B]'
                            : 'bg-[#E11D48]'
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Targeted Study Recommendation */}
          {weakestSection && onSelectChapter && (
            <div className="p-4 rounded-xl bg-[#FFF5D6] border-2 border-[#24243B] flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-black text-[#9A6412] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  <span>پیشنهاد هوشمند تقویت تراز</span>
                </div>
                <p className="text-xs sm:text-sm font-bold text-[#24243B]">
                  بیشترین پتانسیل رشد تراز شما در درس «{weakestSection.sectionTitle}» (درصد فعلی:{' '}
                  {toPersianDigits(weakestSection.rawScorePercent)}٪ با ضریب{' '}
                  {toPersianDigits(weakestSection.weight)}) است.
                </p>
              </div>
              {(() => {
                const targetChapId = weakestSection.chapterIds?.[0] ?? 'ch-1';
                const chap = findChapterById(targetChapId);
                if (!chap) return null;
                return (
                  <button
                    type="button"
                    onClick={() => onSelectChapter(chap)}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#24243B] text-white text-xs font-black flex items-center gap-1.5 hover:bg-[#3A3A59] transition"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>مطالعه فصل مرتبط ({chap.title})</span>
                  </button>
                );
              })()}
            </div>
          )}
        </div>

        {/* Detailed Question-by-Question Review & Explanations */}
        <div className="bg-white border-2 border-[#24243B] rounded-2xl p-5 sm:p-6 shadow-[0_6px_0_0_#24243B] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6E2D8] pb-3">
            <h3 className="text-base sm:text-lg font-black text-[#24243B] flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#5842BC]" />
              <span>پاسخ‌نامه تشریحی و تحلیل سوالات</span>
            </h3>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: `همه (${toPersianDigits(questions.length)})` },
                  {
                    id: 'wrong',
                    label: `غلط‌ها (${toPersianDigits(attempt.wrongCount)})`,
                  },
                  {
                    id: 'unanswered',
                    label: `نزده‌ها (${toPersianDigits(attempt.unansweredCount)})`,
                  },
                  {
                    id: 'correct',
                    label: `صحیح‌ها (${toPersianDigits(attempt.correctCount)})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setReviewFilter(tab.id)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl border-2 text-xs font-black transition ${
                    reviewFilter === tab.id
                      ? 'bg-[#24243B] text-white border-[#24243B]'
                      : 'bg-[#F7F5F0] text-[#55556A] border-[#24243B]/30 hover:bg-[#EAE4FF]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {filteredReviewQuestions.map((q) => {
              const chap = findChapterById(q.chapterId);
              return (
                <div
                  key={q.id}
                  className="p-4 sm:p-5 rounded-2xl bg-[#FAF8F4] border-2 border-[#24243B] space-y-3"
                >
                  {/* Question Review Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-[#24243B] text-white text-xs font-black">
                        سوال {toPersianDigits(q.questionNumber)}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-[#EAE4FF] text-[#4C38B0] text-xs font-bold">
                        {q.sectionTitle}
                      </span>
                      {q.isCorrect === true && (
                        <span className="px-2.5 py-1 rounded-lg bg-[#D8F3EC] text-[#14634E] text-xs font-black flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          پاسخ صحیح
                        </span>
                      )}
                      {q.isCorrect === false && (
                        <span className="px-2.5 py-1 rounded-lg bg-[#FFE4E6] text-[#BE123C] text-xs font-black flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" />
                          پاسخ غلط
                        </span>
                      )}
                      {q.selectedIndex === null && (
                        <span className="px-2.5 py-1 rounded-lg bg-[#E6E2D8] text-[#55556A] text-xs font-black">
                          بدون پاسخ (نزده)
                        </span>
                      )}
                    </div>

                    <span className="text-xs font-bold text-[#64647A]">
                      زمان صرف‌شده: {toPersianDigits(q.timeSpentSeconds)} ثانیه
                    </span>
                  </div>

                  {/* Stem */}
                  <p className="text-sm sm:text-base font-extrabold text-[#24243B] leading-7">
                    {q.question}
                  </p>

                  {/* Options with Correct/User Highlighting */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options.map((opt: string, idx: number) => {
                      const isCorrectOpt = idx === q.correctIndex;
                      const isUserOpt = idx === q.selectedIndex;

                      let boxClass = 'bg-white border-[#D8D3C8] text-[#55556A]';
                      if (isCorrectOpt) {
                        boxClass =
                          'bg-[#D8F3EC] border-[#279B7A] text-[#14634E] font-black';
                      } else if (isUserOpt && !isCorrectOpt) {
                        boxClass =
                          'bg-[#FFE4E6] border-[#E11D48] text-[#BE123C] font-black';
                      }

                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl border-2 text-xs sm:text-sm flex items-start gap-2 ${boxClass}`}
                        >
                          <span className="font-black shrink-0">
                            {toPersianDigits(idx + 1)})
                          </span>
                          <span className="flex-1">{opt}</span>
                          {isCorrectOpt && (
                            <CheckCircle2 className="w-4 h-4 text-[#14634E] shrink-0" />
                          )}
                          {isUserOpt && !isCorrectOpt && (
                            <XCircle className="w-4 h-4 text-[#BE123C] shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Official Explanation Box */}
                  <div className="p-3.5 rounded-xl bg-white border-2 border-[#24243B]/20 space-y-2">
                    <div className="text-xs font-black text-[#5842BC] flex items-center justify-between">
                      <span>تحلیل علمی و نکته کنکوری:</span>
                      {chap && onSelectChapter && (
                        <button
                          type="button"
                          onClick={() => onSelectChapter(chap)}
                          className="text-[#197D64] hover:underline flex items-center gap-1"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>مرور فصل: {chap.title}</span>
                        </button>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm font-medium text-[#24243B] leading-7">
                      {q.explanation}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ==============================================================
  // SCREEN 3: EXAM ATTEMPT HISTORY & LONG-TERM ANALYTICS
  // ==============================================================
  if (screen === 'history') {
    const attempts = historyData?.attempts ?? [];
    const stats = historyData?.stats;

    return (
      <div className="space-y-5 pb-8" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setScreen('catalog')}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-white hover:bg-[#EAE4FF] border-2 border-[#24243B] shadow-[0_3px_0_0_#24243B] text-xs sm:text-sm font-black text-[#24243B] flex items-center gap-2 transition"
          >
            <ArrowRight className="w-4 h-4" />
            <span>بازگشت به فهرست آزمون‌ها</span>
          </button>

          <h2 className="text-base sm:text-lg font-black text-[#24243B] flex items-center gap-2">
            <History className="w-5 h-5 text-[#5842BC]" />
            <span>تاریخچه آزمون‌ها و روند تراز کنکور</span>
          </h2>
        </div>

        {/* Summary Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border-2 border-[#24243B] rounded-2xl p-4 shadow-[0_4px_0_0_#24243B]">
              <div className="text-xs font-bold text-[#64647A]">آزمون‌های تکمیل‌شده</div>
              <div className="text-xl sm:text-2xl font-black text-[#24243B] mt-1">
                {toPersianDigits(stats.totalCompletedExams)}
              </div>
            </div>
            <div className="bg-white border-2 border-[#24243B] rounded-2xl p-4 shadow-[0_4px_0_0_#24243B]">
              <div className="text-xs font-bold text-[#64647A]">بهترین تراز کسب‌شده</div>
              <div className="text-xl sm:text-2xl font-black text-[#5842BC] mt-1">
                {toPersianDigits(
                  estimateKonkoorScaledScore(stats.bestRawScorePercent).toLocaleString('en-US')
                )}
              </div>
            </div>
            <div className="bg-white border-2 border-[#24243B] rounded-2xl p-4 shadow-[0_4px_0_0_#24243B]">
              <div className="text-xs font-bold text-[#64647A]">میانگین درصد کل</div>
              <div className="text-xl sm:text-2xl font-black text-[#197D64] mt-1">
                {toPersianDigits(stats.averageRawScorePercent)}٪
              </div>
            </div>
            <div className="bg-white border-2 border-[#24243B] rounded-2xl p-4 shadow-[0_4px_0_0_#24243B]">
              <div className="text-xs font-bold text-[#64647A]">مجموع سوالات پاسخ‌داده‌شده</div>
              <div className="text-xl sm:text-2xl font-black text-[#24243B] mt-1">
                {toPersianDigits(stats.totalExamQuestionsAnswered)}
              </div>
            </div>
          </div>
        )}

        {/* Attempts List */}
        {attempts.length === 0 ? (
          <div className="bg-white border-2 border-[#24243B] rounded-2xl p-8 text-center space-y-3 shadow-[0_6px_0_0_#24243B]">
            <HelpCircle className="w-10 h-10 text-[#5842BC] mx-auto" />
            <h3 className="text-base font-black text-[#24243B]">
              هنوز هیچ آزمونی ثبت نشده است
            </h3>
            <p className="text-xs sm:text-sm text-[#64647A] font-medium max-w-md mx-auto">
              با شرکت در اولین آزمون شبیه‌ساز یا تعیین سطح، کارنامه تحلیلی، تراز تخمینی و روند پیشرفت شما در این بخش ذخیره می‌شود.
            </p>
            <button
              type="button"
              onClick={() => setScreen('catalog')}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#5842BC] text-white border-2 border-[#24243B] shadow-[0_3px_0_0_#24243B] text-xs sm:text-sm font-black inline-flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              <span>انتخاب و شروع اولین آزمون</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {attempts.map((att) => {
              const isInProgress = att.status === 'in_progress';
              const wPct = att.weightedScorePercent ?? att.rawScorePercent ?? 0;
              const scaled = estimateKonkoorScaledScore(wPct);
              return (
                <div
                  key={att.id}
                  className="bg-white border-2 border-[#24243B] rounded-2xl p-4 sm:p-5 shadow-[0_4px_0_0_#24243B] flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-black border border-[#24243B]/20 ${
                          isInProgress
                            ? 'bg-[#FFF0C8] text-[#9A6412]'
                            : 'bg-[#D8F3EC] text-[#14634E]'
                        }`}
                      >
                        {isInProgress ? 'در حال برگزاری (ناتمام)' : 'تکمیل‌شده'}
                      </span>
                      <h4 className="text-sm sm:text-base font-black text-[#24243B]">
                        {att.blueprintTitle}
                      </h4>
                    </div>

                    {!isInProgress ? (
                      <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-[#55556A]">
                        <span className="text-[#5842BC] font-black">
                          تراز: {toPersianDigits(scaled.toLocaleString('en-US'))}
                        </span>
                        <span>•</span>
                        <span className="text-[#197D64] font-black">
                          درصد وزنی: {toPersianDigits(wPct)}٪
                        </span>
                        <span>•</span>
                        <span>
                          صحیح: {toPersianDigits(att.correctCount)} | غلط:{' '}
                          {toPersianDigits(att.wrongCount)} | نزده:{' '}
                          {toPersianDigits(att.unansweredCount)}
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs font-bold text-[#64647A]">
                        تعداد کل سوالات آزمون: {toPersianDigits(att.totalQuestions)} سوال
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenAttemptFromHistory(att)}
                    className={`min-h-[44px] px-4 py-2 rounded-xl border-2 border-[#24243B] shadow-[0_3px_0_0_#24243B] text-xs font-black flex items-center gap-1.5 transition ${
                      isInProgress
                        ? 'bg-[#F5B84B] text-[#24243B] hover:bg-[#E5A33D]'
                        : 'bg-[#EAE4FF] text-[#24243B] hover:bg-[#DDD4FF]'
                    }`}
                  >
                    {isInProgress ? (
                      <>
                        <Play className="w-4 h-4" />
                        <span>ادامه آزمون</span>
                      </>
                    ) : (
                      <>
                        <BarChart3 className="w-4 h-4 text-[#5842BC]" />
                        <span>مشاهده کارنامه و پاسخ‌نامه</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ==============================================================
  // SCREEN 4 (DEFAULT): EXAM CATALOG & BLUEPRINT SELECTION
  // ==============================================================
  return (
    <div className="space-y-6 pb-8" dir="rtl">
      {errorBanner && (
        <div className="p-3.5 rounded-xl bg-[#FFE4E6] border-2 border-[#24243B] text-xs sm:text-sm font-bold text-[#BE123C] flex items-center justify-between">
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-xs underline font-black"
          >
            بستن
          </button>
        </div>
      )}

      {/* Top Overview Strip */}
      <div className="bg-white border-2 border-[#24243B] rounded-2xl p-4 sm:p-5 shadow-[0_6px_0_0_#24243B] flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EAE4FF] text-[#4C38B0] text-xs font-black">
            <Target className="w-3.5 h-3.5" />
            <span>شبیه‌ساز رسمی آزمون‌های زمان‌دار و کنکور ارشد/دکتری</span>
          </div>
          <h2 className="text-base sm:text-lg font-black text-[#24243B]">
            انتخاب دفترچه آزمون استاندارد
          </h2>
          <p className="text-xs text-[#64647A] font-medium">
            محاسبه دقیق نمره منفی (۱ به ۳)، تراز تخمینی کنکور، ذخیره خودکار پاسخ‌برگ و کارنامه تفکیکی دروس با ضرایب رسمی
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {historyData && historyData.stats.totalCompletedExams > 0 && (
            <div className="px-3.5 py-2 rounded-xl bg-[#D8F3EC] border-2 border-[#24243B] text-xs font-black text-[#14634E] flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              <span>
                بهترین تراز:{' '}
                {toPersianDigits(
                  estimateKonkoorScaledScore(
                    historyData.stats.bestRawScorePercent
                  ).toLocaleString('en-US')
                )}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setScreen('history')}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#F7F5F0] hover:bg-[#EAE4FF] border-2 border-[#24243B] shadow-[0_3px_0_0_#24243B] text-xs sm:text-sm font-black text-[#24243B] flex items-center gap-2 transition"
          >
            <History className="w-4 h-4 text-[#5842BC]" />
            <span>
              کارنامه‌ها و سوابق من (
              {toPersianDigits(historyData?.attempts.length ?? 0)})
            </span>
          </button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <Filter className="w-4 h-4 text-[#64647A] shrink-0" />
        {(
          [
            { id: 'all', label: 'همه آزمون‌ها' },
            { id: 'comprehensive', label: 'جامع کنکور' },
            { id: 'diagnostic', label: 'تعیین سطح' },
            { id: 'subject', label: 'موضوعی و بالینی' },
            { id: 'timed_drill', label: 'تمرین سرعتی' },
          ] as const
        ).map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategoryFilter(cat.id)}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl border-2 text-xs font-black whitespace-nowrap transition ${
              categoryFilter === cat.id
                ? 'bg-[#24243B] text-white border-[#24243B] shadow-[0_3px_0_0_#5842BC]'
                : 'bg-white text-[#55556A] border-[#24243B]/40 hover:bg-[#EAE4FF]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Blueprint Cards Grid */}
      {isLoadingCatalog ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-56 rounded-2xl bg-white border-2 border-[#24243B]/20 animate-pulse p-5"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredBlueprints.map((bp) => {
            const activeAttempt = inProgressByBlueprint.get(bp.id);
            const isStartingThis = isStartingAttempt === bp.id;
            const maxXpEstimate = Math.min(250, 35 + bp.totalQuestions * 10);

            return (
              <div
                key={bp.id}
                className="bg-white border-2 border-[#24243B] rounded-2xl p-5 shadow-[0_6px_0_0_#24243B] flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  {/* Top Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-[#EAE4FF] text-[#4C38B0] border border-[#24243B]/20 text-xs font-black">
                      {getCategoryLabel(bp.examType)}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-[#FFF0C8] text-[#9A6412] border border-[#24243B]/20 text-xs font-black flex items-center gap-1">
                      <Award className="w-3.5 h-3.5" />
                      <span>تا +{toPersianDigits(maxXpEstimate)} XP</span>
                    </span>
                  </div>

                  {/* Title */}
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-[#24243B]">
                      {bp.title}
                    </h3>
                  </div>

                  <p className="text-xs sm:text-sm text-[#55556A] font-medium leading-6">
                    {bp.description}
                  </p>

                  {/* Key Exam Specs */}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="p-2.5 rounded-xl bg-[#F7F5F0] border border-[#24243B]/20 text-center">
                      <div className="text-xs sm:text-sm font-black text-[#24243B]">
                        {toPersianDigits(bp.totalQuestions)} سوال
                      </div>
                      <div className="text-[10px] font-bold text-[#64647A]">چهارگزینه‌ای</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#F7F5F0] border border-[#24243B]/20 text-center">
                      <div className="text-xs sm:text-sm font-black text-[#24243B]">
                        {toPersianDigits(bp.durationMinutes)} دقیقه
                      </div>
                      <div className="text-[10px] font-bold text-[#64647A]">زمان استاندارد</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#F7F5F0] border border-[#24243B]/20 text-center">
                      <div className="text-xs sm:text-sm font-black text-[#BE123C]">
                        {bp.negativeMarking ? '۱ به ۳-' : 'بدون نمره منفی'}
                      </div>
                      <div className="text-[10px] font-bold text-[#64647A]">نمره منفی</div>
                    </div>
                  </div>

                  {/* Sections & Coefficients */}
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] font-black text-[#64647A] flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-[#5842BC]" />
                      <span>دروس و ضرایب دفترچه:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {bp.sections.map((sec) => (
                        <span
                          key={sec.id}
                          className="px-2 py-1 rounded-lg bg-[#FAF8F4] border border-[#24243B]/25 text-[11px] font-bold text-[#24243B]"
                        >
                          {sec.title} ({toPersianDigits(sec.questionCount)} سوال • ضریب{' '}
                          {toPersianDigits(sec.weight)})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-[#E6E2D8] flex flex-wrap items-center gap-2">
                  {activeAttempt ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStartExam(bp.id, false)}
                        disabled={isStartingThis}
                        className="flex-1 min-h-[46px] py-2.5 px-4 rounded-xl bg-[#F5B84B] hover:bg-[#E5A33D] text-[#24243B] border-2 border-[#24243B] shadow-[0_3px_0_0_#24243B] text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition"
                      >
                        <Play className="w-4 h-4" />
                        <span>
                          {isStartingThis ? 'در حال بارگذاری...' : 'ادامه آزمون ناتمام'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartExam(bp.id, true)}
                        disabled={isStartingThis}
                        className="min-h-[46px] py-2.5 px-3.5 rounded-xl bg-[#F7F5F0] hover:bg-[#EAE4FF] text-[#24243B] border-2 border-[#24243B] text-xs font-black flex items-center justify-center gap-1.5 transition"
                        title="شروع مجدد از ابتدا"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>شروع نو</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStartExam(bp.id, false)}
                      disabled={isStartingThis}
                      className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-[#5842BC] hover:bg-[#4935A3] text-white border-2 border-[#24243B] shadow-[0_3px_0_0_#24243B] active:translate-y-0.5 active:shadow-none text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition"
                    >
                      <Play className="w-4 h-4" />
                      <span>
                        {isStartingThis
                          ? 'در حال آماده‌سازی دفترچه...'
                          : 'شروع آزمون و دریافت پاسخ‌برگ'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
