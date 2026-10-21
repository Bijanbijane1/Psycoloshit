import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  X,
  Heart,
  Zap,
  Sparkles,
  Trophy,
  Check,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  RotateCcw,
  Star,
  Lock,
  Lightbulb,
  FileText,
  Compass,
  ShieldCheck,
  CloudOff,
  RefreshCw,
  AlertTriangle,
  BookOpen,
} from 'lucide-react';
import { DuolingoStage, Question, StageCompletionRecord } from '../types/psychology';
import { playDuoSound } from '../utils/duoAudio';
import { submitStageOrQuizReward, RewardSubmissionResult } from '../utils/cloudSync';
import { toPersianDigits } from '../utils/persianDigits';
import confetti from 'canvas-confetti';

interface DuolingoStageModalProps {
  stage: DuolingoStage | null;
  isOpen: boolean;
  isLocked: boolean;
  previousStageNumber?: number;
  previousStageVerified?: boolean;
  existingRecord?: StageCompletionRecord;
  streakDays?: number;
  onClose: () => void;
  onCompleteStage: (record: StageCompletionRecord) => void;
  onStartNextStage?: (nextStageNumber: number) => void;
}

export const DuolingoStageModal: React.FC<DuolingoStageModalProps> = ({
  stage,
  isOpen,
  isLocked,
  previousStageNumber,
  previousStageVerified = true,
  existingRecord,
  streakDays = 1,
  onClose,
  onCompleteStage,
  onStartNextStage,
}) => {
  if (!isOpen || !stage) return null;

  // If locked, render clean editorial locked dialog
  if (isLocked) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#24243B]/55 backdrop-blur-xs select-none animate-fadeIn">
        <div className="bg-white border border-[#E5E1EB] rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-xl relative text-center animate-scaleUp">
          <button
            onClick={onClose}
            className="absolute top-4 left-4 p-2 rounded-xl text-[#69697E] hover:text-[#24243B] hover:bg-[#F7F5F0] transition-colors cursor-pointer"
            aria-label="بستن"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-14 h-14 mx-auto mb-3.5 rounded-2xl bg-[#F7F5F0] border border-[#E5E1EB] flex items-center justify-center text-[#69697E]">
            <Lock className="w-6 h-6 text-[#69697E]" />
          </div>

          <span className="text-xs font-extrabold text-[#B45309] bg-[#FFF0C8] px-3 py-1 rounded-lg border border-[#F59E0B]/30 inline-block">
            مرحله {toPersianDigits(stage.stageNumber)} قفل است
          </span>

          <h3 className="text-lg sm:text-xl font-black text-[#24243B] mt-3">
            {stage.title}
          </h3>

          <p className="text-sm font-medium text-[#69697E] mt-2 leading-relaxed">
            سیستم مدیریت پیش‌نیازها مانع ورود زودهنگام به این مبحث می‌شود. برای یادگیری اصولی و گام‌به‌گام، ابتدا مرحله{' '}
            <strong className="text-[#5B46E8] font-black">
              {toPersianDigits(previousStageNumber || stage.stageNumber - 1)}
            </strong>{' '}
            را با موفقیت تکمیل نمایید.
          </p>

          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-xl bg-[#5B46E8] hover:bg-[#4935D4] text-white text-sm font-extrabold mt-6 transition-colors cursor-pointer"
          >
            متوجه شدم، بازگشت به برنامه درسی
          </button>
        </div>
      </div>
    );
  }

  return (
    <DuolingoStagePlayer
      key={stage.id}
      stage={stage}
      previousStageVerified={previousStageVerified}
      existingRecord={existingRecord}
      streakDays={streakDays}
      onClose={onClose}
      onCompleteStage={onCompleteStage}
      onStartNextStage={onStartNextStage}
    />
  );
};

// =========================================================================
// ACTIVE STAGE LESSON & QUIZ PLAYER (Editorial Studio Experience)
// =========================================================================
export function resolveStageAttemptDisplayReward(params: {
  stageXpReward: number;
  wasAlreadyCompleted: boolean;
  rewardResult?: { alreadyClaimed?: boolean; xpAwarded?: number } | null;
}): {
  isReplayMode: boolean;
  displayedXpAwarded: number;
  badgeLabel: string;
  statusNote: string | null;
} {
  const isReplayMode = Boolean(params.wasAlreadyCompleted || params.rewardResult?.alreadyClaimed);
  if (isReplayMode) {
    return {
      isReplayMode: true,
      displayedXpAwarded: 0,
      badgeLabel: 'حالت تمرین (۰ XP جدید)',
      statusNote: 'امتیاز این مرحله قبلاً ثبت شده است (حالت تمرین)',
    };
  }
  const xp =
    typeof params.rewardResult?.xpAwarded === 'number'
      ? params.rewardResult.xpAwarded
      : params.stageXpReward;
  return {
    isReplayMode: false,
    displayedXpAwarded: xp,
    badgeLabel: `+${toPersianDigits(xp)} XP امتیاز`,
    statusNote: null,
  };
}

interface DuolingoStagePlayerProps {
  stage: DuolingoStage;
  previousStageVerified?: boolean;
  existingRecord?: StageCompletionRecord;
  streakDays?: number;
  onClose: () => void;
  onCompleteStage: (record: StageCompletionRecord) => void;
  onStartNextStage?: (nextStageNumber: number) => void;
}

