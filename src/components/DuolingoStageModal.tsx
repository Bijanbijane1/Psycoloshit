import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  ChevronDown,
  ChevronUp,
  FileText,
  MapPin,
} from 'lucide-react';
import { DuolingoStage, Question, StageCompletionRecord } from '../types/psychology';
import { DuoMascot } from './DuoMascot';
import { playDuoSound } from '../utils/duoAudio';
import confetti from 'canvas-confetti';

interface DuolingoStageModalProps {
  stage: DuolingoStage | null;
  isOpen: boolean;
  isLocked: boolean;
  previousStageNumber?: number;
  onClose: () => void;
  onCompleteStage: (record: StageCompletionRecord) => void;
  onStartNextStage?: (nextStageNumber: number) => void;
}

export const DuolingoStageModal: React.FC<DuolingoStageModalProps> = ({
  stage,
  isOpen,
  isLocked,
  previousStageNumber,
  onClose,
  onCompleteStage,
  onStartNextStage,
}) => {
  if (!isOpen || !stage) return null;

  // If locked, render clean locked dialog
  if (isLocked) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none animate-fadeIn">
        <div className="bg-white border-2 border-b-6 border-slate-300 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative text-center animate-scaleUp">
          <button
            onClick={onClose}
            className="absolute top-4 left-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="بستن"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-slate-100 border-2 border-b-4 border-slate-300 flex items-center justify-center text-slate-400 shadow-inner">
            <Lock className="w-8 h-8 text-slate-400" />
          </div>

          <span className="text-xs font-black uppercase tracking-wider text-amber-700 bg-amber-100/70 px-3 py-1 rounded-full border border-amber-300">
            مرحله {stage.stageNumber} قفل است
          </span>

          <h3 className="text-xl font-black text-slate-800 mt-3">
            {stage.title}
          </h3>

          <p className="text-sm font-bold text-slate-500 mt-2 leading-relaxed">
            سیستم مدیریت پیش‌نیازها مانع ورود زودهنگام به این مبحث می‌شود. برای یادگیری اصولی و گام‌به‌گام، ابتدا مرحله{' '}
            <strong className="text-indigo-600 font-black">
              {previousStageNumber || stage.stageNumber - 1}
            </strong>{' '}
            را با موفقیت تکمیل نمایید.
          </p>

          <button
            onClick={onClose}
            className="duo-btn-green w-full py-3.5 rounded-2xl text-sm font-black mt-6 cursor-pointer"
          >
            متوجه شدم، رفتن به مرحله قبل
          </button>
        </div>
      </div>
    );
  }

  return (
    <DuolingoStagePlayer
      key={stage.id}
      stage={stage}
      onClose={onClose}
      onCompleteStage={onCompleteStage}
      onStartNextStage={onStartNextStage}
    />
  );
};

// =========================================================================
// ACTIVE STAGE QUIZ PLAYER (Decluttered, Instant-Option Evaluation)
// =========================================================================
interface DuolingoStagePlayerProps {
  stage: DuolingoStage;
  onClose: () => void;
  onCompleteStage: (record: StageCompletionRecord) => void;
  onStartNextStage?: (nextStageNumber: number) => void;
}

