import React, { useState, useEffect, useMemo } from 'react';
import { Section, Chapter, Question, DifficultyLevel, UserProgress } from '../types/psychology';
import {
  Check,
  X,
  Heart,
  Zap,
  Sparkles,
  Trophy,
  RotateCcw,
  ArrowRight,
  Stethoscope,
  CheckCircle2,
  XCircle,
  Award,
  BookOpen,
} from 'lucide-react';
import { BadgeIcon } from './BadgeIcon';
import { EntranceExamSimulator } from './EntranceExamSimulator';
import { playDuoSound } from '../utils/duoAudio';
import { toPersianDigits } from '../utils/persianDigits';
import confetti from 'canvas-confetti';
import { SECTION_1_STAGES } from '../data/section1Stages';

export type QuizCenterSubMode = 'entrance_exam' | 'conceptual_practice';

interface QuizCenterViewProps {
  sections: Section[];
  selectedChapter?: Chapter | null;
  onClearSelectedChapter: () => void;
  onSelectChapter: (chapter: Chapter) => void;
  progress: UserProgress;
  onRecordQuizResult: (
    chapterId: string,
    questionId: string,
    isCorrect: boolean,
    userAnswer: any,
    timeSpentSeconds: number,
    difficulty: DifficultyLevel
  ) => void;
  onOpenBadges?: () => void;
  initialExamMode?: QuizCenterSubMode;
  initialAttemptIdToReview?: string | null;
  onExamSubmitted?: (xpEarned: number, attempt: any) => void;
}

export type QuizFilterType =
  | 'all'
  | 'match_pairs'
  | 'sentence_order'
  | 'true_false'
  | 'multiple_choice'
  | 'fill_blank'
  | 'case_study';

export function normalizeExerciseFilterType(rawType?: string | null): QuizFilterType {
  const cleaned = String(rawType || 'all').trim().toLowerCase();
  switch (cleaned) {
    case 'sentence_order':
    case 'sentence-order':
    case 'sentence-ordering':
    case 'sentence_ordering':
    case 'sentence-arrangement':
    case 'sentence_arrangement':
      return 'sentence_order';
    case 'match_pairs':
    case 'match-pairs':
    case 'matching_pairs':
    case 'matching-pairs':
    case 'matching':
      return 'match_pairs';
    case 'multiple_choice':
    case 'multiple-choice':
    case 'mcq':
      return 'multiple_choice';
    case 'case_study':
    case 'case-study':
    case 'case_based':
    case 'case-based':
    case 'clinical_case':
    case 'clinical-case':
      return 'case_study';
    case 'fill_blank':
    case 'fill-blank':
    case 'fill_in_the_blank':
    case 'fill-in-the-blank':
      return 'fill_blank';
    case 'true_false':
    case 'true-false':
      return 'true_false';
    case 'all':
    default:
      return 'all';
  }
}

export function isGenuineExerciseOfType(
  q: Question | null | undefined,
  targetType: Exclude<QuizFilterType, 'all'>
): boolean {
  if (!q || typeof q !== 'object') return false;
  const qType = normalizeExerciseFilterType(q.type);
  if (qType !== targetType) return false;

  switch (targetType) {
    case 'sentence_order':
      return (
        Array.isArray(q.sentenceTokens) &&
        q.sentenceTokens.length >= 2 &&
        Boolean(
          (typeof q.correctSentence === 'string' && q.correctSentence.trim()) ||
            (typeof q.correctAnswer === 'string' && q.correctAnswer.trim())
        )
      );
    case 'match_pairs':
      return (
        Array.isArray(q.matchPairs) &&
        q.matchPairs.length >= 2 &&
        q.matchPairs.every((p) => Boolean(p && p.id && p.left && p.right))
      );
    case 'multiple_choice':
      return (
        Array.isArray(q.options) &&
        q.options.length >= 2 &&
        typeof q.correctAnswer === 'number'
      );
    case 'case_study': {
      const diagOptions = q.options || q.caseScenario?.diagnosticOptions;
      return Boolean(q.caseScenario) && Array.isArray(diagOptions) && diagOptions.length >= 2;
    }
    case 'fill_blank':
      return (
        Boolean(q.blankContext || (typeof q.text === 'string' && q.text.includes('____'))) &&
        typeof q.correctAnswer === 'string' &&
        q.correctAnswer.trim().length > 0
      );
    case 'true_false':
      return typeof q.isTrue === 'boolean' || typeof q.correctAnswer === 'boolean';
    default:
      return false;
  }
}

export function filterQuestionsByExerciseType<T extends Question & { chapterId?: string }>(
  allQuestions: T[],
  rawFilterType: string,
  selectedChapterId?: string | null
): T[] {
  const normalizedFilter = normalizeExerciseFilterType(rawFilterType);
  const safeAll = Array.isArray(allQuestions) ? allQuestions : [];

  if (normalizedFilter === 'all') {
    if (selectedChapterId) {
      const chapterPool = safeAll.filter((q) => q.chapterId === selectedChapterId);
      if (chapterPool.length > 0) return chapterPool;
    }
    return safeAll;
  }

  // Strict type filtering: never fall back to an unrelated exercise type
  if (selectedChapterId) {
    const chapterFiltered = safeAll.filter(
      (q) => q.chapterId === selectedChapterId && isGenuineExerciseOfType(q, normalizedFilter)
    );
    if (chapterFiltered.length > 0) {
      return chapterFiltered;
    }
  }

  return safeAll.filter((q) => isGenuineExerciseOfType(q, normalizedFilter));
}