const DuolingoStagePlayer: React.FC<DuolingoStagePlayerProps> = ({
  stage,
  previousStageVerified = true,
  existingRecord,
  streakDays = 1,
  onClose,
  onCompleteStage,
  onStartNextStage,
}) => {
  const [currentQIndex, setCurrentQIndex] = useState<number>(0);
  const [hearts, setHearts] = useState<number>(5);
  const [wrongCount, setWrongCount] = useState<number>(0);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState<boolean>(false);
  const [isCurrentCorrect, setIsCurrentCorrect] = useState<boolean | null>(null);
  const [isStageFinished, setIsStageFinished] = useState<boolean>(false);
  const [scoreCount, setScoreCount] = useState<number>(0);
  const [isHintOpen, setIsHintOpen] = useState<boolean>(false);

  // Capture whether stage was already completed BEFORE this attempt started so replays always show 0 new XP
  const wasAlreadyCompletedBeforeAttemptRef = useRef<boolean>(Boolean(existingRecord));

  // Attempt-scoped idempotency key for deterministic replay safety (Task 1B)
  const attemptIdempotencyKeyRef = useRef<string>(
    `stage_${stage.stageNumber}_attempt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`
  );
  const [rewardResult, setRewardResult] = useState<RewardSubmissionResult | null>(null);
  const [isSubmittingReward, setIsSubmittingReward] = useState<boolean>(false);
  const [completedRecordState, setCompletedRecordState] = useState<StageCompletionRecord | null>(null);

  // Dynamic stars calculation: 0 mistakes = 3 stars, 1-2 mistakes = 2 stars, 3+ mistakes = 1 star
  const currentStars = wrongCount === 0 ? 3 : wrongCount <= 2 ? 2 : 1;

  // Question specific inputs
  const [mcSelection, setMcSelection] = useState<number | null>(null);
  const [tfSelection, setTfSelection] = useState<boolean | null>(null);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [sentenceOrderTokens, setSentenceOrderTokens] = useState<string[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<string[]>([]);
  const [selectedLeftPair, setSelectedLeftPair] = useState<string | null>(null);
  const [selectedRightPair, setSelectedRightPair] = useState<string | null>(null);
  const [recordedStageAnswers, setRecordedStageAnswers] = useState<Record<string, unknown>>({});

  const currentQ: Question = stage.questions[currentQIndex];
  const progressPercent =
    ((currentQIndex + (isAnswerSubmitted ? 1 : 0)) / stage.questions.length) * 100;

  // Helper to normalize Persian strings for robust matching
  const normalizePersian = useCallback((str: string) => {
    return String(str || '')
      .replace(/[\u200C\u200B\s]/g, '')
      .replace(/[یي]/g, 'ی')
      .replace(/[کك]/g, 'ک')
      .replace(/[ةه]/g, 'ه')
      .trim()
      .toLowerCase();
  }, []);

  // Options for fill-in-the-blank (word cards)
  const fillBlankOptions = useMemo(() => {
    if (currentQ.type !== 'fill_blank') return [];
    if (currentQ.options && currentQ.options.length > 0) return currentQ.options;
    const target = String(currentQ.correctAnswer).trim();
    return [target, 'فرآیند ذهنی', 'رفتار آشکار', 'شناخت'].sort(() => 0.5 - Math.random());
  }, [currentQ]);

  // Shuffled right-side pairs for matching
  const shuffledRightPairs = useMemo(() => {
    if (currentQ.type !== 'match_pairs' || !currentQ.matchPairs) return [];
    const pairs = [...currentQ.matchPairs];
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    return pairs;
  }, [currentQ.id, currentQ.matchPairs]);

  // Expected boolean for True/False questions
  const expectedTfValue = useMemo(() => {
    if (currentQ.type !== 'true_false') return null;
    if (typeof currentQ.isTrue === 'boolean') return currentQ.isTrue;
    if (typeof currentQ.correctAnswer === 'boolean') return currentQ.correctAnswer;
    if (currentQ.correctAnswer === 0 || currentQ.correctAnswer === '0') return true;
    if (currentQ.correctAnswer === 1 || currentQ.correctAnswer === '1') return false;
    return String(currentQ.correctAnswer).toLowerCase() === 'true';
  }, [currentQ]);

  // Reset inputs when moving to next question
  useEffect(() => {
    setMcSelection(null);
    setTfSelection(null);
    setSelectedWord(null);
    setSentenceOrderTokens([]);
    setMatchedPairs([]);
    setSelectedLeftPair(null);
    setSelectedRightPair(null);
    setIsAnswerSubmitted(false);
    setIsCurrentCorrect(null);
    setIsHintOpen(false);
  }, [currentQIndex]);

  // Central Evaluation Function
  const evaluateAnswer = useCallback(
    (correct: boolean, submittedValue?: unknown) => {
      setIsCurrentCorrect(correct);
      setIsAnswerSubmitted(true);
      if (submittedValue !== undefined) {
        setRecordedStageAnswers((prev) => ({
          ...prev,
          [currentQ.id]: submittedValue,
        }));
      }

      if (correct) {
        playDuoSound('correct');
        setScoreCount((prev) => prev + 1);
      } else {
        playDuoSound('wrong');
        setWrongCount((prev) => prev + 1);
        setHearts((prev) => Math.max(1, prev - 1));
      }
    },
    [currentQ.id]
  );

  // Instant selection handlers
  const handleSelectMultipleChoice = (idx: number) => {
    if (isAnswerSubmitted) return;
    setMcSelection(idx);
    const correct = idx === currentQ.correctAnswer;
    evaluateAnswer(correct, idx);
  };

  const handleSelectTrueFalse = (val: boolean) => {
    if (isAnswerSubmitted) return;
    setTfSelection(val);
    const correct = val === expectedTfValue;
    evaluateAnswer(correct, val);
  };

  // Match pairs instant check
  const handlePairClick = (side: 'left' | 'right', id: string) => {
    if (isAnswerSubmitted) return;

    if (side === 'left') {
      if (selectedLeftPair === id) {
        setSelectedLeftPair(null);
      } else {
        setSelectedLeftPair(id);
        if (selectedRightPair) {
          checkPairMatch(id, selectedRightPair);
        }
      }
    } else {
      if (selectedRightPair === id) {
        setSelectedRightPair(null);
      } else {
        setSelectedRightPair(id);
        if (selectedLeftPair) {
          checkPairMatch(selectedLeftPair, id);
        }
      }
    }
  };

  const checkPairMatch = (leftId: string, rightId: string) => {
    if (leftId === rightId) {
      playDuoSound('click');
      const newMatched = [...matchedPairs, leftId];
      setMatchedPairs(newMatched);
      setSelectedLeftPair(null);
      setSelectedRightPair(null);
      const totalPairs = currentQ.matchPairs ? currentQ.matchPairs.length : 2;
      if (newMatched.length === totalPairs) {
        evaluateAnswer(true, newMatched);
      }
    } else {
      playDuoSound('wrong');
      setSelectedLeftPair(null);
      setSelectedRightPair(null);
    }
  };

  // Fill in blank selection
  const handleSelectFillBlank = (word: string) => {
    if (isAnswerSubmitted) return;
    setSelectedWord(word);
    const userClean = normalizePersian(word);
    const targetClean = normalizePersian(String(currentQ.correctAnswer));
    const correct =
      userClean === targetClean ||
      targetClean.includes(userClean) ||
      userClean.includes(targetClean);
    evaluateAnswer(correct, word);
  };

  // Sentence order check
  const handleCheckSentenceOrder = () => {
    if (sentenceOrderTokens.length === 0 || isAnswerSubmitted) return;
    const rawAssembled = sentenceOrderTokens.join(' ');
    const userSentence = normalizePersian(rawAssembled);
    const correctSentence = normalizePersian(
      String(currentQ.correctAnswer || currentQ.correctSentence)
    );
    const correct = userSentence === correctSentence;
    evaluateAnswer(correct, rawAssembled);
  };

  const submitAttemptReward = useCallback(
    async (recordToSubmit: StageCompletionRecord) => {
      setIsSubmittingReward(true);
      const res = await submitStageOrQuizReward(
        {
          rewardType: 'stage_completion',
          stageNumber: recordToSubmit.stageNumber,
          stars: recordToSubmit.stars,
          score: recordToSubmit.score,
          totalQuestions: recordToSubmit.totalQuestions,
          xpEarned: recordToSubmit.xpEarned,
          stageAnswers: recordToSubmit.stageAnswers,
          idempotencyKey: attemptIdempotencyKeyRef.current,
        },
        streakDays
      );
      setIsSubmittingReward(false);
      setRewardResult(res);

      if (res.ok) {
        const verifiedRecord: StageCompletionRecord = {
          ...recordToSubmit,
          verified: true,
          source: 'online-verified',
        };
        setCompletedRecordState(verifiedRecord);
        onCompleteStage(verifiedRecord);
      }
    },
    [streakDays, onCompleteStage]
  );

  // Continue to next question or finish stage
  const handleContinue = useCallback(() => {
    if (currentQIndex < stage.questions.length - 1) {
      playDuoSound('click');
      setCurrentQIndex((prev) => prev + 1);
    } else {
      playDuoSound('complete');
      confetti({
        particleCount: 75,
        spread: 80,
        origin: { y: 0.5 },
        colors: ['#5B46E8', '#16A394', '#F59E0B', '#D9485F'],
      });

      const starsAwarded = wrongCount === 0 ? 3 : wrongCount <= 2 ? 2 : 1;
      const alreadyOnlineVerified = Boolean(
        existingRecord?.verified === true || existingRecord?.source === 'online-verified'
      );
      const record: StageCompletionRecord = {
        stageNumber: stage.stageNumber,
        completedAt: new Date().toISOString(),
        stars: starsAwarded,
        score: Math.max(0, stage.questions.length - wrongCount),
        totalQuestions: stage.questions.length,
        xpEarned: stage.xpReward,
        stageAnswers: recordedStageAnswers,
        verified: alreadyOnlineVerified,
        source: alreadyOnlineVerified ? 'online-verified' : 'offline-local',
      };

      setCompletedRecordState(record);
      onCompleteStage(record);
      setIsStageFinished(true);
      void submitAttemptReward(record);
    }
  }, [
    currentQIndex,
    stage,
    wrongCount,
    recordedStageAnswers,
    existingRecord,
    onCompleteStage,
    submitAttemptReward,
  ]);

  // Keyboard shortcut support (1-4 for options, Enter/Space for advance)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isStageFinished) return;

      if (isAnswerSubmitted) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleContinue();
        }
        return;
      }

      const optionList =
        currentQ.type === 'multiple_choice' || currentQ.type === 'case_study'
          ? currentQ.options || currentQ.caseScenario?.diagnosticOptions
          : null;

      if (optionList && optionList.length > 0) {
        if (['1', '2', '3', '4'].includes(e.key)) {
          const idx = parseInt(e.key, 10) - 1;
          if (idx < optionList.length) {
            e.preventDefault();
            handleSelectMultipleChoice(idx);
          }
        }
      } else if (currentQ.type === 'fill_blank' && fillBlankOptions.length > 0) {
        if (['1', '2', '3', '4'].includes(e.key)) {
          const idx = parseInt(e.key, 10) - 1;
          if (idx < fillBlankOptions.length) {
            e.preventDefault();
            handleSelectFillBlank(fillBlankOptions[idx]);
          }
        }
      } else if (currentQ.type === 'true_false') {
        if (e.key === '1') {
          e.preventDefault();
          handleSelectTrueFalse(true);
        } else if (e.key === '2') {
          e.preventDefault();
          handleSelectTrueFalse(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isStageFinished,
    isAnswerSubmitted,
    isCurrentCorrect,
    currentQ,
    fillBlankOptions,
    handleContinue,
    handleSelectMultipleChoice,
    handleSelectFillBlank,
    handleSelectTrueFalse,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-4 bg-[#24243B]/60 backdrop-blur-xs select-none animate-fadeIn">
      <div className="bg-white border border-[#E5E1EB] rounded-2xl sm:rounded-3xl w-full max-w-xl max-h-[96dvh] sm:max-h-[92vh] flex flex-col overflow-hidden shadow-2xl relative animate-scaleUp">
        {/* ================================================================ */}
        {/* TOP STATUS BAR: Focused Editorial Studio Header                   */}
        {/* ================================================================ */}
        <div className="px-3.5 sm:px-5 py-3 sm:py-3.5 border-b border-[#E5E1EB] flex items-center justify-between gap-2 sm:gap-3 bg-[#F7F5F0]/75">
          {/* Close button */}
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#69697E] hover:text-[#24243B] hover:bg-white transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0 border border-transparent hover:border-[#E5E1EB]"
            title="خروج از درس"
            aria-label="خروج از درس"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Editorial Progress Bar */}
          <div className="flex-1 flex flex-col gap-1 mx-1 sm:mx-2 min-w-0">
            <div className="flex items-center justify-between text-[11px] font-extrabold text-[#69697E]">
              <span className="flex items-center gap-1 text-[#5B46E8] truncate">
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                مرحله {toPersianDigits(stage.stageNumber)}
              </span>
              <span className="shrink-0 text-[#24243B]">
                {toPersianDigits(currentQIndex + 1)} از {toPersianDigits(stage.questions.length)}
              </span>
            </div>
            <div className="w-full h-2 sm:h-2.5 bg-[#E5E1EB] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#5B46E8] rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Optional Hint Toggle */}
          <button
            onClick={() => setIsHintOpen((prev) => !prev)}
            className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1 transition-all cursor-pointer border shrink-0 min-h-[44px] ${
              isHintOpen
                ? 'bg-[#FFF0C8] text-[#92400E] border-[#F59E0B]/40'
                : 'bg-white text-[#24243B] border-[#E5E1EB] hover:bg-[#F7F5F0]'
            }`}
            title="مشاهده نکته آموزشی"
          >
            <Lightbulb className={`w-4 h-4 ${isHintOpen ? 'text-[#D97706] fill-[#F59E0B]' : 'text-[#69697E]'}`} />
            <span className="hidden sm:inline">نکته</span>
          </button>

          {/* Dynamic Stars Remaining Counter */}
          <div className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#FFF0C8]/70 border border-[#F59E0B]/30 text-[#92400E] font-extrabold text-xs shrink-0 min-h-[44px]">
            <div className="flex items-center -space-x-1">
              {[1, 2, 3].map((starIdx) => (
                <Star
                  key={starIdx}
                  className={`w-3.5 h-3.5 transition-all duration-300 ${
                    currentStars >= starIdx
                      ? 'fill-[#F59E0B] text-[#D97706] scale-100'
                      : 'fill-[#E5E1EB] text-[#CFC9DA] scale-90 opacity-60'
                  }`}
                />
              ))}
            </div>
            <span className="text-[11px] font-extrabold mr-1 hidden sm:inline">{toPersianDigits(currentStars)} ستاره</span>
          </div>

          {/* Hearts Counter */}
          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#FFE4E8]/70 border border-[#D9485F]/25 text-[#9F1239] font-extrabold text-xs shrink-0 min-h-[44px]">
            <Heart className="w-3.5 h-3.5 fill-[#D9485F] text-[#D9485F]" />
            <span className="text-xs font-extrabold">{toPersianDigits(hearts)}</span>
          </div>
        </div>

        {/* ================================================================ */}
        {/* SEQUENTIAL VERIFICATION GAP UX GUARD BANNER (Task 1A.2)          */}
        {/* ================================================================ */}
        {stage.stageNumber > 1 && !previousStageVerified && (
          <div className="bg-[#FFF0C8]/80 border-b border-[#F59E0B]/30 px-4 py-2.5 text-right flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
            <p className="text-[11px] sm:text-xs font-bold text-[#92400E] leading-relaxed">
              مرحله قبلی در حالت آفلاین تکمیل شده است. برای ثبت امتیاز (XP) در لیدربورد جهانی، ابتدا مرحله قبلی را به صورت آنلاین تأیید کنید.
            </p>
          </div>
        )}

        {/* ================================================================ */}
        {/* COLLAPSIBLE HINT DRAWER                                          */}
        {/* ================================================================ */}
        {isHintOpen && (
          <div className="bg-[#FFF0C8]/65 border-b border-[#F59E0B]/30 p-3.5 sm:px-5 text-right flex items-start gap-3 transition-all animate-fadeIn">
            <div className="w-8 h-8 rounded-xl bg-[#FFF0C8] border border-[#F59E0B]/40 flex items-center justify-center text-[#D97706] shrink-0">
              <Lightbulb className="w-4 h-4" />
            </div>
            <div className="flex-1 text-xs font-medium text-[#78350F] leading-relaxed">
              <span className="font-extrabold text-[#92400E] block mb-0.5">
                نکته کلیدی مرحله {toPersianDigits(stage.stageNumber)}:
              </span>
              {stage.keyTakeaway}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* BODY: Clean, Focused Question Area                               */}
        {/* ================================================================ */}
        <div className="flex-1 overflow-y-auto touch-scroll p-4 sm:p-6 flex flex-col justify-between">
          {!isStageFinished ? (
            <div className="w-full">
              {/* Question Header & Title */}
              <div className="text-right mb-5 sm:mb-6">
                <span className="text-[11px] font-extrabold text-[#5B46E8] bg-[#EAE4FF] px-2.5 py-1 rounded-md inline-block mb-2.5">
                  {stage.unitTitle}
                </span>
                <h3 className="text-base sm:text-xl font-black text-[#24243B] leading-relaxed">
                  {currentQ.text}
                </h3>
              </div>

              {/* -------------------------------------------------------- */}
              {/* QUESTION TYPE: MULTIPLE CHOICE                           */}
              {/* -------------------------------------------------------- */}
              {currentQ.type === 'multiple_choice' && currentQ.options && (
                <div className="grid grid-cols-1 gap-2.5">
                  {currentQ.options.map((opt, idx) => {
                    const isSelected = mcSelection === idx;
                    const isCorrectChoice = idx === currentQ.correctAnswer;

                    let cardClass =
                      'bg-white border border-[#E5E1EB] text-[#24243B] hover:border-[#5B46E8]/50 hover:bg-[#F7F5F0]/60';

                    if (isAnswerSubmitted) {
                      if (isCorrectChoice) {
                        cardClass =
                          'bg-[#DDF7F2] border-2 border-[#169E6C] text-[#064E3B] font-extrabold';
                      } else if (isSelected && !isCorrectChoice) {
                        cardClass =
                          'bg-[#FFE4E8] border-2 border-[#E5484D] text-[#881337] line-through opacity-90';
                      } else {
                        cardClass = 'opacity-45 border-[#E5E1EB] bg-[#F7F5F0]/50';
                      }
                    }

                    return (
                      <button
                        key={idx}
                        disabled={isAnswerSubmitted}
                        onClick={() => handleSelectMultipleChoice(idx)}
                        className={`w-full p-4 rounded-xl text-right text-sm font-bold transition-all cursor-pointer flex items-center justify-between gap-3 ${cardClass}`}
                      >
                        <span className="flex-1 text-right leading-relaxed">{opt}</span>

                        <div className="flex items-center gap-2 shrink-0">
                          {isAnswerSubmitted && isCorrectChoice && (
                            <Check className="w-5 h-5 text-[#169E6C] stroke-[2.75]" />
                          )}
                          {isAnswerSubmitted && isSelected && !isCorrectChoice && (
                            <X className="w-5 h-5 text-[#E5484D] stroke-[2.75]" />
                          )}
                          <div
                            className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-extrabold ${
                              isSelected
                                ? isCurrentCorrect
                                  ? 'bg-[#169E6C] text-white'
                                  : 'bg-[#E5484D] text-white'
                                : 'bg-[#F7F5F0] text-[#69697E] border border-[#E5E1EB]'
                            }`}
                          >
                            {toPersianDigits(idx + 1)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* -------------------------------------------------------- */}
              {/* QUESTION TYPE: CASE STUDY (Clinical / Research Scenario) */}
              {/* -------------------------------------------------------- */}
              {currentQ.type === 'case_study' && (
                <div className="space-y-4">
                  {currentQ.caseScenario && (
                    <div className="bg-[#DDF7F2]/55 border border-[#16A394]/30 rounded-xl p-4 text-right">
                      <div className="flex items-center gap-2 mb-2 text-[#0F766E] font-extrabold text-xs">
                        <FileText className="w-4 h-4 text-[#16A394]" />
                        <span>شرح سناریوی پژوهشی / موقعیت بالینی:</span>
                      </div>
                      <p className="text-xs sm:text-sm text-[#24243B] font-medium leading-relaxed mb-2">
                        {currentQ.caseScenario.clientProfile}
                      </p>
                      {currentQ.caseScenario.symptoms && currentQ.caseScenario.symptoms.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {currentQ.caseScenario.symptoms.map((s, idx) => (
                            <span
                              key={idx}
                              className="bg-white border border-[#16A394]/30 text-[#0F766E] text-[11px] font-bold px-2.5 py-0.5 rounded-md"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-2.5">
                    {(currentQ.options || currentQ.caseScenario?.diagnosticOptions || []).map((opt, idx) => {
                      const isSelected = mcSelection === idx;
                      const isCorrectChoice = idx === currentQ.correctAnswer;

                      let cardClass =
                        'bg-white border border-[#E5E1EB] text-[#24243B] hover:border-[#5B46E8]/50 hover:bg-[#F7F5F0]/60';

                      if (isAnswerSubmitted) {
                        if (isCorrectChoice) {
                          cardClass =
                            'bg-[#DDF7F2] border-2 border-[#169E6C] text-[#064E3B] font-extrabold';
                        } else if (isSelected && !isCorrectChoice) {
                          cardClass =
                            'bg-[#FFE4E8] border-2 border-[#E5484D] text-[#881337] line-through opacity-90';
                        } else {
                          cardClass = 'opacity-45 border-[#E5E1EB] bg-[#F7F5F0]/50';
                        }
                      }

                      return (
                        <button
                          key={idx}
                          disabled={isAnswerSubmitted}
                          onClick={() => handleSelectMultipleChoice(idx)}
                          className={`w-full p-4 rounded-xl text-right text-sm font-bold transition-all cursor-pointer flex items-center justify-between gap-3 ${cardClass}`}
                        >
                          <span className="flex-1 text-right leading-relaxed">{opt}</span>

                          <div className="flex items-center gap-2 shrink-0">
                            {isAnswerSubmitted && isCorrectChoice && (
                              <Check className="w-5 h-5 text-[#169E6C] stroke-[2.75]" />
                            )}
                            {isAnswerSubmitted && isSelected && !isCorrectChoice && (
                              <X className="w-5 h-5 text-[#E5484D] stroke-[2.75]" />
                            )}
                            <div
                              className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-extrabold ${
                                isSelected
                                  ? isCurrentCorrect
                                    ? 'bg-[#169E6C] text-white'
                                    : 'bg-[#E5484D] text-white'
                                  : 'bg-[#F7F5F0] text-[#69697E] border border-[#E5E1EB]'
                              }`}
                            >
                              {toPersianDigits(idx + 1)}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* -------------------------------------------------------- */}
              {/* QUESTION TYPE: TRUE / FALSE                              */}
              {/* -------------------------------------------------------- */}
              {currentQ.type === 'true_false' && (
                <div className="grid grid-cols-2 gap-3.5 my-2">
                  {/* True Option */}
                  <button
                    disabled={isAnswerSubmitted}
                    onClick={() => handleSelectTrueFalse(true)}
                    className={`p-5 rounded-xl border flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                      isAnswerSubmitted
                        ? expectedTfValue === true
                          ? 'bg-[#DDF7F2] border-2 border-[#169E6C] text-[#064E3B] font-extrabold'
                          : tfSelection === true
                          ? 'bg-[#FFE4E8] border-2 border-[#E5484D] text-[#881337] line-through opacity-80'
                          : 'opacity-45 border-[#E5E1EB]'
                        : 'bg-white border-[#E5E1EB] text-[#24243B] hover:border-[#5B46E8]/50 hover:bg-[#F7F5F0]/60'
                    }`}
                  >
                    <CheckCircle2
                      className={`w-7 h-7 ${
                        isAnswerSubmitted && expectedTfValue === true
                          ? 'text-[#169E6C]'
                          : 'text-[#169E6C]'
                      }`}
                    />
                    <span className="text-sm font-extrabold">درست است</span>
                    <span className="text-[11px] font-bold text-[#69697E]">کلید ۱</span>
                  </button>

                  {/* False Option */}
                  <button
                    disabled={isAnswerSubmitted}
                    onClick={() => handleSelectTrueFalse(false)}
                    className={`p-5 rounded-xl border flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                      isAnswerSubmitted
                        ? expectedTfValue === false
                          ? 'bg-[#DDF7F2] border-2 border-[#169E6C] text-[#064E3B] font-extrabold'
                          : tfSelection === false
                          ? 'bg-[#FFE4E8] border-2 border-[#E5484D] text-[#881337] line-through opacity-80'
                          : 'opacity-45 border-[#E5E1EB]'
                        : 'bg-white border-[#E5E1EB] text-[#24243B] hover:border-[#5B46E8]/50 hover:bg-[#F7F5F0]/60'
                    }`}
                  >
                    <XCircle
                      className={`w-7 h-7 ${
                        isAnswerSubmitted && expectedTfValue === false
                          ? 'text-[#169E6C]'
                          : 'text-[#E5484D]'
                      }`}
                    />
                    <span className="text-sm font-extrabold">نادرست است</span>
                    <span className="text-[11px] font-bold text-[#69697E]">کلید ۲</span>
                  </button>
                </div>
              )}

              {/* -------------------------------------------------------- */}
              {/* QUESTION TYPE: FILL IN THE BLANK                         */}
              {/* -------------------------------------------------------- */}
              {currentQ.type === 'fill_blank' && (
                <div className="space-y-4">
                  <div className="bg-[#F7F5F0] border border-[#E5E1EB] rounded-2xl p-5 text-right">
                    <p className="text-base sm:text-lg font-bold text-[#24243B] leading-loose">
                      {currentQ.blankContext?.before || ''}
                      <span
                        className={`inline-flex items-center justify-center px-4 py-1.5 mx-2 min-w-[110px] rounded-xl font-extrabold text-sm sm:text-base transition-all border ${
                          selectedWord
                            ? isCurrentCorrect
                              ? 'bg-[#DDF7F2] border-[#169E6C] text-[#064E3B]'
                              : 'bg-[#FFE4E8] border-[#E5484D] text-[#881337] line-through'
                            : 'bg-white border-dashed border-[#5B46E8] text-[#5B46E8]'
                        }`}
                      >
                        {selectedWord || '______'}
                      </span>
                      {currentQ.blankContext?.after || ''}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-[#69697E] mb-2.5 px-1">
                      <span>واژه صحیح را انتخاب کنید:</span>
                      <span className="text-[11px] font-extrabold text-[#5B46E8] bg-[#EAE4FF] px-2.5 py-0.5 rounded-md">
                        انتخاب مستقیم
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {fillBlankOptions.map((word, idx) => {
                        const isSelected = selectedWord === word;
                        const isTarget =
                          normalizePersian(word) ===
                          normalizePersian(String(currentQ.correctAnswer));

                        let chipClass =
                          'bg-white border border-[#E5E1EB] text-[#24243B] hover:border-[#5B46E8]/50 hover:bg-[#F7F5F0]/60';

                        if (isAnswerSubmitted) {
                          if (isTarget) {
                            chipClass =
                              'bg-[#DDF7F2] border-2 border-[#169E6C] text-[#064E3B] font-extrabold';
                          } else if (isSelected && !isTarget) {
                            chipClass =
                              'bg-[#FFE4E8] border-2 border-[#E5484D] text-[#881337] line-through opacity-85';
                          } else {
                            chipClass = 'opacity-45 border-[#E5E1EB] bg-[#F7F5F0]/50';
                          }
                        }

                        return (
                          <button
                            key={idx}
                            disabled={isAnswerSubmitted}
                            onClick={() => handleSelectFillBlank(word)}
                            className={`p-3.5 sm:p-4 rounded-xl text-center text-sm sm:text-base font-bold transition-all cursor-pointer flex items-center justify-between px-4 min-h-[48px] ${chipClass}`}
                          >
                            <span className="text-xs font-bold text-[#69697E] w-5 text-right">
                              {toPersianDigits(idx + 1)}
                            </span>
                            <span className="flex-1 text-center font-extrabold">{word}</span>
                            <div className="w-5 flex justify-end shrink-0">
                              {isAnswerSubmitted && isTarget && (
                                <Check className="w-4 h-4 text-[#169E6C] stroke-[2.75]" />
                              )}
                              {isAnswerSubmitted && isSelected && !isTarget && (
                                <X className="w-4 h-4 text-[#E5484D] stroke-[2.75]" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* -------------------------------------------------------- */}
              {/* QUESTION TYPE: MATCH PAIRS                               */}
              {/* -------------------------------------------------------- */}
              {currentQ.type === 'match_pairs' && currentQ.matchPairs && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between text-xs font-bold text-[#69697E] px-1">
                    <span>جفت‌های مرتبط را یکی‌یکی انتخاب کنید:</span>
                    <span className="text-[#169E6C] font-extrabold">
                      {toPersianDigits(matchedPairs.length)} از {toPersianDigits(currentQ.matchPairs.length)} جفت تطبیق داده شد
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                    {/* Left side */}
                    <div className="flex flex-col gap-2.5">
                      {currentQ.matchPairs.map((p) => {
                        const isDone = matchedPairs.includes(p.id);
                        const isSelected = selectedLeftPair === p.id;
                        return (
                          <button
                            key={`left-${p.id}`}
                            disabled={isDone || isAnswerSubmitted}
                            onClick={() => handlePairClick('left', p.id)}
                            className={`p-3.5 rounded-xl border text-xs font-extrabold transition-all cursor-pointer flex items-center justify-between gap-1.5 text-right min-h-[48px] break-words ${
                              isDone
                                ? 'bg-[#DDF7F2]/60 border-[#169E6C]/40 text-[#064E3B] line-through opacity-60'
                                : isSelected
                                ? 'bg-[#EAE4FF] border-2 border-[#5B46E8] text-[#24243B]'
                                : 'bg-white border-[#E5E1EB] text-[#24243B] hover:border-[#5B46E8]/40 hover:bg-[#F7F5F0]/50'
                            }`}
                          >
                            <span className="flex-1">{p.left}</span>
                            {isDone && <Check className="w-3.5 h-3.5 text-[#169E6C] stroke-[2.75] shrink-0" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* Right side */}
                    <div className="flex flex-col gap-2.5">
                      {shuffledRightPairs.map((p) => {
                        const isDone = matchedPairs.includes(p.id);
                        const isSelected = selectedRightPair === p.id;
                        return (
                          <button
                            key={`right-${p.id}`}
                            disabled={isDone || isAnswerSubmitted}
                            onClick={() => handlePairClick('right', p.id)}
                            className={`p-3.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-1.5 text-right min-h-[48px] break-words ${
                              isDone
                                ? 'bg-[#DDF7F2]/60 border-[#169E6C]/40 text-[#064E3B] line-through opacity-60'
                                : isSelected
                                ? 'bg-[#EAE4FF] border-2 border-[#5B46E8] text-[#24243B]'
                                : 'bg-white border-[#E5E1EB] text-[#24243B] hover:border-[#5B46E8]/40 hover:bg-[#F7F5F0]/50'
                            }`}
                          >
                            <span className="flex-1">{p.right}</span>
                            {isDone && <Check className="w-3.5 h-3.5 text-[#169E6C] stroke-[2.75] shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* -------------------------------------------------------- */}
              {/* QUESTION TYPE: SENTENCE ORDER                            */}
              {/* -------------------------------------------------------- */}
              {currentQ.type === 'sentence_order' && currentQ.sentenceTokens && (
                <div className="space-y-4">
                  <div className="bg-[#F7F5F0] border border-[#E5E1EB] rounded-2xl p-4 sm:p-5 text-right min-h-[95px] flex flex-col justify-between">
                    <div className="flex flex-wrap gap-2 items-center min-h-[48px]">
                      {sentenceOrderTokens.length === 0 ? (
                        <div className="w-full flex items-center justify-center py-3 text-[#69697E] text-xs sm:text-sm font-medium gap-2 select-none">
                          <Sparkles className="w-4 h-4 text-[#5B46E8]" />
                          <span>واژه‌های زیر را به ترتیب صحیح انتخاب کنید...</span>
                        </div>
                      ) : (
                        sentenceOrderTokens.map((token, i) => (
                          <button
                            key={i}
                            disabled={isAnswerSubmitted}
                            onClick={() => {
                              playDuoSound('click');
                              setSentenceOrderTokens((prev) =>
                                prev.filter((_, idx) => idx !== i)
                              );
                            }}
                            className="bg-white border border-[#5B46E8]/40 hover:border-[#E5484D] hover:text-[#E5484D] text-[#24243B] text-xs sm:text-sm font-extrabold px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 group min-h-[44px]"
                            title="حذف از عبارت"
                          >
                            <span>{token}</span>
                            <X className="w-3 h-3 text-[#69697E] group-hover:text-[#E5484D]" />
                          </button>
                        ))
                      )}
                    </div>

                    <div className="w-full border-t border-dashed border-[#CFC9DA] mt-2.5 pt-1.5 flex justify-between items-center text-[11px] font-bold text-[#69697E]">
                      <span>ترتیب عبارت علمی</span>
                      {sentenceOrderTokens.length > 0 && !isAnswerSubmitted && (
                        <button
                          onClick={() => {
                            playDuoSound('click');
                            setSentenceOrderTokens([]);
                          }}
                          className="text-[#E5484D] hover:bg-[#FFE4E8]/60 rounded-lg font-extrabold cursor-pointer flex items-center gap-1 text-xs min-h-[44px] px-3 py-1.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>پاک‌کردن همه</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-[#69697E] mb-2.5 px-1">
                      <span>بانک واژگان:</span>
                      <span className="text-[11px] font-extrabold text-[#5B46E8] bg-[#EAE4FF] px-2.5 py-0.5 rounded-md">
                        {toPersianDigits(sentenceOrderTokens.length)} از {toPersianDigits(currentQ.sentenceTokens.length)} کلمه انتخاب شد
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 justify-center">
                      {currentQ.sentenceTokens.map((token, i) => {
                        const isUsed = sentenceOrderTokens.includes(token);
                        return isUsed ? (
                          <div
                            key={i}
                            className="px-4 py-2.5 rounded-xl border border-dashed border-[#CFC9DA] bg-[#F7F5F0] text-transparent font-extrabold text-xs sm:text-sm select-none opacity-40 min-w-[65px] min-h-[44px] flex items-center justify-center text-center"
                          >
                            {token}
                          </div>
                        ) : (
                          <button
                            key={i}
                            disabled={isAnswerSubmitted}
                            onClick={() => {
                              playDuoSound('click');
                              const nextTokens = [...sentenceOrderTokens, token];
                              setSentenceOrderTokens(nextTokens);
                              if (currentQ.sentenceTokens && nextTokens.length === currentQ.sentenceTokens.length) {
                                const userSentence = nextTokens.join(' ').trim();
                                const correctSentence = String(
                                  currentQ.correctAnswer || currentQ.correctSentence
                                ).trim();
                                const correct = userSentence === correctSentence;
                                evaluateAnswer(correct, userSentence);
                              }
                            }}
                            className="bg-white border border-[#E5E1EB] hover:border-[#5B46E8] hover:bg-[#EAE4FF]/30 text-[#24243B] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer min-h-[44px]"
                          >
                            {token}
                          </button>
                        );
                      })}
                    </div>

                    {!isAnswerSubmitted && sentenceOrderTokens.length > 0 && (
                      <button
                        onClick={handleCheckSentenceOrder}
                        className="w-full py-3.5 rounded-xl bg-[#5B46E8] hover:bg-[#4935D4] text-white text-sm font-extrabold mt-4 cursor-pointer flex items-center justify-center gap-2 transition-colors min-h-[48px]"
                      >
                        <Check className="w-4 h-4 stroke-[2.75]" />
                        <span>بررسی و ثبت عبارت</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ============================================================== */
            /* STAGE COMPLETION SUMMARY (Editorial Studio Completion)         */
            /* ============================================================== */
            <div className="flex flex-col items-center justify-center text-center py-4 sm:py-6 animate-scaleUp relative">
              <div className="relative z-10 flex flex-col items-center w-full max-w-md">
                {/* Original Psychology Studio Completion Emblem */}
                <div className="w-16 h-16 rounded-2xl bg-[#EAE4FF] border border-[#5B46E8]/25 flex items-center justify-center text-[#5B46E8] mb-3 relative">
                  <Trophy className="w-8 h-8 text-[#5B46E8]" />
                  <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-[#169E6C] text-white flex items-center justify-center border-2 border-white">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </span>
                </div>

                <span className="text-xs font-extrabold text-[#169E6C] bg-[#DDF7F2] px-3.5 py-1 rounded-lg border border-[#169E6C]/25">
                  مرحله {toPersianDigits(stage.stageNumber)} با موفقیت تکمیل شد
                </span>

                <h2 className="text-xl sm:text-2xl font-black text-[#24243B] mt-2.5">
                  {stage.title}
                </h2>

                <p className="text-xs sm:text-sm font-medium text-[#69697E] mt-1 max-w-sm leading-relaxed">
                  مفاهیم این درس ثبت شد و مرحله بعدی در برنامه درسی شما آماده مطالعه است.
                </p>

                {/* Visual Provenance Badge (Task 1A.3) */}
                <div className="mt-3.5 flex flex-col items-center gap-2 w-full">
                  {isSubmittingReward ? (
                    <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#EAE4FF] border border-[#5B46E8]/25 text-[#5B46E8] text-xs font-extrabold">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#5B46E8]" />
                      <span>در حال ثبت و تأیید امتیاز در سرور...</span>
                    </div>
                  ) : completedRecordState?.verified || rewardResult?.ok ? (
                    <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#DDF7F2] border border-[#169E6C]/30 text-[#064E3B] text-xs font-extrabold">
                      <ShieldCheck className="w-4 h-4 text-[#169E6C] shrink-0" />
                      <span>تأیید شده در سرور (امتیاز ثبت شد)</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#FFF0C8] border border-[#F59E0B]/40 text-[#92400E] text-xs font-extrabold">
                      <CloudOff className="w-4 h-4 text-[#D97706] shrink-0" />
                      <span>ذخیره محلی/آفلاین (بدون امتیاز لیدربورد)</span>
                    </div>
                  )}

                  {/* Neutral Practice Mode Info when alreadyClaimed or replaying a completed stage (Task 1B) */}
                  {(wasAlreadyCompletedBeforeAttemptRef.current || rewardResult?.alreadyClaimed) && (
                    <div className="px-3.5 py-2 rounded-xl bg-[#F7F5F0] border border-[#E5E1EB] text-[#69697E] text-xs font-bold">
                      امتیاز این مرحله قبلاً ثبت شده است (حالت تمرین)
                    </div>
                  )}

                  {/* Prerequisite gap or network retry control (Task 1A.2 & 1B) */}
                  {!isSubmittingReward && !(completedRecordState?.verified || rewardResult?.ok) && (
                    <div className="w-full flex flex-col items-center gap-2 mt-1">
                      {rewardResult?.code === 'PREREQUISITE_NOT_MET' && (
                        <div className="p-2.5 rounded-xl bg-[#FFF0C8]/80 border border-[#F59E0B]/40 text-[11px] font-bold text-[#92400E] leading-relaxed">
                          مرحله قبلی در حالت آفلاین تکمیل شده است. برای ثبت امتیاز (XP) در لیدربورد جهانی، ابتدا مرحله قبلی را به صورت آنلاین تأیید کنید.
                        </div>
                      )}
                      <button
                        onClick={() => {
                          if (completedRecordState) {
                            playDuoSound('click');
                            void submitAttemptReward(completedRecordState);
                          }
                        }}
                        className="px-4 py-2.5 rounded-xl bg-[#EAE4FF] hover:bg-[#5B46E8] hover:text-white border border-[#5B46E8]/30 text-[#5B46E8] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors min-h-[44px]"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>تلاش مجدد ارسال امتیاز</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Stars Earned */}
                <div className="flex flex-col items-center gap-1.5 my-4">
                  <div className="flex items-center gap-2">
                    {[1, 2, 3].map((starIdx) => {
                      const earned = currentStars >= starIdx;
                      return (
                        <Star
                          key={starIdx}
                          className={`w-8 h-8 transition-all ${
                            earned
                              ? 'fill-[#F59E0B] text-[#D97706] scale-105'
                              : 'fill-[#E5E1EB] text-[#CFC9DA] scale-95 opacity-50'
                          }`}
                        />
                      );
                    })}
                  </div>
                  <span className="text-xs font-extrabold text-[#92400E] bg-[#FFF0C8] px-3 py-0.5 rounded-md border border-[#F59E0B]/30 mt-1">
                    کسب {toPersianDigits(currentStars)} از ۳ ستاره
                  </span>
                </div>

                {/* Score & XP badges */}
                <div className="flex items-center gap-2.5 my-2 text-xs font-extrabold">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFF0C8]/75 border border-[#F59E0B]/30 text-[#92400E]">
                    <Zap className="w-4 h-4 fill-[#F59E0B] text-[#D97706]" />
                    <span>
                      {
                        resolveStageAttemptDisplayReward({
                          stageXpReward: stage.xpReward,
                          wasAlreadyCompleted: wasAlreadyCompletedBeforeAttemptRef.current,
                          rewardResult,
                        }).badgeLabel
                      }
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#DDF7F2]/75 border border-[#169E6C]/30 text-[#064E3B]">
                    <Check className="w-4 h-4 stroke-[2.75]" />
                    <span>
                      دقت: {toPersianDigits(Math.round(((stage.questions.length - wrongCount) / stage.questions.length) * 100))}٪
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="w-full flex flex-col sm:flex-row gap-2.5 mt-4">
                  <button
                    onClick={() => {
                      playDuoSound('click');
                      onClose();
                    }}
                    className="flex-1 py-3.5 rounded-xl bg-[#5B46E8] hover:bg-[#4935D4] text-white text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-colors min-h-[48px]"
                  >
                    <Compass className="w-4 h-4" />
                    <span>بازگشت به برنامه درسی</span>
                  </button>

                  {onStartNextStage && stage.stageNumber < 100 && (
                    <button
                      onClick={() => {
                        playDuoSound('click');
                        onStartNextStage(stage.stageNumber + 1);
                      }}
                      className="bg-[#F7F5F0] hover:bg-[#EAE4FF]/50 text-[#24243B] px-5 py-3.5 rounded-xl text-xs font-extrabold cursor-pointer border border-[#E5E1EB] flex items-center justify-center gap-1.5 transition-colors min-h-[48px]"
                    >
                      <span>شروع مرحله {toPersianDigits(stage.stageNumber + 1)}</span>
                      <ArrowLeft className="w-4 h-4 text-[#5B46E8]" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ================================================================ */}
        {/* BOTTOM FEEDBACK BAR                                              */}
        {/* ================================================================ */}
        {!isStageFinished && isAnswerSubmitted && (
          <div
            className={`p-4 sm:p-5 border-t transition-all animate-fadeIn shrink-0 ${
              isCurrentCorrect
                ? 'bg-[#DDF7F2]/90 border-[#169E6C]/35 text-[#064E3B]'
                : 'bg-[#FFE4E8]/90 border-[#E5484D]/35 text-[#881337]'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Feedback text */}
              <div className="flex items-start gap-3 text-right flex-1">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    isCurrentCorrect ? 'bg-[#169E6C] text-white' : 'bg-[#E5484D] text-white'
                  }`}
                >
                  {isCurrentCorrect ? (
                    <Check className="w-4 h-4 stroke-[3]" />
                  ) : (
                    <X className="w-4 h-4 stroke-[3]" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-black">
                      {isCurrentCorrect ? 'پاسخ صحیح است' : 'پاسخ نادرست ثبت شد'}
                    </h4>
                    {!isCurrentCorrect && (
                      <span className="text-[11px] font-extrabold bg-white/80 text-[#881337] px-2.5 py-0.5 rounded-md border border-[#E5484D]/30">
                        کسر ستاره (باقی‌مانده: {toPersianDigits(currentStars)} از ۳ ستاره)
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-medium mt-1 leading-relaxed">
                    {currentQ.explanation}
                  </p>
                  {!isCurrentCorrect && (
                    <div className="mt-2 bg-white/75 border border-[#E5484D]/25 rounded-lg p-2 text-xs font-bold text-[#881337] flex items-center gap-1.5">
                      <Lightbulb className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
                      <span>نکته کلیدی: {stage.keyTakeaway}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Advance Button */}
              <button
                onClick={handleContinue}
                className={`w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-extrabold text-white cursor-pointer transition-colors flex items-center justify-center gap-2 shrink-0 min-h-[48px] ${
                  isCurrentCorrect
                    ? 'bg-[#169E6C] hover:bg-[#128359]'
                    : 'bg-[#E5484D] hover:bg-[#C93B40]'
                }`}
              >
                <span>
                  {currentQIndex < stage.questions.length - 1
                    ? 'سوال بعدی'
                    : 'مشاهده نتیجه درس'}
                </span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

