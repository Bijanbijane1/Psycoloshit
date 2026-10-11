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
  Puzzle,
  FileText,
  HelpCircle,
  Volume2,
  CheckCircle2,
  XCircle,
  Award,
} from 'lucide-react';
import { DuoMascot } from './DuoMascot';
import { BadgeIcon } from './BadgeIcon';
import { BADGE_DEFINITIONS, evaluateBadgeProgress } from '../data/badgeDefinitions';
import { playDuoSound } from '../utils/duoAudio';
import confetti from 'canvas-confetti';
import { SECTION_1_STAGES } from '../data/section1Stages';

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
}

type QuizFilterType =
  | 'all'
  | 'match_pairs'
  | 'sentence_order'
  | 'true_false'
  | 'multiple_choice'
  | 'fill_blank'
  | 'case_study';

export const QuizCenterView: React.FC<QuizCenterViewProps> = ({
  sections,
  selectedChapter,
  onClearSelectedChapter,
  onSelectChapter,
  progress,
  onRecordQuizResult,
  onOpenBadges,
}) => {
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

    // Merge and deduplicate by question id
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
    let pool = allQuestions;

    if (selectedChapter) {
      const chapterPool = allQuestions.filter((q) => q.chapterId === selectedChapter.id);
      if (chapterPool.length > 0) {
        pool = chapterPool;
      }
    }

    if (filterType !== 'all') {
      const filteredPool = pool.filter((q) => q.type === filterType);
      if (filteredPool.length > 0) {
        pool = filteredPool;
      } else {
        // Fallback: search across all chapters if current chapter has none for this specific type
        const globalFiltered = allQuestions.filter((q) => q.type === filterType);
        if (globalFiltered.length > 0) {
          pool = globalFiltered;
        }
      }
    }

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
      // Correct pair match!
      playDuoSound('pair_match');
      setMatchedPairIds((prev) => [...prev, leftId]);
      setSelectedPairLeft(null);
      setSelectedPairRight(null);
    } else {
      // Mismatch
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

    if (currentChapter) {
      onRecordQuizResult(
        currentChapter.id,
        currentQuestion.id,
        isCorrect,
        userAnswer,
        timerSeconds,
        currentQuestion.difficulty
      );
    }
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
        particleCount: 90,
        spread: 85,
        origin: { y: 0.6 },
        colors: ['#58CC02', '#FFC800', '#1CB0F6', '#FF4B4B', '#CE82FF'],
      });
    }
  };

  // Keyboard shortcut listener (1-4 for options, 1/2 for TF, Enter for next/submit)
  useEffect(() => {
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
  }, [isAnswerSubmitted, currentQuestion, selectedOptionIndex, caseSelectedOption, trueFalseAnswer, hasSelectedAnswer]);

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

  // ==========================================================
  // 1. LESSON COMPLETE SCREEN
  // ==========================================================
  if (isQuizCompleted) {
    const accuracy = Math.round((quizScore.correct / (questionsDeck.length || 1)) * 100);
    return (
      <div className="max-w-xl mx-auto py-8 px-4 flex flex-col items-center text-center select-none animate-fadeIn">
        <DuoMascot mood="excited" size={130} />

        <h2 className="text-2xl sm:text-3xl font-black text-[#58CC02] mt-4">
          درس کوئیز به پایان رسید! 🎉
        </h2>
        <p className="text-xs sm:text-sm font-bold text-slate-500 mt-1">
          تسلط شما بر مفاهیم و سرفصل‌ها با موفقیت ثبت شد!
        </p>

        {/* Recap Cards */}
        <div className="grid grid-cols-3 gap-3 w-full my-6">
          <div className="bg-white border-2 border-b-4 border-[#FFC800] rounded-2xl p-4 flex flex-col items-center shadow-xs">
            <span className="text-[11px] font-black text-amber-900">مجموع پاداش</span>
            <div className="flex items-center gap-1 my-1">
              <Zap className="w-5 h-5 text-[#FFC800] fill-[#FFC800]" />
              <span className="text-xl font-black text-amber-950">
                +{quizScore.points || 50}
              </span>
            </div>
            <span className="text-[10px] font-black text-slate-400">امتیاز XP</span>
          </div>

          <div className="bg-white border-2 border-b-4 border-[#58CC02] rounded-2xl p-4 flex flex-col items-center shadow-xs">
            <span className="text-[11px] font-black text-emerald-800">دقت پاسخ‌ها</span>
            <span className="text-xl font-black text-[#58CC02] my-1">{accuracy}٪</span>
            <span className="text-[10px] font-black text-slate-400">
              {quizScore.correct} از {questionsDeck.length} درست
            </span>
          </div>

          <div className="bg-white border-2 border-b-4 border-[#FF9600] rounded-2xl p-4 flex flex-col items-center shadow-xs">
            <span className="text-[11px] font-black text-orange-900">زنجیره مطالعه</span>
            <div className="flex items-center gap-1 my-1">
              <Sparkles className="w-5 h-5 text-[#FF9600] fill-[#FF9600]" />
              <span className="text-xl font-black text-orange-950">
                {progress.streakDays}
              </span>
            </div>
            <span className="text-[10px] font-black text-slate-400">روز پیوسته 🔥</span>
          </div>
        </div>

        {/* Quiz Milestone Badges Showcase */}
        <div className="w-full bg-[#FFFBEB] border-2 border-[#FFC800] rounded-2xl p-4 mb-6 text-right flex items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <BadgeIcon
                type={accuracy >= 80 ? 'sharpshooter' : 'first_quiz'}
                isUnlocked={quizScore.correct > 0}
                size={54}
                showStars={false}
              />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase text-[#B45309] bg-amber-100 px-2 py-0.5 rounded-full inline-block">
                دستاوردهای تستی دوئولینگو
              </span>
              <h4 className="text-sm font-black text-slate-800 mt-0.5">
                {accuracy >= 80
                  ? 'آفرین! به مدال تیرانداز دقیق (Sharpshooter) نزدیک شدید!'
                  : 'عالی بود! با تمرین بیشتر مدال‌های تستی جدیدی باز می‌شوند!'}
              </h4>
              <p className="text-[11px] font-bold text-slate-500">
                با هر تست موفق، امتیاز XP و ستاره‌های تالار افتخارات ارتقا می‌یابد.
              </p>
            </div>
          </div>

          {onOpenBadges && (
            <button
              onClick={onOpenBadges}
              className="duo-btn-orange px-3.5 py-2.5 rounded-xl text-xs font-black text-white shrink-0 cursor-pointer flex items-center gap-1.5"
            >
              <Award className="w-4 h-4" />
              <span>مشاهده مدال‌ها</span>
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
              setQuestionsDeck((prev) => [...prev].sort(() => 0.5 - Math.random()));
            }}
            className="duo-btn-white flex-1 py-3.5 rounded-2xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>تمرین دوباره این دسته</span>
          </button>

          <button
            onClick={() => {
              playDuoSound('click');
              if (selectedChapter) onSelectChapter(selectedChapter);
              else onClearSelectedChapter();
            }}
            className="duo-btn-green flex-1 py-3.5 rounded-2xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>ادامه مسیر یادگیری</span>
          </button>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="p-12 text-center bg-white rounded-3xl border-2 border-slate-200">
        <DuoMascot mood="thinking" size={64} />
        <p className="text-slate-600 text-sm font-bold mt-3">در حال بارگذاری کوئیز هوشمند...</p>
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
    <div className="max-w-2xl mx-auto flex flex-col min-h-[82vh] justify-between pb-32 select-none">
      {/* -------------------------------------------------------- */}
      {/* Top Duolingo Bar: Exit X, Chunky Green Capsule, Hearts    */}
      {/* -------------------------------------------------------- */}
      <div>
        <div className="flex items-center gap-2 sm:gap-4 py-3">
          <button
            onClick={() => {
              playDuoSound('click');
              onClearSelectedChapter();
            }}
            className="p-2 sm:px-3 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors flex items-center gap-1 min-h-[44px]"
            title="خروج از آزمون و بازگشت به داشبورد"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 stroke-[3]" />
            <span className="text-xs font-black text-slate-500 sm:hidden">خروج</span>
          </button>

          {/* Duolingo Progress Capsule */}
          <div className="flex-1 h-4 bg-slate-200 rounded-full overflow-hidden p-0.5 border border-slate-300">
            <div
              className="h-full bg-[#58CC02] rounded-full transition-all duration-300 relative"
              style={{ width: `${Math.max(6, progressPercent)}%` }}
            >
              <div className="absolute top-0.5 right-1 left-1 h-1 bg-white/40 rounded-full" />
            </div>
          </div>

          {/* Hearts counter */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-slate-200 bg-white shadow-2xs">
            <Heart
              className={`w-5 h-5 text-[#FF4B4B] fill-[#FF4B4B] ${
                heartsCount <= 1 ? 'animate-bounce' : ''
              }`}
            />
            <span className="text-sm font-black text-[#FF4B4B]">{heartsCount}</span>
          </div>
        </div>

        {/* Distinct Question Formats Filter Switcher */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-2 px-1 scrollbar-none">
          {[
            { id: 'all' as const, label: 'همه قالب‌ها 🎯' },
            { id: 'match_pairs' as const, label: 'تطبیق جفت‌ها 🧩' },
            { id: 'sentence_order' as const, label: 'مرتب‌سازی جمله 📝' },
            { id: 'true_false' as const, label: 'درست / غلط ⚡' },
            { id: 'multiple_choice' as const, label: 'چهارگزینه‌ای ❓' },
            { id: 'case_study' as const, label: 'کیس بالینی 🩺' },
            { id: 'fill_blank' as const, label: 'جای خالی ✍️' },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => {
                playDuoSound('click');
                setFilterType(mode.id);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all cursor-pointer ${
                filterType === mode.id
                  ? 'bg-[#E5F6FD] text-[#1CB0F6] border-2 border-[#1CB0F6] border-b-4'
                  : 'text-slate-500 hover:bg-slate-100 border-2 border-transparent'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* -------------------------------------------------------- */}
        {/* Main Question Area with Mascot Speech Bubble             */}
        {/* -------------------------------------------------------- */}
        <div className="mt-5 flex flex-col gap-5">
          {/* Duo Speech Bubble Header */}
          <div className="flex items-start gap-3 sm:gap-4">
            <DuoMascot
              mood={
                isAnswerSubmitted
                  ? isCorrect
                    ? 'excited'
                    : 'sad'
                  : currentQuestion.type === 'match_pairs'
                  ? 'happy'
                  : currentQuestion.type === 'case_study'
                  ? 'tutor'
                  : 'happy'
              }
              size={72}
            />

            <div className="flex-1 bg-white border-2 border-b-4 border-slate-200 rounded-3xl p-4 sm:p-5 relative shadow-xs duo-bubble-caret">
              <span className="text-[11px] font-black uppercase text-[#1CB0F6] block mb-1">
                {currentQuestion.type === 'match_pairs'
                  ? 'جفت‌های مرتبط را یکی‌یکی وصل کن'
                  : currentQuestion.type === 'sentence_order'
                  ? 'کلمات را به ترتیب لمس کن تا جمله ساخته شود'
                  : currentQuestion.type === 'true_false'
                  ? 'درست یا غلط بودن این گزاره را مشخص کن'
                  : currentQuestion.type === 'multiple_choice'
                  ? 'گزینه صحیح را انتخاب کن'
                  : currentQuestion.type === 'fill_blank'
                  ? 'جای خالی را با واژه صحیح پر کن'
                  : 'تحلیل کیس بالینی و تشخیص'}
              </span>
              <h3 className="text-sm sm:text-base font-black text-slate-800 leading-snug">
                {currentQuestion.text}
              </h3>
            </div>
          </div>

          {/* ====================================================== */}
          {/* FORMAT 1: MATCH PAIRS (تطبیق جفت‌ها)                  */}
          {/* ====================================================== */}
          {currentQuestion.type === 'match_pairs' && currentQuestion.matchPairs && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              {/* Left Column Items */}
              <div className="flex flex-col gap-2.5">
                <span className="text-[10px] font-black text-slate-400 px-1">دانشمندان و مفاهیم:</span>
                {shuffledPairs.leftItems.map((item) => {
                  const isMatched = matchedPairIds.includes(item.id);
                  const isSelected = selectedPairLeft === item.id;

                  return (
                    <button
                      key={item.id}
                      disabled={isMatched || isAnswerSubmitted}
                      onClick={() => handleTapPairLeft(item.id)}
                      className={`p-3.5 rounded-2xl border-2 font-black text-xs text-right transition-all cursor-pointer select-none ${
                        isMatched
                          ? 'bg-[#EAFBE7] border-2 border-[#58CC02] text-[#2E7500] opacity-60 cursor-default'
                          : isSelected
                          ? mismatchError
                            ? 'bg-[#FFDFE0] border-[#FF4B4B] text-[#EA2B2B] animate-shake'
                            : 'bg-[#DDF4FF] border-[#1CB0F6] border-b-4 text-[#1899D6] translate-y-[-2px]'
                          : 'bg-white border-slate-200 border-b-4 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{item.text}</span>
                        {isMatched && <Check className="w-4 h-4 text-[#58CC02] stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right Column Items */}
              <div className="flex flex-col gap-2.5">
                <span className="text-[10px] font-black text-slate-400 px-1">مکاتب و دستاوردها:</span>
                {shuffledPairs.rightItems.map((item) => {
                  const isMatched = matchedPairIds.includes(item.id);
                  const isSelected = selectedPairRight === item.id;

                  return (
                    <button
                      key={item.id}
                      disabled={isMatched || isAnswerSubmitted}
                      onClick={() => handleTapPairRight(item.id)}
                      className={`p-3.5 rounded-2xl border-2 font-black text-xs text-right transition-all cursor-pointer select-none ${
                        isMatched
                          ? 'bg-[#EAFBE7] border-2 border-[#58CC02] text-[#2E7500] opacity-60 cursor-default'
                          : isSelected
                          ? mismatchError
                            ? 'bg-[#FFDFE0] border-[#FF4B4B] text-[#EA2B2B] animate-shake'
                            : 'bg-[#DDF4FF] border-[#1CB0F6] border-b-4 text-[#1899D6] translate-y-[-2px]'
                          : 'bg-white border-slate-200 border-b-4 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{item.text}</span>
                        {isMatched && <Check className="w-4 h-4 text-[#58CC02] stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ====================================================== */}
          {/* FORMAT 2: SENTENCE ORDER (مرتب‌سازی جمله)              */}
          {/* ====================================================== */}
          {currentQuestion.type === 'sentence_order' && currentQuestion.sentenceTokens && (
            <div className="flex flex-col gap-4 mt-2">
              {/* Assembled Sentence Drop Area */}
              <div className="min-h-[72px] bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-3 flex flex-wrap items-center gap-2">
                {selectedTokens.length === 0 ? (
                  <span className="text-xs font-bold text-slate-400 mr-2">
                    برای مرتب‌سازی جمله، روی کلمات پایین کلیک کن...
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
                      className="duo-btn-blue px-3.5 py-1.5 rounded-xl text-xs font-black cursor-pointer shadow-xs animate-scaleUp"
                      title="لمس برای بازگرداندن کلمه"
                    >
                      {token}
                    </button>
                  ))
                )}
              </div>

              {/* Pool of Available Tokens */}
              {!isAnswerSubmitted && (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2 border-t border-slate-100">
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
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                          isAlreadyPlaced
                            ? 'bg-slate-200 border-2 border-slate-300 text-slate-400 opacity-40 cursor-default'
                            : 'duo-btn-white'
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
          {/* FORMAT 3: TRUE / FALSE LIGHTNING (درست یا غلط)         */}
          {/* ====================================================== */}
          {currentQuestion.type === 'true_false' && (() => {
            const isExpectedTrue =
              typeof currentQuestion.isTrue === 'boolean'
                ? currentQuestion.isTrue
                : typeof currentQuestion.correctAnswer === 'boolean'
                ? currentQuestion.correctAnswer
                : String(currentQuestion.correctAnswer).toLowerCase() === 'true';

            return (
              <div className="grid grid-cols-2 gap-4 mt-4">
                {/* True Button */}
                <button
                  disabled={isAnswerSubmitted}
                  onClick={() => {
                    playDuoSound('click');
                    setTrueFalseAnswer(true);
                  }}
                  className={`p-6 rounded-3xl border-2 font-black text-center flex flex-col items-center gap-2 transition-all cursor-pointer select-none ${
                    isAnswerSubmitted && isExpectedTrue === true
                      ? 'bg-[#D7FFB8] border-b-4 border-[#58CC02] text-[#2E7500]'
                      : isAnswerSubmitted && trueFalseAnswer === true && !isCorrect
                      ? 'bg-[#FFDFE0] border-b-4 border-[#FF4B4B] text-[#EA2B2B]'
                      : trueFalseAnswer === true
                      ? 'bg-[#D7FFB8] border-b-4 border-[#58CC02] text-[#2E7500] scale-[1.02]'
                      : 'bg-white border-slate-200 border-b-4 hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-[#58CC02]">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <span className="text-base font-black">صحیح (درست)</span>
                  <span className="text-[10px] font-bold text-slate-400">کلید ۱</span>
                </button>

                {/* False Button */}
                <button
                  disabled={isAnswerSubmitted}
                  onClick={() => {
                    playDuoSound('click');
                    setTrueFalseAnswer(false);
                  }}
                  className={`p-6 rounded-3xl border-2 font-black text-center flex flex-col items-center gap-2 transition-all cursor-pointer select-none ${
                    isAnswerSubmitted && isExpectedTrue === false
                      ? 'bg-[#D7FFB8] border-b-4 border-[#58CC02] text-[#2E7500]'
                      : isAnswerSubmitted && trueFalseAnswer === false && !isCorrect
                      ? 'bg-[#FFDFE0] border-b-4 border-[#FF4B4B] text-[#EA2B2B]'
                      : trueFalseAnswer === false
                      ? 'bg-[#FFDFE0] border-b-4 border-[#FF4B4B] text-[#EA2B2B] scale-[1.02]'
                      : 'bg-white border-slate-200 border-b-4 hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center text-[#FF4B4B]">
                    <XCircle className="w-8 h-8" />
                  </div>
                  <span className="text-base font-black">غلط (نادرست)</span>
                  <span className="text-[10px] font-bold text-slate-400">کلید ۲</span>
                </button>
              </div>
            );
          })()}

          {/* ====================================================== */}
          {/* FORMAT 4: MULTIPLE CHOICE OPTIONS                      */}
          {/* ====================================================== */}
          {currentQuestion.type === 'multiple_choice' && currentQuestion.options && (
            <div className="grid grid-cols-1 gap-3 mt-2">
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
                    className={`w-full p-4 rounded-2xl border-2 font-black text-right flex items-center justify-between transition-all cursor-pointer select-none ${
                      isThisCorrect
                        ? 'bg-[#D7FFB8] border-2 border-b-4 border-[#58CC02] text-[#2E7500]'
                        : isThisWrong
                        ? 'bg-[#FFDFE0] border-2 border-b-4 border-[#FF4B4B] text-[#EA2B2B]'
                        : isSelected
                        ? 'bg-[#DDF4FF] border-2 border-b-4 border-[#1CB0F6] text-[#1899D6] translate-y-[-2px]'
                        : 'bg-white border-slate-200 border-b-4 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black border ${
                          isSelected
                            ? 'bg-[#1CB0F6] text-white border-[#1CB0F6]'
                            : 'bg-slate-100 text-slate-600 border-slate-300'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="text-sm font-black">{option}</span>
                    </div>

                    {isThisCorrect && (
                      <Check className="w-5 h-5 text-[#58CC02] stroke-[3]" />
                    )}
                    {isThisWrong && <X className="w-5 h-5 text-[#FF4B4B] stroke-[3]" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* ====================================================== */}
          {/* FORMAT 5: FILL IN THE BLANK                            */}
          {/* ====================================================== */}
          {currentQuestion.type === 'fill_blank' && (
            <div className="flex flex-col gap-4 mt-2">
              <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-5 text-center text-base font-black text-slate-700 leading-relaxed flex items-center justify-center flex-wrap gap-2">
                <span>{currentQuestion.blankContext?.before}</span>
                <span className="min-w-[120px] px-3 py-1.5 border-b-4 border-[#1CB0F6] bg-white text-[#1CB0F6] rounded-xl text-center shadow-xs">
                  {fillBlankInput || '...'}
                </span>
                <span>{currentQuestion.blankContext?.after}</span>
              </div>

              {!isAnswerSubmitted && (
                <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                  {fillBlankSuggestions.map((word, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        playDuoSound('click');
                        setFillBlankInput(word);
                      }}
                      className={`duo-btn-white px-4 py-2.5 rounded-xl text-xs font-black cursor-pointer transition-all ${
                        fillBlankInput === word
                          ? 'bg-[#DDF4FF] border-[#1CB0F6] text-[#1CB0F6]'
                          : ''
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
            <div className="flex flex-col gap-4 mt-2">
              {currentQuestion.caseScenario && (
                <div className="bg-sky-50 border-2 border-sky-200 rounded-2xl p-4 text-xs font-bold text-sky-950">
                  <div className="flex items-center gap-2 mb-2 font-black text-[#1CB0F6]">
                    <Stethoscope className="w-4 h-4" />
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
                          className="px-2 py-0.5 rounded-md bg-white border border-sky-200 text-sky-800 text-[10px]"
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
                      className={`w-full p-3.5 rounded-2xl border-2 font-black text-right flex items-center justify-between transition-all cursor-pointer ${
                        isThisCorrect
                          ? 'bg-[#D7FFB8] border-b-4 border-[#58CC02] text-[#2E7500]'
                          : isThisWrong
                          ? 'bg-[#FFDFE0] border-b-4 border-[#FF4B4B] text-[#EA2B2B]'
                          : isSelected
                          ? 'bg-[#DDF4FF] border-b-4 border-[#1CB0F6] text-[#1899D6]'
                          : 'bg-white border-slate-200 border-b-4 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-lg bg-slate-100 border border-slate-300 text-slate-600 flex items-center justify-center text-xs font-black">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-black">{opt}</span>
                      </div>
                      {isThisCorrect && <Check className="w-4 h-4 text-[#58CC02] stroke-[3]" />}
                      {isThisWrong && <X className="w-4 h-4 text-[#FF4B4B] stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------- */}
      {/* SIGNATURE DUOLINGO BOTTOM ACTION DRAWER                     */}
      {/* ---------------------------------------------------------- */}
      <div
        className={`fixed bottom-0 right-0 left-0 z-50 p-3.5 sm:p-6 pb-safe transition-all duration-300 border-t-2 shadow-2xl ${
          isAnswerSubmitted
            ? isCorrect
              ? 'bg-[#D7FFB8] border-[#58CC02]'
              : 'bg-[#FFDFE0] border-[#FF4B4B]'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            {isAnswerSubmitted && (
              <div className="flex items-center gap-2.5 sm:gap-3">
                <DuoMascot mood={isCorrect ? 'excited' : 'sad'} size={44} animate={false} />
                <div className="flex flex-col text-right">
                  <span
                    className={`text-base sm:text-lg font-black ${
                      isCorrect ? 'text-[#2E7500]' : 'text-[#EA2B2B]'
                    }`}
                  >
                    {isCorrect ? 'فوق‌العاده بود! 🎉' : 'پاسخ صحیح:'}
                  </span>
                  {!isCorrect && (
                    <span className="text-xs font-black text-[#EA2B2B]">
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
                    <p className="text-[10px] sm:text-[11px] font-bold text-slate-600 max-w-sm mt-0.5 line-clamp-1">
                      {currentQuestion.explanation}
                    </p>
                  )}
                </div>
              </div>
            )}
            {!isAnswerSubmitted && (
              <span className="text-xs font-bold text-slate-400 hidden sm:inline">
                پاسخ خود را مشخص کن و دکمه بررسی را بزن
              </span>
            )}
          </div>

          {!isAnswerSubmitted ? (
            <button
              disabled={!hasSelectedAnswer()}
              onClick={handleSubmitAnswer}
              className={`w-full sm:w-44 py-3.5 rounded-2xl text-sm font-black cursor-pointer uppercase tracking-wider transition-all min-h-[48px] flex items-center justify-center ${
                hasSelectedAnswer()
                  ? 'duo-btn-green'
                  : 'bg-slate-200 border-b-4 border-slate-300 text-slate-400 cursor-not-allowed'
              }`}
            >
              بررسی پاسخ
            </button>
          ) : (
            <button
              onClick={handleNextQuestion}
              className={`w-full sm:w-44 py-3.5 rounded-2xl text-sm font-black cursor-pointer uppercase tracking-wider transition-all min-h-[48px] flex items-center justify-center ${
                isCorrect ? 'duo-btn-green' : 'duo-btn-red'
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