export const QuizCenterView: React.FC<QuizCenterViewProps> = ({
  sections,
  selectedChapter,
  onClearSelectedChapter,
  onSelectChapter,
  progress,
  onRecordQuizResult,
  onOpenBadges,
  initialExamMode,
  initialAttemptIdToReview,
  onExamSubmitted,
}) => {
  // Primary mode switcher: Entrance Exam Simulator (Phase 10B) vs Conceptual Practice
  const [examMode, setExamMode] = useState<QuizCenterSubMode>(() => {
    if (initialAttemptIdToReview) return 'entrance_exam';
    if (initialExamMode) return initialExamMode;
    return selectedChapter ? 'conceptual_practice' : 'entrance_exam';
  });

  useEffect(() => {
    if (initialAttemptIdToReview) {
      setExamMode('entrance_exam');
    } else if (initialExamMode) {
      setExamMode(initialExamMode);
    }
  }, [initialExamMode, initialAttemptIdToReview]);

  // Quiz filter
  const [filterType, setFilterType] = useState<QuizFilterType>('all');

  // Active questions deck
  const [questionsDeck, setQuestionsDeck] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);

  // General quiz states
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState<boolean>(false);
  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [isQuizCompleted, setIsQuizCompleted] = useState<boolean>(false);
  const [heartsCount, setHeartsCount] = useState<number>(5);
  const [answersHistory, setAnswersHistory] = useState<boolean[]>([]);
  const [quizScore, setQuizScore] = useState<{ correct: number; total: number; points: number }>({
    correct: 0,
    total: 0,
    points: 0,
  });

  // State: Multiple Choice
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);

  // State: Fill in Blank
  const [fillBlankInput, setFillBlankInput] = useState<string>('');

  // State: Case Study
  const [caseSelectedOption, setCaseSelectedOption] = useState<number | null>(null);

  // State: True / False
  const [trueFalseAnswer, setTrueFalseAnswer] = useState<boolean | null>(null);

  // State: Sentence Order
  const [selectedTokens, setSelectedTokens] = useState<string[]>([]);

  // State: Match Pairs
  const [selectedPairLeft, setSelectedPairLeft] = useState<string | null>(null);
  const [selectedPairRight, setSelectedPairRight] = useState<string | null>(null);
  const [matchedPairIds, setMatchedPairIds] = useState<string[]>([]);
  const [mismatchError, setMismatchError] = useState<boolean>(false);

  // Collect all questions: merge curriculum chapter questions with all 1,000 stage questions
  const allChapters = useMemo(() => sections.flatMap((s) => s.chapters), [sections]);

  const allQuestions = useMemo(() => {
    const chapterQuestions = allChapters.flatMap((c) =>
      c.questions.map((q) => ({ ...q, chapterId: c.id }))
    );

    const stageQuestions = SECTION_1_STAGES.flatMap((st) =>
      st.questions.map((q) => ({
        ...q,
        chapterId: st.chapterId,
      }))
    );

    const seen = new Set<string>();
    const combined: (Question & { chapterId: string })[] = [];
    for (const q of [...chapterQuestions, ...stageQuestions]) {
      if (!seen.has(q.id)) {
        seen.add(q.id);
        combined.push(q);
      }
    }
    return combined;
  }, [allChapters]);

  // Load questions based on filter & selectedChapter
  useEffect(() => {
    const pool = filterQuestionsByExerciseType(
      allQuestions,
      filterType,
      selectedChapter?.id ?? null
    );

    const shuffled = [...pool].sort(() => 0.5 - Math.random()).slice(0, 5);
    setQuestionsDeck(shuffled);
    setCurrentQuestionIndex(0);
    resetAllInputStates();
    setIsQuizCompleted(false);
    setAnswersHistory([]);
    setHeartsCount(5);
    setQuizScore({ correct: 0, total: shuffled.length, points: 0 });
    setTimerSeconds(0);
  }, [filterType, selectedChapter, allQuestions]);

  // Timer tick
  useEffect(() => {
    if (isQuizCompleted || isAnswerSubmitted) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isQuizCompleted, isAnswerSubmitted]);

  const resetAllInputStates = () => {
    setSelectedOptionIndex(null);
    setFillBlankInput('');
    setCaseSelectedOption(null);
    setTrueFalseAnswer(null);
    setSelectedTokens([]);
    setSelectedPairLeft(null);
    setSelectedPairRight(null);
    setMatchedPairIds([]);
    setMismatchError(false);
    setIsAnswerSubmitted(false);
  };

  const currentQuestion = questionsDeck[currentQuestionIndex];

  const currentChapter = currentQuestion
    ? allChapters.find((c) => c.questions.some((q) => q.id === currentQuestion.id))
    : null;

  // Shuffled items for match pairs
  const shuffledPairs = useMemo(() => {
    if (!currentQuestion || currentQuestion.type !== 'match_pairs' || !currentQuestion.matchPairs) {
      return { leftItems: [], rightItems: [] };
    }
    const leftItems = [...currentQuestion.matchPairs]
      .map((p) => ({ id: p.id, text: p.left }))
      .sort(() => 0.5 - Math.random());
    const rightItems = [...currentQuestion.matchPairs]
      .map((p) => ({ id: p.id, text: p.right }))
      .sort(() => 0.5 - Math.random());
    return { leftItems, rightItems };
  }, [currentQuestion?.id]);

  // Match pairs tap handler
  const handleTapPairLeft = (id: string) => {
    if (matchedPairIds.includes(id) || isAnswerSubmitted) return;
    playDuoSound('click');
    setSelectedPairLeft(id);

    if (selectedPairRight) {
      checkPairMatch(id, selectedPairRight);
    }
  };

  const handleTapPairRight = (id: string) => {
    if (matchedPairIds.includes(id) || isAnswerSubmitted) return;
    playDuoSound('click');
    setSelectedPairRight(id);

    if (selectedPairLeft) {
      checkPairMatch(selectedPairLeft, id);
    }
  };

  const checkPairMatch = (leftId: string, rightId: string) => {
    if (leftId === rightId) {
      playDuoSound('pair_match');
      setMatchedPairIds((prev) => [...prev, leftId]);
      setSelectedPairLeft(null);
      setSelectedPairRight(null);
    } else {
      playDuoSound('pair_error');
      setMismatchError(true);
      setTimeout(() => {
        setSelectedPairLeft(null);
        setSelectedPairRight(null);
        setMismatchError(false);
      }, 700);
    }
  };

  // Check correctness of currently selected answer
  const checkIsCorrect = (): boolean => {
    if (!currentQuestion) return false;

    if (currentQuestion.type === 'multiple_choice') {
      return selectedOptionIndex === currentQuestion.correctAnswer;
    }

    if (currentQuestion.type === 'fill_blank') {
      const normalize = (str: string) =>
        String(str || '')
          .replace(/[\u200C\u200B\s]/g, '')
          .replace(/[یي]/g, 'ی')
          .replace(/[کك]/g, 'ک')
          .replace(/[ةه]/g, 'ه')
          .trim()
          .toLowerCase();

      const correctWord = normalize(String(currentQuestion.correctAnswer));
      const userInput = normalize(fillBlankInput);
      return userInput === correctWord || userInput.includes(correctWord) || correctWord.includes(userInput);
    }

    if (currentQuestion.type === 'case_study') {
      return caseSelectedOption === currentQuestion.correctAnswer;
    }

    if (currentQuestion.type === 'true_false') {
      const expected =
        typeof currentQuestion.isTrue === 'boolean'
          ? currentQuestion.isTrue
          : typeof currentQuestion.correctAnswer === 'boolean'
          ? currentQuestion.correctAnswer
          : currentQuestion.correctAnswer === 0 || currentQuestion.correctAnswer === '0'
          ? true
          : currentQuestion.correctAnswer === 1 || currentQuestion.correctAnswer === '1'
          ? false
          : String(currentQuestion.correctAnswer).toLowerCase() === 'true';
      return trueFalseAnswer === expected;
    }

    if (currentQuestion.type === 'sentence_order') {
      const assembled = selectedTokens.join(' ').trim();
      const target = (currentQuestion.correctSentence || '').trim();
      return assembled === target;
    }

    if (currentQuestion.type === 'match_pairs') {
      const totalPairs = currentQuestion.matchPairs?.length || 0;
      return matchedPairIds.length === totalPairs;
    }

    return false;
  };

  const hasSelectedAnswer = (): boolean => {
    if (!currentQuestion) return false;
    if (currentQuestion.type === 'multiple_choice') return selectedOptionIndex !== null;
    if (currentQuestion.type === 'fill_blank') return fillBlankInput.trim().length > 0;
    if (currentQuestion.type === 'case_study') return caseSelectedOption !== null;
    if (currentQuestion.type === 'true_false') return trueFalseAnswer !== null;
    if (currentQuestion.type === 'sentence_order') return selectedTokens.length > 0;
    if (currentQuestion.type === 'match_pairs') {
      const totalPairs = currentQuestion.matchPairs?.length || 0;
      return matchedPairIds.length === totalPairs;
    }
    return false;
  };

  const handleSubmitAnswer = () => {
    if (isAnswerSubmitted || !hasSelectedAnswer()) return;

    const isCorrect = checkIsCorrect();
    setIsAnswerSubmitted(true);
    setAnswersHistory((prev) => [...prev, isCorrect]);

    if (isCorrect) {
      playDuoSound('correct');
      setQuizScore((prev) => ({
        ...prev,
        correct: prev.correct + 1,
        points: prev.points + currentQuestion.points,
      }));
    } else {
      playDuoSound('wrong');
      setHeartsCount((prev) => Math.max(0, prev - 1));
    }

    let userAnswer: any = null;
    if (currentQuestion.type === 'multiple_choice') userAnswer = selectedOptionIndex;
    if (currentQuestion.type === 'fill_blank') userAnswer = fillBlankInput;
    if (currentQuestion.type === 'case_study') userAnswer = caseSelectedOption;
    if (currentQuestion.type === 'true_false') userAnswer = trueFalseAnswer;
    if (currentQuestion.type === 'sentence_order') userAnswer = selectedTokens.join(' ');
    if (currentQuestion.type === 'match_pairs') userAnswer = matchedPairIds;

    const targetChapterId =
      currentChapter?.id || (currentQuestion as any)?.chapterId || 'ch-1';

    onRecordQuizResult(
      targetChapterId,
      currentQuestion.id,
      isCorrect,
      userAnswer,
      timerSeconds,
      currentQuestion.difficulty
    );
  };

  const handleNextQuestion = () => {
    playDuoSound('click');
    if (currentQuestionIndex < questionsDeck.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      resetAllInputStates();
      setTimerSeconds(0);
    } else {
      setIsQuizCompleted(true);
      playDuoSound('complete');
      confetti({
        particleCount: 80,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#5B46E8', '#16A394', '#F59E0B', '#D9485F'],
      });
    }
  };

  // Keyboard shortcut listener (only active in conceptual_practice mode)
  useEffect(() => {
    if (examMode !== 'conceptual_practice') return;
    const handleKey = (e: KeyboardEvent) => {
      if (!currentQuestion) return;

      if (isAnswerSubmitted) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleNextQuestion();
        }
        return;
      }

      if (currentQuestion.type === 'multiple_choice' && currentQuestion.options) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= currentQuestion.options.length) {
          playDuoSound('click');
          setSelectedOptionIndex(num - 1);
        }
      } else if (currentQuestion.type === 'case_study') {
        const opts = currentQuestion.caseScenario?.diagnosticOptions || currentQuestion.options;
        const num = parseInt(e.key, 10);
        if (opts && num >= 1 && num <= opts.length) {
          playDuoSound('click');
          setCaseSelectedOption(num - 1);
        }
      } else if (currentQuestion.type === 'true_false') {
        if (e.key === '1') {
          playDuoSound('click');
          setTrueFalseAnswer(true);
        } else if (e.key === '2') {
          playDuoSound('click');
          setTrueFalseAnswer(false);
        }
      }

      if (e.key === 'Enter') {
        if (hasSelectedAnswer()) {
          handleSubmitAnswer();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [examMode, isAnswerSubmitted, currentQuestion, selectedOptionIndex, caseSelectedOption, trueFalseAnswer, hasSelectedAnswer]);

  // Fill in blank suggestions
  const fillBlankSuggestions = useMemo(() => {
    if (!currentQuestion) return [];
    if (currentQuestion.options && currentQuestion.options.length > 0) {
      return currentQuestion.options;
    }
    const correct = String(currentQuestion.correctAnswer);
    const pool = [
      correct,
      'فرآیندهای روانی',
      'ناهشیار',
      'سازمان‌دهی ادراکی',
      'تقویت مثبت',
      'شرطی‌سازی کلاسیک',
      'خودشکوفایی',
    ];
    return Array.from(new Set(pool)).slice(0, 4).sort(() => 0.5 - Math.random());
  }, [currentQuestion?.id, currentQuestion?.correctAnswer, currentQuestion?.options]);

  const modeSwitcherBar = (
    <div className="max-w-5xl mx-auto mb-5 bg-white border-2 border-[#24243B] rounded-2xl p-2 shadow-[0_4px_0_0_#24243B] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
      <div className="grid grid-cols-2 gap-2 flex-1">
        <button
          type="button"
          onClick={() => {
            playDuoSound('click');
            setExamMode('entrance_exam');
          }}
          className={`min-h-[46px] px-3.5 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
            examMode === 'entrance_exam'
              ? 'bg-[#5842BC] text-white border-2 border-[#24243B] shadow-[0_3px_0_0_#24243B]'
              : 'bg-[#F7F5F0] text-[#55556A] hover:bg-[#EAE4FF] border-2 border-transparent'
          }`}
        >
          <Trophy className="w-4 h-4 shrink-0" />
          <span>شبیه‌ساز آزمون و کنکور زمان‌دار</span>
        </button>

        <button
          type="button"
          onClick={() => {
            playDuoSound('click');
            setExamMode('conceptual_practice');
          }}
          className={`min-h-[46px] px-3.5 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
            examMode === 'conceptual_practice'
              ? 'bg-[#279B7A] text-white border-2 border-[#24243B] shadow-[0_3px_0_0_#24243B]'
              : 'bg-[#F7F5F0] text-[#55556A] hover:bg-[#D8F3EC] border-2 border-transparent'
          }`}
        >
          <Zap className="w-4 h-4 shrink-0" />
          <span>تمرین مفهومی و کوئیز تعاملی</span>
        </button>
      </div>
    </div>
  );

  // ==========================================================
  // 0. PHASE 10B: ENTRANCE EXAM SIMULATOR MODE
  // ==========================================================
  if (examMode === 'entrance_exam') {
    return (
      <div className="max-w-5xl mx-auto">
        {modeSwitcherBar}
        <EntranceExamSimulator
          sections={sections}
          onSelectChapter={onSelectChapter}
          onExamSubmitted={onExamSubmitted}
          initialAttemptIdToReview={initialAttemptIdToReview}
        />
      </div>
    );
  }

  // ==========================================================
  // 1. QUIZ COMPLETION SUMMARY
  // ==========================================================
  if (isQuizCompleted) {
    const accuracy = Math.round((quizScore.correct / (questionsDeck.length || 1)) * 100);
    return (
      <div className="max-w-xl mx-auto py-8 px-4 flex flex-col items-center text-center select-none animate-fadeIn">
        {modeSwitcherBar}
        <div className="w-16 h-16 rounded-2xl bg-[#EAE4FF] border border-[#5B46E8]/30 flex items-center justify-center text-[#5B46E8]">
          <Trophy className="w-8 h-8" />
        </div>

        <h2 className="text-2xl sm:text-3xl font-black text-[#24243B] mt-4">
          آزمون تمرینی به پایان رسید
        </h2>
        <p className="text-xs sm:text-sm font-medium text-[#69697E] mt-1">
          نتایج عملکرد شما در این جلسه تمرینی ثبت شد.
        </p>

        {/* Recap Cards */}
        <div className="grid grid-cols-3 gap-3 w-full my-6">
          <div className="bg-white border border-[#E5E1EB] rounded-2xl p-4 flex flex-col items-center">
            <span className="text-[11px] font-bold text-[#69697E]">پاداش تمرین</span>
            <div className="flex items-center gap-1 my-1.5">
              <Zap className="w-4 h-4 text-[#D97706] fill-[#F59E0B]" />
              <span className="text-xl font-black text-[#24243B]">
                +{toPersianDigits(quizScore.points)}
              </span>
            </div>
            <span className="text-[10px] font-bold text-[#69697E]">امتیاز XP</span>
          </div>

          <div className="bg-white border border-[#E5E1EB] rounded-2xl p-4 flex flex-col items-center">
            <span className="text-[11px] font-bold text-[#69697E]">دقت پاسخ‌ها</span>
            <span className="text-xl font-black text-[#169E6C] my-1.5">{toPersianDigits(accuracy)}٪</span>
            <span className="text-[10px] font-bold text-[#69697E]">
              {toPersianDigits(quizScore.correct)} از {toPersianDigits(questionsDeck.length)} صحیح
            </span>
          </div>

          <div className="bg-white border border-[#E5E1EB] rounded-2xl p-4 flex flex-col items-center">
            <span className="text-[11px] font-bold text-[#69697E]">پیوستگی</span>
            <div className="flex items-center gap-1 my-1.5">
              <Sparkles className="w-4 h-4 text-[#D9485F]" />
              <span className="text-xl font-black text-[#24243B]">
                {toPersianDigits(progress.streakDays)}
              </span>
            </div>
            <span className="text-[10px] font-bold text-[#69697E]">روز متوالی</span>
          </div>
        </div>

        {/* Quiz Milestone Badges Showcase */}
        <div className="w-full bg-[#FFF0C8]/55 border border-[#F59E0B]/35 rounded-2xl p-4 mb-6 text-right flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <BadgeIcon
                type={accuracy >= 80 ? 'sharpshooter' : 'first_quiz'}
                isUnlocked={quizScore.correct > 0}
                size={50}
                showStars={false}
              />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-[#92400E] bg-[#FFF0C8] px-2.5 py-0.5 rounded-md border border-[#F59E0B]/30 inline-block">
                نشان‌های پیشرفت علمی
              </span>
              <h4 className="text-sm font-black text-[#24243B] mt-1">
                {accuracy >= 80
                  ? 'عملکرد دقیق شما در مسیر نشان دقت بالا ثبت شد'
                  : 'با ادامه تمرین‌های هدفمند، نشان‌های تخصصی بعدی فعال می‌شوند'}
              </h4>
              <p className="text-[11px] font-medium text-[#69697E] mt-0.5">
                تمامی پاسخ‌های شما در تحلیل نقاط قوت و نیاز به مرور ذخیره شد.
              </p>
            </div>
          </div>

          {onOpenBadges && (
            <button
              onClick={onOpenBadges}
              className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-[#F7F5F0] border border-[#E5E1EB] text-xs font-extrabold text-[#24243B] shrink-0 cursor-pointer flex items-center gap-1.5 transition-colors min-h-[44px]"
            >
              <Award className="w-4 h-4 text-[#D97706]" />
              <span>مشاهده نشان‌ها</span>
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            onClick={() => {
              playDuoSound('click');
              setIsQuizCompleted(false);
              setCurrentQuestionIndex(0);
              resetAllInputStates();
              setAnswersHistory([]);
              setHeartsCount(5);
              setTimerSeconds(0);
              setQuestionsDeck((prev) => {
                const nextDeck = [...prev].sort(() => 0.5 - Math.random());
                setQuizScore({ correct: 0, total: nextDeck.length, points: 0 });
                return nextDeck;
              });
            }}
            className="flex-1 py-3.5 rounded-xl bg-white hover:bg-[#F7F5F0] border border-[#E5E1EB] text-[#24243B] text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-colors min-h-[48px]"
          >
            <RotateCcw className="w-4 h-4 text-[#69697E]" />
            <span>تمرین مجدد این مجموعه</span>
          </button>

          <button
            onClick={() => {
              playDuoSound('click');
              if (selectedChapter) onSelectChapter(selectedChapter);
              else onClearSelectedChapter();
            }}
            className="flex-1 py-3.5 rounded-xl bg-[#5B46E8] hover:bg-[#4935D4] text-white text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-colors min-h-[48px]"
          >
            <ArrowRight className="w-4 h-4" />
            <span>بازگشت به برنامه درسی</span>
          </button>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="max-w-2xl mx-auto pb-24 select-none">
        {modeSwitcherBar}
        <div className="p-8 sm:p-10 text-center bg-white rounded-2xl border border-[#E5E1EB] space-y-4">
          <p className="text-[#24243B] text-sm font-black">
            هیچ تمرینی با قالب انتخاب‌شده یافت نشد.
          </p>
          <p className="text-[#69697E] text-xs font-bold">
            می‌توانید قالب دیگری را انتخاب کنید یا به نمای همه قالب‌های تمرینی بازگردید.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                playDuoSound('click');
                setFilterType('all');
              }}
              className="px-4 py-2.5 rounded-xl bg-[#5B46E8] hover:bg-[#4935D4] text-white text-xs font-extrabold cursor-pointer transition-colors"
            >
              نمایش همه قالب‌ها
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================
  // 2. ACTIVE QUIZ ARENA
  // ==========================================================
  const progressPercent = Math.round(
    ((currentQuestionIndex + (isAnswerSubmitted ? 1 : 0)) / questionsDeck.length) * 100
  );
  const isCorrect = isAnswerSubmitted ? checkIsCorrect() : false;

  return (
    <div className="max-w-2xl mx-auto flex flex-col min-h-[82vh] justify-between pb-40 md:pb-32 select-none">
      <div>
        {modeSwitcherBar}
        {/* Top Quiz Header Bar */}
        <div className="bg-white border border-[#E5E1EB] rounded-2xl px-3.5 sm:px-5 py-3 flex items-center gap-3">
          <button
            onClick={() => {
              playDuoSound('click');
              onClearSelectedChapter();
            }}
            className="p-2 text-[#69697E] hover:text-[#24243B] hover:bg-[#F7F5F0] rounded-xl cursor-pointer transition-colors flex items-center justify-center gap-1 min-w-[44px] min-h-[44px]"
            title="خروج از آزمون و بازگشت به داشبورد"
            aria-label="خروج از آزمون"
          >
            <X className="w-5 h-5" />
            <span className="text-xs font-extrabold text-[#69697E] sm:hidden">خروج</span>
          </button>

          {/* Question Counter & Progress Bar */}
          <div className="flex-1 flex flex-col gap-1 min-w-0">
            <div className="flex items-center justify-between text-[11px] font-extrabold text-[#69697E] gap-2">
              <span className="text-[#5B46E8] truncate">
                {selectedChapter ? selectedChapter.title : 'بانک جامع سوالات روان‌شناسی'}
              </span>
              <span className="text-[#24243B] shrink-0">
                سوال {toPersianDigits(currentQuestionIndex + 1)} از {toPersianDigits(questionsDeck.length)}
              </span>
            </div>
            <div className="w-full h-2 bg-[#E5E1EB] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#5B46E8] rounded-full transition-all duration-300"
                style={{ width: `${Math.max(8, progressPercent)}%` }}
              />
            </div>
          </div>

          {/* Hearts counter */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#D9485F]/25 bg-[#FFE4E8]/65 min-h-[40px] shrink-0">
            <Heart className="w-4 h-4 text-[#D9485F] fill-[#D9485F]" />
            <span className="text-xs font-extrabold text-[#9F1239]">
              {toPersianDigits(heartsCount)}
            </span>
          </div>
        </div>

        {/* Direct Switch Banner to Entrance Exam Simulator */}
        <div className="mt-3 p-3.5 rounded-2xl bg-[#EAE4FF]/70 border border-[#5842BC]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-right">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#5842BC] text-white flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-extrabold text-[#24243B] block">
                بخش فعال: تمرین مفهومی و فلش‌کوئیز ۶گانه
              </span>
              <p className="text-[11px] font-medium text-[#55556A] mt-0.5">
                برای شرکت در آزمون جامع زمان‌دار با نمره منفی و کارنامه کنکور، وارد شبیه‌ساز آزمون شوید.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExamMode('entrance_exam')}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#5842BC] text-white text-xs font-black shrink-0 cursor-pointer"
          >
            ورود به شبیه‌ساز کنکور
          </button>
        </div>

        {/* Question Format Filter Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-3 px-0.5 no-scrollbar">
          {[
            { id: 'all' as const, label: 'همه قالب‌ها' },
            { id: 'multiple_choice' as const, label: 'چهارگزینه‌ای' },
            { id: 'case_study' as const, label: 'سناریوی بالینی' },
            { id: 'true_false' as const, label: 'درست / نادرست' },
            { id: 'match_pairs' as const, label: 'تطبیق مفاهیم' },
            { id: 'sentence_order' as const, label: 'چیدمان عبارت' },
            { id: 'fill_blank' as const, label: 'تکمیل عبارت' },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => {
                playDuoSound('click');
                setFilterType(mode.id);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-colors cursor-pointer border min-h-[44px] ${
                filterType === mode.id
                  ? 'bg-[#EAE4FF] text-[#5B46E8] border-[#5B46E8]/40'
                  : 'bg-white text-[#69697E] border-[#E5E1EB] hover:text-[#24243B]'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Main Question Card */}
        <div className="mt-2 flex flex-col gap-4">
          <div className="bg-white border border-[#E5E1EB] rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="text-[11px] font-extrabold text-[#0F766E] bg-[#DDF7F2] px-2.5 py-0.5 rounded-md">
                {currentQuestion.type === 'match_pairs'
                  ? 'تطبیق مفاهیم مرتبط'
                  : currentQuestion.type === 'sentence_order'
                  ? 'چیدمان عبارت علمی'
                  : currentQuestion.type === 'true_false'
                  ? 'بررسی درستی گزاره'
                  : currentQuestion.type === 'multiple_choice'
                  ? 'سوال چهارگزینه‌ای'
                  : currentQuestion.type === 'fill_blank'
                  ? 'تکمیل جای خالی'
                  : 'تحلیل سناریوی بالینی'}
              </span>
              {currentChapter && (
                <span className="text-[11px] font-medium text-[#69697E] truncate flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5 text-[#5B46E8]" />
                  {currentChapter.title}
                </span>
              )}
            </div>
            <h3 className="text-base sm:text-lg font-black text-[#24243B] leading-relaxed">
              {currentQuestion.text}
            </h3>
          </div>

          {/* ====================================================== */}
          {/* FORMAT 1: MATCH PAIRS                                  */}
          {/* ====================================================== */}
          {currentQuestion.type === 'match_pairs' && currentQuestion.matchPairs && (
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {/* Left Column Items */}
              <div className="flex flex-col gap-2.5">
                <span className="text-[11px] font-bold text-[#69697E] px-1">دانشمندان و مفاهیم:</span>
                {shuffledPairs.leftItems.map((item) => {
                  const isMatched = matchedPairIds.includes(item.id);
                  const isSelected = selectedPairLeft === item.id;

                  return (
                    <button
                      key={item.id}
                      disabled={isMatched || isAnswerSubmitted}
                      onClick={() => handleTapPairLeft(item.id)}
                      className={`p-3.5 rounded-xl border font-bold text-xs text-right transition-all cursor-pointer select-none min-h-[48px] break-words ${
                        isMatched
                          ? 'bg-[#DDF7F2]/65 border-[#169E6C]/40 text-[#064E3B] opacity-60 cursor-default'
                          : isSelected
                          ? mismatchError
                            ? 'bg-[#FFE4E8] border-2 border-[#E5484D] text-[#881337] animate-shake'
                            : 'bg-[#EAE4FF] border-2 border-[#5B46E8] text-[#24243B]'
                          : 'bg-white border-[#E5E1EB] hover:border-[#5B46E8]/40 text-[#24243B]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="flex-1">{item.text}</span>
                        {isMatched && <Check className="w-4 h-4 text-[#169E6C] stroke-[2.75] shrink-0" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right Column Items */}
              <div className="flex flex-col gap-2.5">
                <span className="text-[11px] font-bold text-[#69697E] px-1">مکاتب و دستاوردها:</span>
                {shuffledPairs.rightItems.map((item) => {
                  const isMatched = matchedPairIds.includes(item.id);
                  const isSelected = selectedPairRight === item.id;

                  return (
                    <button
                      key={item.id}
                      disabled={isMatched || isAnswerSubmitted}
                      onClick={() => handleTapPairRight(item.id)}
                      className={`p-3.5 rounded-xl border font-bold text-xs text-right transition-all cursor-pointer select-none min-h-[48px] break-words ${
                        isMatched
                          ? 'bg-[#DDF7F2]/65 border-[#169E6C]/40 text-[#064E3B] opacity-60 cursor-default'
                          : isSelected
                          ? mismatchError
                            ? 'bg-[#FFE4E8] border-2 border-[#E5484D] text-[#881337] animate-shake'
                            : 'bg-[#EAE4FF] border-2 border-[#5B46E8] text-[#24243B]'
                          : 'bg-white border-[#E5E1EB] hover:border-[#5B46E8]/40 text-[#24243B]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="flex-1">{item.text}</span>
                        {isMatched && <Check className="w-4 h-4 text-[#169E6C] stroke-[2.75] shrink-0" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ====================================================== */}
          {/* FORMAT 2: SENTENCE ORDER                               */}
          {/* ====================================================== */}
          {currentQuestion.type === 'sentence_order' && currentQuestion.sentenceTokens && (
            <div className="flex flex-col gap-4">
              <div className="min-h-[76px] bg-white border border-dashed border-[#CFC9DA] rounded-2xl p-4 flex flex-wrap items-center gap-2">
                {selectedTokens.length === 0 ? (
                  <span className="text-xs font-medium text-[#69697E] mr-1">
                    برای مرتب‌سازی عبارت علمی، روی کلمات پایین کلیک کنید...
                  </span>
                ) : (
                  selectedTokens.map((token, idx) => (
                    <button
                      key={idx}
                      disabled={isAnswerSubmitted}
                      onClick={() => {
                        playDuoSound('pop');
                        setSelectedTokens((prev) => prev.filter((_, i) => i !== idx));
                      }}
                      className="px-3.5 py-2 rounded-xl bg-[#EAE4FF] border border-[#5B46E8]/35 text-[#24243B] text-xs font-extrabold cursor-pointer min-h-[44px]"
                      title="حذف کلمه"
                    >
                      {token}
                    </button>
                  ))
                )}
              </div>

              {!isAnswerSubmitted && (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  {currentQuestion.sentenceTokens.map((token, idx) => {
                    const isAlreadyPlaced = selectedTokens.includes(token);
                    return (
                      <button
                        key={idx}
                        disabled={isAlreadyPlaced}
                        onClick={() => {
                          playDuoSound('pop');
                          setSelectedTokens((prev) => [...prev, token]);
                        }}
                        className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer border min-h-[44px] ${
                          isAlreadyPlaced
                            ? 'bg-[#F7F5F0] border-[#E5E1EB] text-[#69697E] opacity-40 cursor-default'
                            : 'bg-white border-[#E5E1EB] hover:border-[#5B46E8] text-[#24243B]'
                        }`}
                      >
                        {token}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ====================================================== */}
          {/* FORMAT 3: TRUE / FALSE                                 */}
          {/* ====================================================== */}
          {currentQuestion.type === 'true_false' && (() => {
            const isExpectedTrue =
              typeof currentQuestion.isTrue === 'boolean'
                ? currentQuestion.isTrue
                : typeof currentQuestion.correctAnswer === 'boolean'
                ? currentQuestion.correctAnswer
                : String(currentQuestion.correctAnswer).toLowerCase() === 'true';

            return (
              <div className="grid grid-cols-2 gap-3.5">
                <button
                  disabled={isAnswerSubmitted}
                  onClick={() => {
                    playDuoSound('click');
                    setTrueFalseAnswer(true);
                  }}
                  className={`p-5 rounded-2xl border font-extrabold text-center flex flex-col items-center gap-2 transition-all cursor-pointer select-none ${
                    isAnswerSubmitted && isExpectedTrue === true
                      ? 'bg-[#DDF7F2] border-2 border-[#169E6C] text-[#064E3B]'
                      : isAnswerSubmitted && trueFalseAnswer === true && !isCorrect
                      ? 'bg-[#FFE4E8] border-2 border-[#E5484D] text-[#881337]'
                      : trueFalseAnswer === true
                      ? 'bg-[#EAE4FF] border-2 border-[#5B46E8] text-[#24243B]'
                      : 'bg-white border-[#E5E1EB] hover:border-[#5B46E8]/40 text-[#24243B]'
                  }`}
                >
                  <div className="w-11 h-11 rounded-xl bg-[#DDF7F2] flex items-center justify-center text-[#169E6C]">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <span className="text-sm sm:text-base font-black">صحیح (درست)</span>
                  <span className="text-[11px] font-bold text-[#69697E]">کلید ۱</span>
                </button>

                <button
                  disabled={isAnswerSubmitted}
                  onClick={() => {
                    playDuoSound('click');
                    setTrueFalseAnswer(false);
                  }}
                  className={`p-5 rounded-2xl border font-extrabold text-center flex flex-col items-center gap-2 transition-all cursor-pointer select-none ${
                    isAnswerSubmitted && isExpectedTrue === false
                      ? 'bg-[#DDF7F2] border-2 border-[#169E6C] text-[#064E3B]'
                      : isAnswerSubmitted && trueFalseAnswer === false && !isCorrect
                      ? 'bg-[#FFE4E8] border-2 border-[#E5484D] text-[#881337]'
                      : trueFalseAnswer === false
                      ? 'bg-[#EAE4FF] border-2 border-[#5B46E8] text-[#24243B]'
                      : 'bg-white border-[#E5E1EB] hover:border-[#5B46E8]/40 text-[#24243B]'
                  }`}
                >
                  <div className="w-11 h-11 rounded-xl bg-[#FFE4E8] flex items-center justify-center text-[#E5484D]">
                    <XCircle className="w-6 h-6" />
                  </div>
                  <span className="text-sm sm:text-base font-black">غلط (نادرست)</span>
                  <span className="text-[11px] font-bold text-[#69697E]">کلید ۲</span>
                </button>
              </div>
            );
          })()}

          {/* ====================================================== */}
          {/* FORMAT 4: MULTIPLE CHOICE OPTIONS                      */}
          {/* ====================================================== */}
          {currentQuestion.type === 'multiple_choice' && currentQuestion.options && (
            <div className="grid grid-cols-1 gap-2.5">
              {currentQuestion.options.map((option, idx) => {
                const isSelected = selectedOptionIndex === idx;
                const isThisCorrect = isAnswerSubmitted && idx === currentQuestion.correctAnswer;
                const isThisWrong = isAnswerSubmitted && isSelected && !isCorrect;

                return (
                  <button
                    key={idx}
                    disabled={isAnswerSubmitted}
                    onClick={() => {
                      playDuoSound('click');
                      setSelectedOptionIndex(idx);
                    }}
                    className={`w-full p-4 rounded-xl border font-bold text-right flex items-center justify-between gap-3 transition-all cursor-pointer select-none ${
                      isThisCorrect
                        ? 'bg-[#DDF7F2] border-2 border-[#169E6C] text-[#064E3B] font-extrabold'
                        : isThisWrong
                        ? 'bg-[#FFE4E8] border-2 border-[#E5484D] text-[#881337]'
                        : isSelected
                        ? 'bg-[#EAE4FF] border-2 border-[#5B46E8] text-[#24243B] font-extrabold'
                        : 'bg-white border-[#E5E1EB] hover:border-[#5B46E8]/40 text-[#24243B]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-extrabold border shrink-0 ${
                          isSelected
                            ? 'bg-[#5B46E8] text-white border-[#5B46E8]'
                            : 'bg-[#F7F5F0] text-[#69697E] border-[#E5E1EB]'
                        }`}
                      >
                        {toPersianDigits(idx + 1)}
                      </span>
                      <span className="text-sm leading-relaxed">{option}</span>
                    </div>

                    {isThisCorrect && (
                      <Check className="w-5 h-5 text-[#169E6C] stroke-[2.75] shrink-0" />
                    )}
                    {isThisWrong && <X className="w-5 h-5 text-[#E5484D] stroke-[2.75] shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* ====================================================== */}
          {/* FORMAT 5: FILL IN THE BLANK                            */}
          {/* ====================================================== */}
          {currentQuestion.type === 'fill_blank' && (
            <div className="flex flex-col gap-4">
              <div className="bg-white border border-[#E5E1EB] rounded-2xl p-5 text-center text-base font-bold text-[#24243B] leading-loose flex items-center justify-center flex-wrap gap-2">
                <span>{currentQuestion.blankContext?.before}</span>
                <span className="min-w-[110px] px-3.5 py-1 border border-dashed border-[#5B46E8] bg-[#EAE4FF]/50 text-[#5B46E8] font-extrabold rounded-xl text-center">
                  {fillBlankInput || '......'}
                </span>
                <span>{currentQuestion.blankContext?.after}</span>
              </div>

              {!isAnswerSubmitted && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {fillBlankSuggestions.map((word, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        playDuoSound('click');
                        setFillBlankInput(word);
                      }}
                      className={`px-4 py-2.5 rounded-xl text-xs font-extrabold cursor-pointer transition-all border min-h-[44px] ${
                        fillBlankInput === word
                          ? 'bg-[#EAE4FF] border-[#5B46E8] text-[#5B46E8]'
                          : 'bg-white border-[#E5E1EB] hover:border-[#5B46E8]/40 text-[#24243B]'
                      }`}
                    >
                      {word}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ====================================================== */}
          {/* FORMAT 6: CASE STUDY                                   */}
          {/* ====================================================== */}
          {currentQuestion.type === 'case_study' && (
            <div className="flex flex-col gap-4">
              {currentQuestion.caseScenario && (
                <div className="bg-[#DDF7F2]/55 border border-[#16A394]/30 rounded-2xl p-4 text-xs font-medium text-[#24243B]">
                  <div className="flex items-center gap-2 mb-2 font-extrabold text-[#0F766E]">
                    <Stethoscope className="w-4 h-4 text-[#16A394]" />
                    <span>شرح حال و نشانه‌شناسی مراجع:</span>
                  </div>
                  <p className="leading-relaxed mb-2">
                    {currentQuestion.caseScenario.clientProfile}
                  </p>
                  {currentQuestion.caseScenario.symptoms && currentQuestion.caseScenario.symptoms.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {currentQuestion.caseScenario.symptoms.map((sym, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-0.5 rounded-md bg-white border border-[#16A394]/30 text-[#0F766E] text-[11px] font-bold"
                        >
                          • {sym}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-2.5">
                {(currentQuestion.caseScenario?.diagnosticOptions || currentQuestion.options || []).map((opt, idx) => {
                  const isSelected = caseSelectedOption === idx;
                  const isThisCorrect = isAnswerSubmitted && idx === currentQuestion.correctAnswer;
                  const isThisWrong = isAnswerSubmitted && isSelected && !isCorrect;

                  return (
                    <button
                      key={idx}
                      disabled={isAnswerSubmitted}
                      onClick={() => {
                        playDuoSound('click');
                        setCaseSelectedOption(idx);
                      }}
                      className={`w-full p-3.5 rounded-xl border font-bold text-right flex items-center justify-between gap-3 transition-all cursor-pointer min-h-[54px] ${
                        isThisCorrect
                          ? 'bg-[#DDF7F2] border-2 border-[#169E6C] text-[#064E3B] font-extrabold'
                          : isThisWrong
                          ? 'bg-[#FFE4E8] border-2 border-[#E5484D] text-[#881337]'
                          : isSelected
                          ? 'bg-[#EAE4FF] border-2 border-[#5B46E8] text-[#24243B] font-extrabold'
                          : 'bg-white border-[#E5E1EB] hover:border-[#5B46E8]/40 text-[#24243B]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-lg bg-[#F7F5F0] border border-[#E5E1EB] text-[#69697E] flex items-center justify-center text-xs font-extrabold shrink-0">
                          {toPersianDigits(idx + 1)}
                        </span>
                        <span className="text-xs sm:text-sm leading-relaxed">{opt}</span>
                      </div>
                      {isThisCorrect && <Check className="w-4 h-4 text-[#169E6C] stroke-[2.75] shrink-0" />}
                      {isThisWrong && <X className="w-4 h-4 text-[#E5484D] stroke-[2.75] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------- */}
      {/* BOTTOM ACTION & FEEDBACK BAR (Flush to bottom-0)           */}
      {/* ---------------------------------------------------------- */}
      <div
        className={`fixed bottom-0 right-0 left-0 z-30 p-3.5 sm:p-5 pb-safe transition-all duration-200 border-t shadow-lg ${
          isAnswerSubmitted
            ? isCorrect
              ? 'bg-[#DDF7F2] border-[#169E6C]/40'
              : 'bg-[#FFE4E8] border-[#E5484D]/40'
            : 'bg-white border-[#E5E1EB]'
        }`}
      >
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            {isAnswerSubmitted && (
              <div className="flex items-start gap-2.5 sm:gap-3">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    isCorrect ? 'bg-[#169E6C] text-white' : 'bg-[#E5484D] text-white'
                  }`}
                >
                  {isCorrect ? (
                    <Check className="w-4 h-4 stroke-[3]" />
                  ) : (
                    <X className="w-4 h-4 stroke-[3]" />
                  )}
                </div>
                <div className="flex flex-col text-right">
                  <span
                    className={`text-sm sm:text-base font-black ${
                      isCorrect ? 'text-[#064E3B]' : 'text-[#881337]'
                    }`}
                  >
                    {isCorrect ? 'پاسخ صحیح است' : 'پاسخ صحیح:'}
                  </span>
                  {!isCorrect && (
                    <span className="text-xs font-extrabold text-[#881337]">
                      {currentQuestion.type === 'multiple_choice' && currentQuestion.options
                        ? currentQuestion.options[Number(currentQuestion.correctAnswer)]
                        : currentQuestion.type === 'true_false'
                        ? currentQuestion.isTrue
                          ? 'صحیح (درست)'
                          : 'غلط (نادرست)'
                        : currentQuestion.type === 'sentence_order'
                        ? currentQuestion.correctSentence
                        : String(currentQuestion.correctAnswer)}
                    </span>
                  )}
                  {currentQuestion.explanation && (
                    <p className="text-[11px] font-medium text-[#24243B]/80 max-w-md mt-0.5 leading-relaxed">
                      {currentQuestion.explanation}
                    </p>
                  )}
                </div>
              </div>
            )}
            {!isAnswerSubmitted && (
              <span className="text-xs font-medium text-[#69697E] hidden sm:inline">
                پاسخ مورد نظر را انتخاب کنید و سپس دکمه بررسی پاسخ را بزنید
              </span>
            )}
          </div>

          {!isAnswerSubmitted ? (
            <button
              disabled={!hasSelectedAnswer()}
              onClick={handleSubmitAnswer}
              className={`w-full sm:w-44 py-3 rounded-xl text-sm font-extrabold transition-colors min-h-[48px] flex items-center justify-center ${
                hasSelectedAnswer()
                  ? 'bg-[#5B46E8] hover:bg-[#4935D4] text-white cursor-pointer'
                  : 'bg-[#E5E1EB] text-[#69697E] cursor-not-allowed'
              }`}
            >
              بررسی پاسخ
            </button>
          ) : (
            <button
              onClick={handleNextQuestion}
              className={`w-full sm:w-44 py-3 rounded-xl text-sm font-extrabold text-white cursor-pointer transition-colors min-h-[48px] flex items-center justify-center ${
                isCorrect
                  ? 'bg-[#169E6C] hover:bg-[#128359]'
                  : 'bg-[#E5484D] hover:bg-[#C93B40]'
              }`}
            >
              ادامه
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

