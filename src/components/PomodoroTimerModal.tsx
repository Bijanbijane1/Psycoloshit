import React, { useState, useEffect, useRef } from 'react';
import { Chapter, UserProgress } from '../types/psychology';
import {
  Timer,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  X,
  Minimize2,
  Maximize2,
  Coffee,
  BookOpen,
  Sparkles,
  Zap,
  Bell,
  Clock,
  Award,
} from 'lucide-react';
import { DuoMascot } from './DuoMascot';
import { playDuoSound } from '../utils/duoAudio';
import confetti from 'canvas-confetti';

interface PomodoroTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapter: Chapter;
  progress: UserProgress;
  onLogStudyTime: (chapterId: string, seconds: number, xpBonus: number) => void;
}

const PRESET_GOALS = [
  { label: '۱۵ دقیقه (سریع)', minutes: 15, xp: 20 },
  { label: '۲۵ دقیقه (استاندارد)', minutes: 25, xp: 35 },
  { label: '۳۵ دقیقه (عمیق)', minutes: 35, xp: 50 },
  { label: '۴۵ دقیقه (پیشرفته)', minutes: 45, xp: 65 },
  { label: '۵ دقیقه (استراحت)', minutes: 5, xp: 5, isBreak: true },
];

export const PomodoroTimerModal: React.FC<PomodoroTimerModalProps> = ({
  isOpen,
  onClose,
  chapter,
  progress,
  onLogStudyTime,
}) => {
  const [selectedGoalMinutes, setSelectedGoalMinutes] = useState<number>(25);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(25 * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [mode, setMode] = useState<'focus' | 'break'>('focus');
  const [isCompletedSession, setIsCompletedSession] = useState<boolean>(false);
  const [earnedXp, setEarnedXp] = useState<number>(35);
  const [sessionElapsedSeconds, setSessionElapsedSeconds] = useState<number>(0);

  const initialTotalSecondsRef = useRef<number>(25 * 60);

  // Total previously logged seconds for this specific chapter
  const existingChapterSeconds = progress.chapterStudyTime?.[chapter.id] || 0;

  // Request browser notification permission once
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, []);

  // Timer Tick Interval
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleSessionFinished();
          return 0;
        }
        return prev - 1;
      });

      setSessionElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  // Handle session complete
  const handleSessionFinished = () => {
    setIsRunning(false);
    playDuoSound('complete');

    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#58CC02', '#FFC800', '#1CB0F6', '#FF9600'],
    });

    const targetXp = mode === 'focus' ? Math.round(selectedGoalMinutes * 1.4) : 5;
    setEarnedXp(targetXp);
    setIsCompletedSession(true);
    setIsMinimized(false);

    // Track focused reading time per chapter
    if (mode === 'focus') {
      const loggedSeconds = initialTotalSecondsRef.current;
      onLogStudyTime(chapter.id, loggedSeconds, targetXp);
    }

    // Trigger OS notification if allowed
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(mode === 'focus' ? 'پایان پومودورو! 🎉' : 'پایان استراحت ☕', {
          body:
            mode === 'focus'
              ? `آفرین! جلسه ${selectedGoalMinutes} دقیقه‌ای مطالعه فصل «${chapter.title}» با موفقیت پایان یافت و ${targetXp} XP پاداش گرفتید!`
              : 'استراحت کوتاه به پایان رسید. برای شروع بخش بعدی مطالعه آماده شوید!',
          icon: '/pwa-192x192.png',
        });
      } catch {
        // Fallback gracefully if notifications restricted in iframe
      }
    }
  };

  const handleSelectGoal = (minutes: number, isBreak = false) => {
    playDuoSound('click');
    setSelectedGoalMinutes(minutes);
    const secs = minutes * 60;
    initialTotalSecondsRef.current = secs;
    setTimeLeftSeconds(secs);
    setIsRunning(false);
    setSessionElapsedSeconds(0);
    setMode(isBreak ? 'break' : 'focus');
    setIsCompletedSession(false);
  };

  const handleTogglePlay = () => {
    playDuoSound('click');
    setIsRunning(!isRunning);
  };

  const handleReset = () => {
    playDuoSound('click');
    setIsRunning(false);
    setTimeLeftSeconds(initialTotalSecondsRef.current);
    setSessionElapsedSeconds(0);
    setIsCompletedSession(false);
  };

  const handleFinishEarlyAndSave = () => {
    if (sessionElapsedSeconds < 60) {
      onClose();
      return;
    }
    playDuoSound('complete');
    const xp = Math.max(10, Math.round((sessionElapsedSeconds / 60) * 1.2));
    onLogStudyTime(chapter.id, sessionElapsedSeconds, xp);
    setEarnedXp(xp);
    setIsCompletedSession(true);
    setIsRunning(false);
  };

  // Format MM:SS
  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const totalSecs = initialTotalSecondsRef.current || 25 * 60;
  const progressPercent = Math.min(100, Math.round(((totalSecs - timeLeftSeconds) / totalSecs) * 100));

  if (!isOpen) return null;

  // Minimized floating pill during reading
  if (isMinimized) {
    return (
      <div className="fixed bottom-20 sm:bottom-6 left-3 sm:left-6 z-50 bg-white border-2 border-b-4 border-[#58CC02] rounded-2xl p-3 shadow-2xl flex items-center gap-3 animate-fadeIn select-none">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center text-[#58CC02]">
            <Timer className={`w-4 h-4 ${isRunning ? 'animate-pulse' : ''}`} />
          </div>
          <div className="text-right">
            <span className="text-[10px] font-black text-slate-400 block line-clamp-1 max-w-[120px]">
              {chapter.title}
            </span>
            <span className="text-sm font-black text-slate-800 font-mono tracking-wider">
              {formatTime(timeLeftSeconds)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleTogglePlay}
            className={`p-2 rounded-xl text-xs font-black cursor-pointer ${
              isRunning ? 'bg-amber-100 text-amber-800' : 'bg-emerald-500 text-white'
            }`}
            title={isRunning ? 'توقف موقت' : 'ادامه'}
          >
            {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setIsMinimized(false)}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl cursor-pointer"
            title="بزرگ‌نمایی تایمر"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 pb-safe bg-slate-900/60 backdrop-blur-2xs animate-fadeIn select-none">
      <div className="bg-white border-2 border-b-6 border-slate-300 rounded-2xl sm:rounded-3xl p-4 sm:p-7 max-w-md w-full max-h-[92dvh] overflow-y-auto overscroll-contain touch-scroll shadow-2xl relative animate-scaleUp text-right pb-safe">
        {/* Top Controls Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMinimized(true)}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer min-w-[38px] min-h-[38px] flex items-center justify-center"
              title="کوچک کردن تایمر هنگام مطالعه"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer min-w-[38px] min-h-[38px] flex items-center justify-center"
              title="بستن"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-800">
              جلسه مطالعه متمرکز (پومودورو)
            </span>
            <div className="w-7 h-7 rounded-xl bg-orange-100 text-[#FF9600] flex items-center justify-center">
              <Timer className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 1. SESSION COMPLETION CELEBRATION VIEW                   */}
        {/* ======================================================== */}
        {isCompletedSession ? (
          <div className="flex flex-col items-center text-center py-4 space-y-4">
            <div className="w-20 h-20 rounded-3xl bg-emerald-100 border-2 border-b-4 border-emerald-300 flex items-center justify-center text-[#58CC02] shadow-md animate-bounce">
              <Award className="w-10 h-10 fill-current" />
            </div>

            <div>
              <span className="text-xs font-black uppercase text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-300">
                جلسه با موفقیت ثبت شد! 🎉
              </span>
              <h3 className="text-xl font-black text-slate-800 mt-2">
                تمرکز طلایی روی «{chapter.title}»
              </h3>
              <p className="text-xs font-bold text-slate-500 mt-1 max-w-xs">
                زمان مطالعه متمرکز این فصل به کارنامه علمی و دقایق کلی مطالعه شما افزوده شد.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 w-full">
              <div className="flex-1 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 font-black text-xs flex flex-col items-center">
                <span className="text-slate-400 text-[10px]">پاداش جلسه</span>
                <span className="text-lg text-amber-700 flex items-center gap-1 mt-0.5">
                  <Zap className="w-4 h-4 fill-current" />
                  +{earnedXp} XP
                </span>
              </div>

              <div className="flex-1 p-3 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900 font-black text-xs flex flex-col items-center">
                <span className="text-slate-400 text-[10px]">کل مطالعه این فصل</span>
                <span className="text-lg text-sky-700 flex items-center gap-1 mt-0.5">
                  <Clock className="w-4 h-4" />
                  {Math.round((existingChapterSeconds + (sessionElapsedSeconds || selectedGoalMinutes * 60)) / 60)} دقیقه
                </span>
              </div>
            </div>

            <div className="flex gap-2 w-full pt-2">
              <button
                onClick={() => {
                  setIsCompletedSession(false);
                  handleSelectGoal(5, true); // 5 min break
                }}
                className="duo-btn-blue flex-1 py-3 rounded-2xl text-xs font-black cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Coffee className="w-4 h-4" />
                <span>۵ دقیقه استراحت کوتاه</span>
              </button>

              <button
                onClick={onClose}
                className="duo-btn-green flex-1 py-3 rounded-2xl text-xs font-black cursor-pointer flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>بازگشت به متن درس</span>
              </button>
            </div>
          </div>
        ) : (
          /* ======================================================== */
          /* 2. ACTIVE POMODORO COUNTDOWN DIAL                        */
          /* ======================================================== */
          <div className="flex flex-col items-center space-y-4">
            {/* Target Chapter Badge */}
            <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-black text-slate-800 truncate max-w-[200px]">
                  {chapter.title}
                </span>
              </div>
              <span className="text-[10px] font-black text-slate-500 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                قبلاً: {Math.round(existingChapterSeconds / 60)} دقیقه
              </span>
            </div>

            {/* Circular Dial Display */}
            <div className="relative w-48 h-48 flex items-center justify-center my-2">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  stroke="#E2E8F0"
                  strokeWidth="10"
                  fill="none"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  stroke={mode === 'focus' ? '#58CC02' : '#1CB0F6'}
                  strokeWidth="10"
                  strokeDasharray={440}
                  strokeDashoffset={440 - (440 * progressPercent) / 100}
                  strokeLinecap="round"
                  fill="none"
                  className="transition-all duration-500"
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <DuoMascot
                  mood={isRunning ? 'streak' : 'tutor'}
                  size={42}
                  animate={false}
                  className="mb-1"
                />
                <span className="text-3xl font-black text-slate-800 font-mono tracking-wider">
                  {formatTime(timeLeftSeconds)}
                </span>
                <span className="text-[10px] font-bold text-slate-400 mt-0.5">
                  {mode === 'focus' ? 'زمان تمرکز باقی‌مانده' : 'زمان استراحت'}
                </span>
              </div>
            </div>

            {/* Goal Presets Pills */}
            <div className="w-full">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1.5 px-1">
                <span>انتخاب هدف جلسه:</span>
                <span className="text-[#58CC02] font-black">{selectedGoalMinutes} دقیقه</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {PRESET_GOALS.map((preset) => (
                  <button
                    key={preset.minutes}
                    onClick={() => handleSelectGoal(preset.minutes, preset.isBreak)}
                    className={`py-2 px-1 rounded-xl text-[11px] font-black transition-all cursor-pointer text-center ${
                      selectedGoalMinutes === preset.minutes && mode === (preset.isBreak ? 'break' : 'focus')
                        ? preset.isBreak
                          ? 'bg-[#1CB0F6] text-white shadow-xs'
                          : 'bg-[#58CC02] text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {preset.minutes}د
                  </button>
                ))}
              </div>
            </div>

            {/* Primary Action Buttons */}
            <div className="flex items-center gap-2.5 w-full pt-2">
              <button
                onClick={handleTogglePlay}
                className={`flex-1 py-3.5 rounded-2xl text-sm font-black flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all ${
                  isRunning ? 'duo-btn-yellow' : 'duo-btn-green'
                }`}
              >
                {isRunning ? (
                  <>
                    <Pause className="w-4 h-4 fill-current" />
                    <span>توقف موقت</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>شروع تمرکز</span>
                  </>
                )}
              </button>

              <button
                onClick={handleReset}
                className="duo-btn-white p-3.5 rounded-2xl text-slate-600 cursor-pointer"
                title="شروع مجدد تایمر"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {sessionElapsedSeconds >= 60 && (
                <button
                  onClick={handleFinishEarlyAndSave}
                  className="duo-btn-blue px-3 py-3.5 rounded-2xl text-xs font-black cursor-pointer whitespace-nowrap"
                  title="پایان زودهنگام و ثبت زمان تا الان"
                >
                  ثبت زمان
                </button>
              )}
            </div>

            {/* Notification and Guidance Note */}
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 w-full text-right">
              <Bell className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>پس از اتمام زمان، هشدار صوتی و نوتیفیکیشن اعلان برای شما ارسال خواهد شد.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