const DuolingoStagePlayer: React.FC<DuolingoStagePlayerProps> = ({
  stage,
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

  const currentQ: Question = stage.questions[currentQIndex];
  const progressPercent =
    ((currentQIndex + (isAnswerSubmitted ? 1 : 0)) / stage.questions.length) * 100;

  // Helper to normalize Persian strings for robust matching (half-space, arabic characters, whitespace)
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

  // Shuffled right-side pairs for matching (ensures it is not 1-to-1 horizontally identical)
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

  // Central Evaluation Function (Instant feedback!)
  const evaluateAnswer = useCallback(
    (correct: boolean) => {
      setIsCurrentCorrect(correct);
      setIsAnswerSubmitted(true);

      if (correct) {
        playDuoSound('correct');
        setScoreCount((prev) => prev + 1);
      } else {
        playDuoSound('wrong');
        setWrongCount((prev) => prev + 1);
        setHearts((prev) => Math.max(1, prev - 1));
      }
    },
    []
  );

  // INSTANT SELECTION HANDLERS - No manual "بررسی پاسخ" confirmation needed!
  const handleSelectMultipleChoice = (idx: number) => {
    if (isAnswerSubmitted) return;
    setMcSelection(idx);
    const correct = idx === currentQ.correctAnswer;
    evaluateAnswer(correct);
  };

  const handleSelectTrueFalse = (val: boolean) => {
    if (isAnswerSubmitted) return;
    setTfSelection(val);
    const correct = val === expectedTfValue;
    evaluateAnswer(correct);
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
        evaluateAnswer(true);
      }
    } else {
      playDuoSound('wrong');
      setSelectedLeftPair(null);
      setSelectedRightPair(null);
    }
  };

  // Fill in blank selection (Instant One-Tap Check - No Typing Needed!)
  const handleSelectFillBlank = (word: string) => {
    if (isAnswerSubmitted) return;
    setSelectedWord(word);
    const userClean = normalizePersian(word);
    const targetClean = normalizePersian(String(currentQ.correctAnswer));
    const correct =
      userClean === targetClean ||
      targetClean.includes(userClean) ||
      userClean.includes(targetClean);
    evaluateAnswer(correct);
  };

  // Sentence order check
  const handleCheckSentenceOrder = () => {
    if (sentenceOrderTokens.length === 0 || isAnswerSubmitted) return;
    const userSentence = normalizePersian(sentenceOrderTokens.join(' '));
    const correctSentence = normalizePersian(
      String(currentQ.correctAnswer || currentQ.correctSentence)
    );
    const correct = userSentence === correctSentence;
    evaluateAnswer(correct);
  };

  // Continue to next question or finish stage (no infinite retry loop)
  const handleContinue = useCallback(() => {
    if (currentQIndex < stage.questions.length - 1) {
      playDuoSound('click');
      setCurrentQIndex((prev) => prev + 1);
    } else {
      playDuoSound('complete');
      confetti({
        particleCount: 85,
        spread: 85,
        origin: { y: 0.5 },
        colors: ['#58CC02', '#FFC800', '#1CB0F6', '#CE82FF'],
      });

      const starsAwarded = wrongCount === 0 ? 3 : wrongCount <= 2 ? 2 : 1;
      const record: StageCompletionRecord = {
        stageNumber: stage.stageNumber,
        completedAt: new Date().toISOString(),
        stars: starsAwarded,
        score: Math.max(0, stage.questions.length - wrongCount),
        totalQuestions: stage.questions.length,
        xpEarned: stage.xpReward,
      };

      onCompleteStage(record);
      setIsStageFinished(true);
    }
  }, [currentQIndex, stage, wrongCount, onCompleteStage]);

  // Keyboard shortcut support (1-4 for options, Enter/Space for advance)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isStageFinished) return;

      // When answered: Enter or Space proceeds to the next question immediately
      if (isAnswerSubmitted) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleContinue();
        }
        return;
      }

      // When not answered: numeric keys select options instantly
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-4 bg-slate-900/60 backdrop-blur-xs select-none animate-fadeIn">
      <div className="bg-white border-2 border-b-6 border-slate-300 rounded-2xl sm:rounded-3xl w-full max-w-xl max-h-[96dvh] sm:max-h-[92vh] flex flex-col overflow-hidden shadow-2xl relative animate-scaleUp">
        {/* ================================================================ */}
        {/* TOP STATUS BAR: Decluttered, Clean Duolingo Header               */}
        {/* ================================================================ */}
        <div className="px-3 sm:px-5 py-2.5 sm:py-3.5 border-b border-slate-200 flex items-center justify-between gap-1.5 sm:gap-3 bg-slate-50/80">
          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center shrink-0"
            title="خروج از مرحله"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Duolingo Progress Bar */}
          <div className="flex-1 flex flex-col gap-0.5 sm:gap-1 mx-1 sm:mx-2 min-w-0">
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-black text-slate-500">
              <span className="flex items-center gap-1 text-[#58CC02] truncate">
                <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-[#58CC02] shrink-0" />
                مرحله {stage.stageNumber}
              </span>
              <span className="shrink-0">
                {currentQIndex + 1}/{stage.questions.length}
              </span>
            </div>
            <div className="w-full h-2.5 sm:h-3 bg-slate-200 rounded-full overflow-hidden p-0.5">
              <div
                className="h-full bg-gradient-to-r from-[#58CC02] to-[#46A302] rounded-full transition-all duration-300 shadow-xs"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Optional Hint Toggle (Keeps screen decluttered) */}
          <button
            onClick={() => setIsHintOpen((prev) => !prev)}
            className={`p-1.5 sm:px-2.5 sm:py-1 rounded-xl text-xs font-black flex items-center gap-1 transition-all cursor-pointer border shrink-0 min-h-[36px] ${
              isHintOpen
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
            title="مشاهده نکته آموزشی"
          >
            <Lightbulb className={`w-3.5 h-3.5 ${isHintOpen ? 'text-amber-600 fill-amber-500' : 'text-slate-500'}`} />
            <span className="hidden sm:inline">نکته</span>
          </button>

          {/* Dynamic Stars Remaining Counter */}
          <div className="hidden xs:flex items-center gap-1 px-2 sm:px-3 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 font-black text-xs shadow-2xs shrink-0">
            <div className="flex items-center -space-x-1">
              {[1, 2, 3].map((starIdx) => (
                <Star
                  key={starIdx}
                  className={`w-3 h-3 sm:w-3.5 sm:h-3.5 transition-all duration-300 ${
                    currentStars >= starIdx
                      ? 'fill-amber-400 text-amber-500 scale-100'
                      : 'fill-slate-200 text-slate-300 scale-90 opacity-60'
                  }`}
                />
              ))}
            </div>
            <span className="text-[10px] sm:text-[11px] font-black mr-0.5 sm:mr-1 hidden sm:inline">{currentStars} ستاره</span>
          </div>

          {/* Hearts Counter */}
          <div className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 font-black text-xs shadow-2xs shrink-0 min-h-[36px]">
            <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
            <span className="text-xs font-black">{hearts}</span>
          </div>
        </div>

        {/* ================================================================ */}
        {/* COLLAPSIBLE HINT DRAWER (Only when needed, zero visual clutter)    */}
        {/* ================================================================ */}
        {isHintOpen && (
          <div className="bg-amber-50 border-b border-amber-200 p-3.5 text-right flex items-start gap-3 transition-all animate-fadeIn">
            <DuoMascot mood="tutor" size={38} className="shrink-0 -mt-0.5" />
            <div className="flex-1 text-xs font-bold text-amber-950 leading-relaxed">
              <span className="font-black text-amber-900 block mb-0.5">
                💡 نکته کلیدی مرحله {stage.stageNumber}:
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
              <div className="text-right mb-6">
                <span className="text-[11px] font-black uppercase text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full inline-block mb-2">
                  {stage.unitTitle}
                </span>
                <h3 className="text-lg sm:text-xl font-black text-slate-800 leading-relaxed">
                  {currentQ.text}
                </h3>
              </div>

              {/* -------------------------------------------------------- */}
              {/* QUESTION TYPE: MULTIPLE CHOICE (Instant One-Tap Select)   */}
              {/* -------------------------------------------------------- */}
              {currentQ.type === 'multiple_choice' && currentQ.options && (
                <div className="grid grid-cols-1 gap-2.5">
                  {currentQ.options.map((opt, idx) => {
                    const isSelected = mcSelection === idx;
                    const isCorrectChoice = idx === currentQ.correctAnswer;

                    let cardClass =
                      'bg-white border-2 border-b-4 border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-50/80 active:translate-y-0.5';

                    if (isAnswerSubmitted) {
                      if (isCorrectChoice) {
                        cardClass =
                          'bg-emerald-50 border-2 border-b-4 border-emerald-500 text-emerald-950 font-black shadow-xs ring-2 ring-emerald-400/40';
                      } else if (isSelected && !isCorrectChoice) {
                        cardClass =
                          'bg-rose-50 border-2 border-b-4 border-rose-500 text-rose-950 line-through opacity-90';
                      } else {
                        cardClass = 'opacity-40 border-slate-200 bg-slate-50';
                      }
                    }

                    return (
                      <button
                        key={idx}
                        disabled={isAnswerSubmitted}
                        onClick={() => handleSelectMultipleChoice(idx)}
                        className={`w-full p-4 rounded-2xl text-right text-sm font-bold transition-all cursor-pointer flex items-center justify-between gap-3 ${cardClass}`}
                      >
                        <span className="flex-1 text-right">{opt}</span>

                        <div className="flex items-center gap-2 shrink-0">
                          {isAnswerSubmitted && isCorrectChoice && (
                            <Check className="w-5 h-5 text-emerald-600 stroke-[3]" />
                          )}
                          {isAnswerSubmitted && isSelected && !isCorrectChoice && (
                            <X className="w-5 h-5 text-rose-600 stroke-[3]" />
                          )}
                          <div
                            className={`w-6 h-6 rounded-xl flex items-center justify-center text-xs font-black ${
                              isSelected
                                ? isCurrentCorrect
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-rose-500 text-white'
                                : 'bg-slate-100 text-slate-500 border border-slate-300'
                            }`}
                          >
                            {idx + 1}
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
                    <div className="bg-sky-50 border-2 border-sky-200 rounded-2xl p-4 text-right shadow-2xs">
                      <div className="flex items-center gap-2 mb-2 text-sky-800 font-black text-xs">
                        <FileText className="w-4 h-4 text-sky-600" />
                        <span>شرح سناریوی پژوهشی / موقعیت بالینی:</span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-800 font-bold leading-relaxed mb-2">
                        {currentQ.caseScenario.clientProfile}
                      </p>
                      {currentQ.caseScenario.symptoms && currentQ.caseScenario.symptoms.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {currentQ.caseScenario.symptoms.map((s, idx) => (
                            <span
                              key={idx}
                              className="bg-white border border-sky-300 text-sky-900 text-[11px] font-bold px-2.5 py-0.5 rounded-lg shadow-2xs"
                            >
                              🔍 {s}
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
                        'bg-white border-2 border-b-4 border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-50/80 active:translate-y-0.5';

                      if (isAnswerSubmitted) {
                        if (isCorrectChoice) {
                          cardClass =
                            'bg-emerald-50 border-2 border-b-4 border-emerald-500 text-emerald-950 font-black shadow-xs ring-2 ring-emerald-400/40';
                        } else if (isSelected && !isCorrectChoice) {
                          cardClass =
                            'bg-rose-50 border-2 border-b-4 border-rose-500 text-rose-950 line-through opacity-90';
                        } else {
                          cardClass = 'opacity-40 border-slate-200 bg-slate-50';
                        }
                      }

                      return (
                        <button
                          key={idx}
                          disabled={isAnswerSubmitted}
                          onClick={() => handleSelectMultipleChoice(idx)}
                          className={`w-full p-4 rounded-2xl text-right text-sm font-bold transition-all cursor-pointer flex items-center justify-between gap-3 ${cardClass}`}
                        >
                          <span className="flex-1 text-right">{opt}</span>

                          <div className="flex items-center gap-2 shrink-0">
                            {isAnswerSubmitted && isCorrectChoice && (
                              <Check className="w-5 h-5 text-emerald-600 stroke-[3]" />
                            )}
                            {isAnswerSubmitted && isSelected && !isCorrectChoice && (
                              <X className="w-5 h-5 text-rose-600 stroke-[3]" />
                            )}
                            <div
                              className={`w-6 h-6 rounded-xl flex items-center justify-center text-xs font-black ${
                                isSelected
                                  ? isCurrentCorrect
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-rose-500 text-white'
                                  : 'bg-slate-100 text-slate-500 border border-slate-300'
                              }`}
                            >
                              {idx + 1}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* -------------------------------------------------------- */}
              {/* QUESTION TYPE: TRUE / FALSE (Instant One-Tap Select)      */}
              {/* -------------------------------------------------------- */}
              {currentQ.type === 'true_false' && (
                <div className="grid grid-cols-2 gap-3.5 my-2">
                  {/* True Option */}
                  <button
                    disabled={isAnswerSubmitted}
                    onClick={() => handleSelectTrueFalse(true)}
                    className={`p-5 rounded-2xl border-2 border-b-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                      isAnswerSubmitted
                        ? expectedTfValue === true
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-black ring-2 ring-emerald-400/40 shadow-sm'
                          : tfSelection === true
                          ? 'bg-rose-50 border-rose-500 text-rose-950 line-through opacity-80'
                          : 'opacity-40 border-slate-200'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <CheckCircle2
                      className={`w-8 h-8 ${
                        isAnswerSubmitted && expectedTfValue === true
                          ? 'text-emerald-600'
                          : 'text-emerald-500'
                      }`}
                    />
                    <span className="text-sm font-black">درست است</span>
                    <span className="text-[10px] font-bold text-slate-400">کلید ۱</span>
                  </button>

                  {/* False Option */}
                  <button
                    disabled={isAnswerSubmitted}
                    onClick={() => handleSelectTrueFalse(false)}
                    className={`p-5 rounded-2xl border-2 border-b-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                      isAnswerSubmitted
                        ? expectedTfValue === false
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-black ring-2 ring-emerald-400/40 shadow-sm'
                          : tfSelection === false
                          ? 'bg-rose-50 border-rose-500 text-rose-950 line-through opacity-80'
                          : 'opacity-40 border-slate-200'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <XCircle
                      className={`w-8 h-8 ${
                        isAnswerSubmitted && expectedTfValue === false
                          ? 'text-emerald-600'
                          : 'text-rose-500'
                      }`}
                    />
                    <span className="text-sm font-black">نادرست است</span>
                    <span className="text-[10px] font-bold text-slate-400">کلید ۲</span>
                  </button>
                </div>
              )}

              {/* -------------------------------------------------------- */}
              {/* QUESTION TYPE: FILL IN THE BLANK (Word Bank / Tap Cards) */}
              {/* No typing/keyboard required - 100% Tap & Auto-Check!     */}
              {/* -------------------------------------------------------- */}
              {currentQ.type === 'fill_blank' && (
                <div className="space-y-4">
                  {/* Sentence with interactive blank slot */}
                  <div className="bg-slate-50/90 border-2 border-slate-200 rounded-3xl p-5 text-right shadow-2xs">
                    <p className="text-base sm:text-lg font-bold text-slate-800 leading-loose">
                      {currentQ.blankContext?.before || ''}
                      <span
                        className={`inline-flex items-center justify-center px-4 py-2 mx-2 min-w-[110px] rounded-2xl font-black text-sm sm:text-base transition-all border-2 border-b-4 ${
                          selectedWord
                            ? isCurrentCorrect
                              ? 'bg-emerald-100 border-emerald-500 text-emerald-950 ring-2 ring-emerald-400/40 shadow-xs'
                              : 'bg-rose-100 border-rose-500 text-rose-950 ring-2 ring-rose-400/40 line-through'
                            : 'bg-white border-dashed border-indigo-400 text-indigo-500 shadow-2xs animate-pulse'
                        }`}
                      >
                        {selectedWord || '______'}
                      </span>
                      {currentQ.blankContext?.after || ''}
                    </p>
                  </div>

                  {/* Word Bank Cards (Tap to choose) */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-2.5 px-1">
                      <span>کلمه صحیح را لمس کنید:</span>
                      <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                        ⚡ بدون نیاز به تایپ
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {fillBlankOptions.map((word, idx) => {
                        const isSelected = selectedWord === word;
                        const isTarget =
                          normalizePersian(word) ===
                          normalizePersian(String(currentQ.correctAnswer));

                        let chipClass =
                          'bg-white border-2 border-b-4 border-slate-300 text-slate-800 hover:border-indigo-400 hover:bg-indigo-50/40 active:translate-y-1';

                        if (isAnswerSubmitted) {
                          if (isTarget) {
                            chipClass =
                              'bg-emerald-50 border-2 border-b-4 border-emerald-500 text-emerald-950 font-black shadow-xs ring-2 ring-emerald-400/40';
                          } else if (isSelected && !isTarget) {
                            chipClass =
                              'bg-rose-50 border-2 border-b-4 border-rose-500 text-rose-950 line-through opacity-85';
                          } else {
                            chipClass = 'opacity-40 border-slate-200 bg-slate-50';
                          }
                        }

                        return (
                          <button
                            key={idx}
                            disabled={isAnswerSubmitted}
                            onClick={() => handleSelectFillBlank(word)}
                            className={`p-4 rounded-2xl text-center text-sm sm:text-base font-black transition-all cursor-pointer flex items-center justify-between px-4 shadow-2xs ${chipClass}`}
                          >
                            <span className="text-xs font-bold text-slate-400 w-5 text-right">
                              {idx + 1}
                            </span>
                            <span className="flex-1 text-center font-black">{word}</span>
                            <div className="w-5 flex justify-end shrink-0">
                              {isAnswerSubmitted && isTarget && (
                                <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                              )}
                              {isAnswerSubmitted && isSelected && !isTarget && (
                                <X className="w-4 h-4 text-rose-600 stroke-[3]" />
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
              {/* QUESTION TYPE: MATCH PAIRS                              */}
              {/* -------------------------------------------------------- */}
              {currentQ.type === 'match_pairs' && currentQ.matchPairs && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1">
                    <span>جفت‌های مرتبط را یکی‌یکی لمس کنید:</span>
                    <span className="text-emerald-600 font-black">
                      {matchedPairs.length} از {currentQ.matchPairs.length} جفت تطبیق داده شد
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    {/* Left side (Concepts / Scholars) */}
                    <div className="flex flex-col gap-2.5">
                      {currentQ.matchPairs.map((p) => {
                        const isDone = matchedPairs.includes(p.id);
                        const isSelected = selectedLeftPair === p.id;
                        return (
                          <button
                            key={`left-${p.id}`}
                            disabled={isDone || isAnswerSubmitted}
                            onClick={() => handlePairClick('left', p.id)}
                            className={`p-3.5 rounded-2xl border-2 border-b-4 text-xs font-black transition-all cursor-pointer flex items-center justify-between shadow-2xs ${
                              isDone
                                ? 'bg-emerald-50 border-emerald-400 text-emerald-800 line-through opacity-60'
                                : isSelected
                                ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-sm ring-2 ring-indigo-400/30 -translate-y-0.5'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 active:translate-y-0.5'
                            }`}
                          >
                            <span>{p.left}</span>
                            {isDone && <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* Right side (Definitions / Findings - Shuffled!) */}
                    <div className="flex flex-col gap-2.5">
                      {shuffledRightPairs.map((p) => {
                        const isDone = matchedPairs.includes(p.id);
                        const isSelected = selectedRightPair === p.id;
                        return (
                          <button
                            key={`right-${p.id}`}
                            disabled={isDone || isAnswerSubmitted}
                            onClick={() => handlePairClick('right', p.id)}
                            className={`p-3.5 rounded-2xl border-2 border-b-4 text-xs font-bold transition-all cursor-pointer flex items-center justify-between shadow-2xs ${
                              isDone
                                ? 'bg-emerald-50 border-emerald-400 text-emerald-800 line-through opacity-60'
                                : isSelected
                                ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-sm ring-2 ring-indigo-400/30 -translate-y-0.5'
                                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 active:translate-y-0.5'
                            }`}
                          >
                            <span>{p.right}</span>
                            {isDone && <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* -------------------------------------------------------- */}
              {/* QUESTION TYPE: SENTENCE ORDER (Duolingo Magnetic Rail)   */}
              {/* -------------------------------------------------------- */}
              {currentQ.type === 'sentence_order' && currentQ.sentenceTokens && (
                <div className="space-y-4">
                  {/* Construction Drop Zone (Magnetic sentence slot rail) */}
                  <div className="bg-slate-50 border-2 border-b-4 border-slate-200 rounded-3xl p-4 sm:p-5 text-right shadow-inner min-h-[95px] flex flex-col justify-between">
                    <div className="flex flex-wrap gap-2.5 items-center min-h-[48px]">
                      {sentenceOrderTokens.length === 0 ? (
                        <div className="w-full flex items-center justify-center py-3 text-slate-400 text-xs sm:text-sm font-bold gap-2 select-none">
                          <Sparkles className="w-4 h-4 text-slate-300" />
                          <span>کلمات زیر را برای ساخت عبارت لمس کنید...</span>
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
                            className="bg-white border-2 border-b-4 border-indigo-300 hover:border-rose-400 hover:text-rose-600 text-indigo-950 text-xs sm:text-sm font-black px-3.5 py-2 rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-1.5 active:translate-y-1 group"
                            title="لمس برای بازگرداندن به بانک کلمات"
                          >
                            <span>{token}</span>
                            <X className="w-3 h-3 text-slate-400 group-hover:text-rose-500 opacity-60 group-hover:opacity-100" />
                          </button>
                        ))
                      )}
                    </div>

                    {/* Sentence slot bottom rail line */}
                    <div className="w-full border-t border-dashed border-slate-300 mt-2 pt-1 flex justify-between items-center text-[11px] font-bold text-slate-400">
                      <span>خط چیدمان جمله</span>
                      {sentenceOrderTokens.length > 0 && !isAnswerSubmitted && (
                        <button
                          onClick={() => {
                            playDuoSound('click');
                            setSentenceOrderTokens([]);
                          }}
                          className="text-rose-500 hover:text-rose-700 font-black cursor-pointer flex items-center gap-1 text-[11px]"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>پاک‌کردن همه</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Word Bank Cards below */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-2.5 px-1">
                      <span>بانک کلمات:</span>
                      <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">
                        {sentenceOrderTokens.length} از {currentQ.sentenceTokens.length} کلمه انتخاب شد
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2.5 justify-center">
                      {currentQ.sentenceTokens.map((token, i) => {
                        const isUsed = sentenceOrderTokens.includes(token);
                        return isUsed ? (
                          <div
                            key={i}
                            className="px-4 py-2.5 rounded-xl border-2 border-dashed border-slate-200 bg-slate-100 text-transparent font-black text-xs sm:text-sm select-none opacity-40 min-w-[65px] text-center"
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
                                evaluateAnswer(correct);
                              }
                            }}
                            className="bg-white border-2 border-b-4 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30 text-slate-800 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black shadow-2xs active:translate-y-1 transition-all cursor-pointer"
                          >
                            {token}
                          </button>
                        );
                      })}
                    </div>

                    {!isAnswerSubmitted && sentenceOrderTokens.length > 0 && (
                      <button
                        onClick={handleCheckSentenceOrder}
                        className="duo-btn-green w-full py-3.5 rounded-2xl text-sm font-black mt-4 cursor-pointer shadow-md flex items-center justify-center gap-2"
                      >
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>بررسی و ثبت جمله</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ============================================================== */
            /* STAGE VICTORY SCREEN (Celebratory High-Fidelity)               */
            /* ============================================================== */
            <div className="flex flex-col items-center justify-center text-center py-6 animate-scaleUp relative overflow-hidden">
              {/* Rotating celebratory rays */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-15">
                <div className="w-96 h-96 rounded-full bg-gradient-to-tr from-amber-400 to-emerald-400 animate-ray-rotate blur-2xl" />
              </div>

              <div className="relative z-10 flex flex-col items-center">
                <div className="relative mb-2">
                  <DuoMascot mood="streak" size={105} animate={false} />
                  <div className="absolute -top-2 -right-2 p-2 rounded-full bg-amber-400 text-amber-950 shadow-md border-2 border-white animate-bounce">
                    <Trophy className="w-5 h-5 fill-current" />
                  </div>
                </div>

                <span className="text-xs font-black uppercase text-[#58CC02] bg-emerald-50 px-3.5 py-1 rounded-full border border-emerald-200">
                  مرحله {stage.stageNumber} فتح شد! 🎉
                </span>

                <h2 className="text-2xl font-black text-slate-800 mt-2">
                  فوق‌العاده بود! تبریک!
                </h2>

                <p className="text-xs sm:text-sm font-bold text-slate-500 mt-1 max-w-sm">
                  مفاهیم این مرحله را فرا گرفتی و مرحله بعدی در نقشه مسیر زنجیره‌ای آزاد شد.
                </p>

                {/* Stars Earned */}
                <div className="flex flex-col items-center gap-1.5 my-4">
                  <div className="flex items-center gap-2.5">
                    {[1, 2, 3].map((starIdx) => {
                      const earned = currentStars >= starIdx;
                      return (
                        <Star
                          key={starIdx}
                          className={`w-9 h-9 transition-all animate-star-bounce ${
                            earned
                              ? 'fill-amber-400 text-amber-500 drop-shadow-md scale-110'
                              : 'fill-slate-200 text-slate-300 scale-90 opacity-40'
                          }`}
                          style={{ animationDelay: `${starIdx * 150}ms` }}
                        />
                      );
                    })}
                  </div>
                  <span className="text-xs font-black text-amber-700 bg-amber-50 px-3.5 py-0.5 rounded-full border border-amber-200 mt-1">
                    کسب {currentStars} از ۳ ستاره
                  </span>
                </div>

                {/* Score & XP badges */}
                <div className="flex items-center gap-3 my-2 text-xs font-black">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 shadow-2xs">
                    <Zap className="w-4 h-4 fill-amber-500 text-amber-500" />
                    <span>+۲۵ XP امتیاز</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 shadow-2xs">
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>
                      دقت: {Math.round(((stage.questions.length - wrongCount) / stage.questions.length) * 100)}٪
                    </span>
                  </div>
                </div>

              {/* Action Buttons: Direct Return to Path Map (User Request!) */}
              <div className="w-full flex flex-col sm:flex-row gap-2.5 mt-2">
                <button
                  onClick={() => {
                    playDuoSound('click');
                    onClose(); // Returns straight to learning path screen
                  }}
                  className="duo-btn-green flex-1 py-3.5 rounded-2xl text-sm font-black flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <MapPin className="w-4 h-4" />
                  <span>بازگشت به صفحه مسیر یادگیری 🗺️</span>
                </button>

                {onStartNextStage && stage.stageNumber < 100 && (
                  <button
                    onClick={() => {
                      playDuoSound('click');
                      onStartNextStage(stage.stageNumber + 1);
                    }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3.5 rounded-2xl text-xs font-black cursor-pointer border-2 border-slate-200 flex items-center justify-center gap-1.5"
                  >
                    <span>شروع مرحله {stage.stageNumber + 1}</span>
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        </div>

        {/* ================================================================ */}
        {/* BOTTOM FEEDBACK BAR (Instant after user choice!)                */}
        {/* ================================================================ */}
        {!isStageFinished && isAnswerSubmitted && (
          <div
            className={`p-4 sm:p-5 border-t-2 transition-all animate-fadeIn shrink-0 ${
              isCurrentCorrect
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-rose-50 border-rose-300 text-rose-950'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Feedback text */}
              <div className="flex items-start gap-3 text-right flex-1">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    isCurrentCorrect ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                  }`}
                >
                  {isCurrentCorrect ? (
                    <Check className="w-5 h-5 stroke-[3]" />
                  ) : (
                    <X className="w-5 h-5 stroke-[3]" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-black">
                      {isCurrentCorrect ? 'آفرین! کاملاً درسته 🎉' : 'پاسخ نادرست ثبت شد! 💡'}
                    </h4>
                    {!isCurrentCorrect && (
                      <span className="text-[10px] font-black bg-rose-200/90 text-rose-900 px-2.5 py-0.5 rounded-full border border-rose-300">
                        کسر ستاره (باقی‌مانده: {currentStars} از ۳ ⭐)
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold mt-1 opacity-90 leading-relaxed">
                    {currentQ.explanation}
                  </p>
                  {!isCurrentCorrect && (
                    <div className="mt-2 bg-rose-100/90 border border-rose-200 rounded-xl p-2 text-xs font-black text-rose-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>نکته کلیدی: {stage.keyTakeaway}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Button: ALWAYS Advance to next question (NO infinite retry!) */}
              <button
                onClick={handleContinue}
                className={`w-full sm:w-auto px-7 py-3 rounded-2xl text-sm font-black cursor-pointer transition-all flex items-center justify-center gap-2 ${
                  isCurrentCorrect ? 'duo-btn-green' : 'duo-btn-orange'
                }`}
              >
                <span>
                  {currentQIndex < stage.questions.length - 1
                    ? isCurrentCorrect
                      ? 'سوال بعدی ⚡ (Enter)'
                      : 'ثبت شد و سوال بعدی ➔ (Enter)'
                    : 'پایان مرحله و دریافت ستاره‌ها 🏆'}
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
