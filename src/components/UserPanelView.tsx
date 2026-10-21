import React, { useState, useEffect } from 'react';
import { Section, Chapter, UserProgress, SupportTicket } from '../types/psychology';
import { BADGE_DEFINITIONS, evaluateBadgeProgress } from '../data/badgeDefinitions';
import { AnalyticsView } from './AnalyticsView';
import { BadgesView } from './BadgesView';
import { NotebookView } from './NotebookView';
import { SupportSystemView } from './SupportSystemView';
import { PrerequisiteInspectorModal } from './PrerequisiteInspectorModal';
import { PWAInstallButton } from './PWAInstallButton';
import { useAuth } from '../context/AuthContext';
import { playDuoSound } from '../utils/duoAudio';
import { toPersianDigits } from '../utils/persianDigits';
import { calculateAuthoritativeUserXp, DEFAULT_DAILY_XP_TARGET } from '../utils/storage';
import {
  fetchUserExamHistory,
  estimateKonkoorScaledScore,
  type UserExamHistorySummary,
} from '../services/examService';
import {
  User,
  ShieldCheck,
  CloudOff,
  Trophy,
  Award,
  BookMarked,
  Flame,
  Zap,
  Target,
  Search,
  SlidersHorizontal,
  Timer,
  Activity,
  Code2,
  FileText,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Sparkles,
  HelpCircle,
  FileSpreadsheet,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

export type UserPanelSubView =
  | 'overview'
  | 'analytics'
  | 'badges'
  | 'notes'
  | 'exam_history'
  | 'support';

interface UserPanelViewProps {
  sections: Section[];
  progress: UserProgress;
  initialSubView?: UserPanelSubView;
  onSubViewChange?: (subView: UserPanelSubView) => void;
  onSelectChapter: (chapter: Chapter) => void;
  onStartQuiz: (chapter?: Chapter) => void;
  onOpenExamSimulator?: (attemptIdToReview?: string) => void;
  onSaveNote: (chapterId: string, noteText: string) => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenPomodoro: () => void;
  onOpenReportModal: () => void;
  onOpenTrafficAnalytics: () => void;
  onOpenSourceCode: () => void;
  onNavigateToLearning: () => void;
  onlineCount?: number;
  isOffline?: boolean;
  isSyncingCloud?: boolean;
  tickets?: SupportTicket[];
  onAddTicket?: (ticket: SupportTicket) => void;
}

export const UserPanelView: React.FC<UserPanelViewProps> = ({
  sections = [],
  progress,
  initialSubView = 'overview',
  onSubViewChange,
  onSelectChapter,
  onStartQuiz,
  onOpenExamSimulator,
  onSaveNote,
  onOpenSearch,
  onOpenSettings,
  onOpenPomodoro,
  onOpenReportModal,
  onOpenTrafficAnalytics,
  onOpenSourceCode,
  onNavigateToLearning,
  onlineCount = 1,
  isOffline = false,
  isSyncingCloud = false,
  tickets = [],
  onAddTicket = () => {},
}) => {
  const { currentUser, isAuthenticated, openGoogleSignInModal, setIsAccountModalOpen } = useAuth();
  const [subView, setSubView] = useState<UserPanelSubView>(initialSubView);
  const [isPrerequisiteInspectorOpen, setIsPrerequisiteInspectorOpen] = useState<boolean>(false);
  const [examHistory, setExamHistory] = useState<UserExamHistorySummary | null>(null);
  const [isLoadingExamHistory, setIsLoadingExamHistory] = useState<boolean>(false);
  const [examHistoryError, setExamHistoryError] = useState<string | null>(null);

  useEffect(() => {
    setSubView(initialSubView);
  }, [initialSubView]);

  const loadExamHistory = async () => {
    setIsLoadingExamHistory(true);
    setExamHistoryError(null);
    try {
      const res = await fetchUserExamHistory();
      setExamHistory(res);
    } catch (err: any) {
      setExamHistoryError(err?.message || 'خطا در دریافت سوابق آزمون از سرور');
    } finally {
      setIsLoadingExamHistory(false);
    }
  };

  useEffect(() => {
    loadExamHistory();
  }, [currentUser?.userId]);

  const handleSelectSubView = (next: UserPanelSubView) => {
    playDuoSound('click');
    setSubView(next);
    if (onSubViewChange) {
      onSubViewChange(next);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const completedStagesMap = progress?.completedStages || {};
  const completedStageNumbers = Object.keys(completedStagesMap).map(Number);
  const completedStageCount = completedStageNumbers.length;

  const safeSections = Array.isArray(sections) ? sections : [];
  const evaluatedBadges = BADGE_DEFINITIONS.map((b) =>
    evaluateBadgeProgress(b, progress, safeSections)
  );
  const unlockedBadges = evaluatedBadges.filter((b) => b.isUnlocked);

  const allChapters = safeSections.flatMap((s) => s.chapters || []);
  const savedNotesCount = Object.values(progress?.chapterNotes || {}).filter(
    (t) => t && t.trim().length > 0
  ).length;
  const bookmarkedIds = Array.isArray(progress?.bookmarkedChapters) ? progress.bookmarkedChapters : [];
  const pinnedIds = Array.isArray(progress?.pinnedChapters) ? progress.pinnedChapters : [];
  const bookmarkedChaptersList = allChapters.filter((c) => bookmarkedIds.includes(c.id));
  const pinnedChaptersList = allChapters.filter((c) => pinnedIds.includes(c.id));

  const userXp = calculateAuthoritativeUserXp(progress, currentUser?.xp);
  const dailyXp = progress?.dailyXp ?? 0;
  const dailyTargetXp = progress?.dailyTargetXp ?? DEFAULT_DAILY_XP_TARGET;
  const dailyMissionDone = Boolean(progress?.dailyMissionCompleted || dailyXp >= dailyTargetXp);

  // Sub-view title resolver
  const getSubViewTitle = () => {
    switch (subView) {
      case 'analytics':
        return 'کارنامه و لیگ ملی';
      case 'badges':
        return 'مدال‌ها و دستاوردها';
      case 'notes':
        return 'دفترچه یادداشت و واژگان';
      case 'exam_history':
        return 'تاریخچه و نتایج آزمون‌های جامع';
      case 'support':
        return 'استاد راهنما و پشتیبانی علمی';
      default:
        return 'پنل من';
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 px-3.5 sm:px-4 py-3 sm:py-5 pb-24 select-none">
      {/* ================================================================== */}
      {/* 1. TOP HEADER & BREADCRUMB                                         */}
      {/* ================================================================== */}
      {subView === 'overview' ? (
        <header className="space-y-0.5 text-right">
          <span className="text-[11px] font-bold text-[#7056D8] tracking-wide block">
            ایستگاه شخصی و تنظیمات
          </span>
          <h1 className="text-lg sm:text-xl font-black text-[#24243B] tracking-tight">
            پنل من
          </h1>
        </header>
      ) : (
        <div className="flex items-center justify-between pb-2.5 border-b border-[#E5E1EB]">
          <button
            onClick={() => handleSelectSubView('overview')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#F7F5F0] border border-[#E5E1EB] text-xs font-bold text-[#36345F] cursor-pointer transition-colors min-h-[40px]"
          >
            <ChevronRight className="w-4 h-4" />
            <span>بازگشت به پنل من</span>
          </button>
          <span className="text-xs sm:text-sm font-extrabold text-[#24243B]">
            {getSubViewTitle()}
          </span>
        </div>
      )}

      {/* ================================================================== */}
      {/* 2. OVERVIEW LANDING: 4 CONCISE, STRUCTURED HUBS                    */}
      {/* ================================================================== */}
      {subView === 'overview' && (
        <div className="space-y-4 text-right">
          {/* -------------------------------------------------------------- */}
          {/* GROUP A: OVERVIEW & REAL SUMMARY METRICS                       */}
          {/* -------------------------------------------------------------- */}
          <section
            aria-label="نمای کلی حساب و آمار"
            className="rounded-2xl bg-white border border-[#E5E1EB] p-4 shadow-2xs space-y-3.5"
          >
            {/* Account Profile Row */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {isAuthenticated && currentUser?.picture && !currentUser.picture.includes('default-user') ? (
                  <img
                    src={currentUser.picture}
                    alt={currentUser.name}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 rounded-xl object-cover border border-[#E5E1EB] shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-[#36345F] text-white flex items-center justify-center text-sm font-black shrink-0">
                    {currentUser?.avatar || '🎓'}
                  </div>
                )}
                <div className="min-w-0">
                  <span className="text-xs sm:text-sm font-black text-[#24243B] block truncate">
                    {isAuthenticated && currentUser ? currentUser.name : 'دانشجوی مهمان'}
                  </span>
                  <span className="text-[11px] font-medium text-[#69697E] block truncate">
                    {isAuthenticated && currentUser
                      ? currentUser.email || 'متصل به حساب گوگل'
                      : 'ذخیره در مرورگر · برای پشتیبان ابری وارد شوید'}
                  </span>
                </div>
              </div>

              {isAuthenticated && currentUser ? (
                <button
                  onClick={() => {
                    playDuoSound('click');
                    setIsAccountModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#EAE4FF] hover:bg-[#DDD3FF] text-[#36345F] text-xs font-bold cursor-pointer transition-colors shrink-0 min-h-[38px]"
                >
                  حساب کاربری
                </button>
              ) : (
                <button
                  onClick={() => {
                    playDuoSound('click');
                    openGoogleSignInModal('signin');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#7056D8] hover:bg-[#5E43C4] text-white text-xs font-bold cursor-pointer transition-colors shrink-0 min-h-[38px]"
                >
                  ورود با گوگل
                </button>
              )}
            </div>

            {/* 5 Concise Summary Metrics */}
            <div className="grid grid-cols-5 gap-1.5 pt-2 border-t border-[#E5E1EB] text-center">
              <div className="p-2 rounded-xl bg-[#F7F5F0]">
                <span className="text-[10px] text-[#69697E] block mb-0.5">مجموع امتیاز</span>
                <span className="text-xs font-black text-[#7056D8] tabular-nums">
                  {toPersianDigits(userXp)}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-[#F7F5F0]">
                <span className="text-[10px] text-[#69697E] block mb-0.5">پیوستگی</span>
                <span className="text-xs font-black text-[#24243B] tabular-nums">
                  {toPersianDigits(progress.streakDays)} روز
                </span>
              </div>
              <div className="p-2 rounded-xl bg-[#F7F5F0]">
                <span className="text-[10px] text-[#69697E] block mb-0.5">الماس</span>
                <span className="text-xs font-black text-[#3976E4] tabular-nums">
                  {toPersianDigits(progress.diamonds ?? 480)} 💎
                </span>
              </div>
              <div className="p-2 rounded-xl bg-[#F7F5F0]">
                <span className="text-[10px] text-[#69697E] block mb-0.5">دروس کامل</span>
                <span className="text-xs font-black text-[#24243B] tabular-nums">
                  {toPersianDigits(completedStageCount)}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-[#F7F5F0]">
                <span className="text-[10px] text-[#69697E] block mb-0.5">آزمون‌ها</span>
                <span className="text-xs font-black text-[#24243B] tabular-nums">
                  {toPersianDigits(examHistory?.stats.totalCompletedExams ?? 0)}
                </span>
              </div>
            </div>

            {/* Daily Mission Status Bar */}
            <div className="pt-2 border-t border-[#E5E1EB] flex items-center justify-between text-[11px]">
              <span className="font-bold text-[#69697E]">مأموریت روزانه:</span>
              <span
                className={`font-black tabular-nums ${
                  dailyMissionDone ? 'text-[#389D77]' : 'text-[#24243B]'
                }`}
              >
                {toPersianDigits(dailyXp)} از {toPersianDigits(dailyTargetXp)} XP{' '}
                {dailyMissionDone ? '✓ تکمیل شد' : ''}
              </span>
            </div>

            {examHistoryError && (
              <div className="p-2.5 rounded-xl bg-[#FFF0C8]/70 border border-[#E5A33D]/40 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-[#5C3D0E] font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#C98A27] shrink-0" />
                  <span>{examHistoryError}</span>
                </div>
                <button
                  type="button"
                  onClick={loadExamHistory}
                  disabled={isLoadingExamHistory}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#F7F5F0] border border-[#E5A33D]/50 text-[#24243B] text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingExamHistory ? 'animate-spin' : ''}`} />
                  <span>تلاش مجدد</span>
                </button>
              </div>
            )}
          </section>

          {/* -------------------------------------------------------------- */}
          {/* GROUP B: PERFORMANCE AND EXAM HISTORY                          */}
          {/* -------------------------------------------------------------- */}
          <section
            aria-label="عملکرد و آزمون‌ها"
            className="rounded-2xl bg-white border border-[#E5E1EB] p-4 shadow-2xs space-y-2.5"
          >
            <div className="flex items-center gap-2 pb-1 border-b border-[#E5E1EB]">
              <Trophy className="w-4 h-4 text-[#3976E4]" />
              <h2 className="text-xs sm:text-sm font-black text-[#24243B]">
                عملکرد و نتایج آزمون
              </h2>
            </div>

            <div className="space-y-1.5">
              <button
                onClick={() => handleSelectSubView('analytics')}
                className="w-full p-3 rounded-xl bg-[#F7F5F0] hover:bg-[#E1ECFF]/50 border border-transparent hover:border-[#3976E4]/30 flex items-center justify-between text-right cursor-pointer transition-colors min-h-[48px]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Activity className="w-4 h-4 text-[#3976E4] shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#24243B] block">
                      کارنامه تحصیلی و لیگ ملی
                    </span>
                    <span className="text-[11px] text-[#69697E] block truncate">
                      رتبه در لیگ، تحلیل دقت پاسخ‌ها و زمان مطالعه
                    </span>
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-[#69697E] shrink-0" />
              </button>

              <button
                onClick={() => handleSelectSubView('exam_history')}
                className="w-full p-3 rounded-xl bg-[#F7F5F0] hover:bg-[#EAE4FF]/50 border border-transparent hover:border-[#7056D8]/30 flex items-center justify-between text-right cursor-pointer transition-colors min-h-[48px]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className="w-4 h-4 text-[#7056D8] shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#24243B] block">
                      تاریخچه آزمون‌های جامع کنکور
                    </span>
                    <span className="text-[11px] text-[#69697E] block truncate">
                      {toPersianDigits(examHistory?.stats.totalCompletedExams ?? 0)} آزمون ثبت‌شده · مشاهده کارنامه‌ها و تراز
                    </span>
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-[#69697E] shrink-0" />
              </button>

              <button
                onClick={() => {
                  playDuoSound('click');
                  onOpenReportModal();
                }}
                className="w-full p-3 rounded-xl bg-[#F7F5F0] hover:bg-[#DDF3E9]/50 border border-transparent hover:border-[#149D9A]/30 flex items-center justify-between text-right cursor-pointer transition-colors min-h-[48px]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileSpreadsheet className="w-4 h-4 text-[#149D9A] shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#24243B] block">
                      دریافت کارنامه رسمی (خروجی استاندارد)
                    </span>
                    <span className="text-[11px] text-[#69697E] block truncate">
                      گزارش رسمی سرفصل‌ها و درصدهای تراز شده
                    </span>
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-[#69697E] shrink-0" />
              </button>
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* GROUP C: PERSONAL STUDY TOOLS                                  */}
          {/* -------------------------------------------------------------- */}
          <section
            aria-label="ابزارهای مطالعه"
            className="rounded-2xl bg-white border border-[#E5E1EB] p-4 shadow-2xs space-y-2.5"
          >
            <div className="flex items-center gap-2 pb-1 border-b border-[#E5E1EB]">
              <BookMarked className="w-4 h-4 text-[#EF786B]" />
              <h2 className="text-xs sm:text-sm font-black text-[#24243B]">
                ابزارهای مطالعه و دستاوردها
              </h2>
            </div>

            <div className="space-y-1.5">
              <button
                onClick={() => handleSelectSubView('badges')}
                className="w-full p-3 rounded-xl bg-[#F7F5F0] hover:bg-[#FFF0C8]/50 border border-transparent hover:border-[#E5A33D]/30 flex items-center justify-between text-right cursor-pointer transition-colors min-h-[48px]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Award className="w-4 h-4 text-[#E5A33D] shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#24243B] block">
                      مدال‌ها و دستاوردها
                    </span>
                    <span className="text-[11px] text-[#69697E] block truncate">
                      {toPersianDigits(unlockedBadges.length)} از{' '}
                      {toPersianDigits(BADGE_DEFINITIONS.length)} نشان علمی باز شده
                    </span>
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-[#69697E] shrink-0" />
              </button>

              <button
                onClick={() => handleSelectSubView('notes')}
                className="w-full p-3 rounded-xl bg-[#F7F5F0] hover:bg-[#FFE5DC]/50 border border-transparent hover:border-[#EF786B]/30 flex items-center justify-between text-right cursor-pointer transition-colors min-h-[48px]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <BookMarked className="w-4 h-4 text-[#EF786B] shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#24243B] block">
                      دفترچه یادداشت و واژگان تخصصی
                    </span>
                    <span className="text-[11px] text-[#69697E] block truncate">
                      {toPersianDigits(savedNotesCount)} نکته تحلیلی ثبت‌شده
                    </span>
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-[#69697E] shrink-0" />
              </button>

              <button
                onClick={() => {
                  playDuoSound('click');
                  onOpenPomodoro();
                }}
                className="w-full p-3 rounded-xl bg-[#F7F5F0] hover:bg-[#DDF3E9]/50 border border-transparent hover:border-[#389D77]/30 flex items-center justify-between text-right cursor-pointer transition-colors min-h-[48px]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Timer className="w-4 h-4 text-[#389D77] shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#24243B] block">
                      زمان‌سنج تمرکز پومودورو
                    </span>
                    <span className="text-[11px] text-[#69697E] block truncate">
                      جلسات مطالعه متمرکز ۲۵ دقیقه‌ای و ثبت زمان
                    </span>
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-[#69697E] shrink-0" />
              </button>

              {(bookmarkedChaptersList.length > 0 || pinnedChaptersList.length > 0) && (
                <button
                  onClick={() => {
                    playDuoSound('click');
                    onNavigateToLearning();
                  }}
                  className="w-full p-3 rounded-xl bg-[#F7F5F0] hover:bg-[#EAE4FF]/50 border border-transparent hover:border-[#7056D8]/30 flex items-center justify-between text-right cursor-pointer transition-colors min-h-[48px]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <BookOpen className="w-4 h-4 text-[#7056D8] shrink-0" />
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-[#24243B] block">
                        سرفصل‌های نشان‌شده و سنجاق
                      </span>
                      <span className="text-[11px] text-[#69697E] block truncate">
                        {toPersianDigits(bookmarkedChaptersList.length + pinnedChaptersList.length)} فصل منتخب در برنامه درسی
                      </span>
                    </div>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-[#69697E] shrink-0" />
                </button>
              )}
            </div>
          </section>

          {/* -------------------------------------------------------------- */}
          {/* GROUP D: ACCOUNT, SUPPORT & SETTINGS                           */}
          {/* -------------------------------------------------------------- */}
          <section
            aria-label="حساب کاربری و تنظیمات"
            className="rounded-2xl bg-white border border-[#E5E1EB] p-4 shadow-2xs space-y-2.5"
          >
            <div className="flex items-center gap-2 pb-1 border-b border-[#E5E1EB]">
              <SlidersHorizontal className="w-4 h-4 text-[#36345F]" />
              <h2 className="text-xs sm:text-sm font-black text-[#24243B]">
                حساب کاربری، پشتیبانی و تنظیمات
              </h2>
            </div>

            <div className="space-y-1.5">
              <button
                onClick={() => {
                  playDuoSound('click');
                  onOpenSettings();
                }}
                className="w-full p-3 rounded-xl bg-[#F7F5F0] hover:bg-white border border-transparent hover:border-[#E5E1EB] flex items-center justify-between text-right cursor-pointer transition-colors min-h-[48px]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <SlidersHorizontal className="w-4 h-4 text-[#69697E] shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#24243B] block">
                      تنظیمات برنامه و شخصی‌سازی
                    </span>
                    <span className="text-[11px] text-[#69697E] block truncate">
                      فونت، اندازه قلم، تنظیمات صوتی و پاکسازی حافظه
                    </span>
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-[#69697E] shrink-0" />
              </button>

              <button
                onClick={() => handleSelectSubView('support')}
                className="w-full p-3 rounded-xl bg-[#F7F5F0] hover:bg-[#FBE2ED]/50 border border-transparent hover:border-[#D85B89]/30 flex items-center justify-between text-right cursor-pointer transition-colors min-h-[48px]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Sparkles className="w-4 h-4 text-[#D85B89] shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#24243B] block">
                      استاد راهنما و پشتیبانی علمی
                    </span>
                    <span className="text-[11px] text-[#69697E] block truncate">
                      پاسخ به سوالات درسی و ثبت تیکت‌های اشکال علمی
                    </span>
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-[#69697E] shrink-0" />
              </button>

              <button
                onClick={() => {
                  playDuoSound('click');
                  onOpenSearch();
                }}
                className="w-full p-3 rounded-xl bg-[#F7F5F0] hover:bg-white border border-transparent hover:border-[#E5E1EB] flex items-center justify-between text-right cursor-pointer transition-colors min-h-[48px]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Search className="w-4 h-4 text-[#69697E] shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#24243B] block">
                      جستجوی پیشرفته در سرفصل‌ها
                    </span>
                    <span className="text-[11px] text-[#69697E] block truncate">
                      کلید میانبر <span className="ltr-term font-mono">Ctrl + K</span>
                    </span>
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-[#69697E] shrink-0" />
              </button>

              <div className="p-3 rounded-xl bg-[#F7F5F0] flex items-center justify-between text-right">
                <div className="flex items-center gap-2.5 min-w-0">
                  {isOffline ? (
                    <CloudOff className="w-4 h-4 text-[#E5A33D] shrink-0" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-[#389D77] shrink-0" />
                  )}
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#24243B] block">
                      وضعیت همگام‌سازی ابری
                    </span>
                    <span className="text-[11px] text-[#69697E] block truncate">
                      {isOffline
                        ? 'حالت مطالعه آفلاین'
                        : isSyncingCloud
                        ? 'در حال ذخیره‌سازی در ابر...'
                        : 'متصل به سرور و همگام'}
                    </span>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                    isOffline
                      ? 'bg-[#FFF0C8] text-[#5C3D0E]'
                      : 'bg-[#DDF3E9] text-[#134E4A]'
                  }`}
                >
                  {isOffline ? 'آفلاین' : 'همگام'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => {
                    playDuoSound('click');
                    onOpenTrafficAnalytics();
                  }}
                  className="p-2.5 rounded-xl bg-[#F7F5F0] hover:bg-white border border-[#E5E1EB] text-right flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Activity className="w-3.5 h-3.5 text-[#69697E] shrink-0" />
                  <span className="text-[11px] font-bold text-[#24243B] truncate">
                    ترافیک زنده ({toPersianDigits(onlineCount)})
                  </span>
                </button>

                <button
                  onClick={() => {
                    playDuoSound('click');
                    setIsPrerequisiteInspectorOpen(true);
                  }}
                  className="p-2.5 rounded-xl bg-[#F7F5F0] hover:bg-white border border-[#E5E1EB] text-right flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Target className="w-3.5 h-3.5 text-[#69697E] shrink-0" />
                  <span className="text-[11px] font-bold text-[#24243B] truncate">
                    بازرس پیش‌نیازها
                  </span>
                </button>
              </div>

              <div className="pt-2">
                <PWAInstallButton variant="sheet" />
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ================================================================== */}
      {/* 3. SUB-VIEW: ANALYTICS & NATIONAL LEAGUE                           */}
      {/* ================================================================== */}
      {subView === 'analytics' && (
        <AnalyticsView
          sections={sections}
          progress={progress}
          onSelectChapter={onSelectChapter}
          onOpenBadges={() => handleSelectSubView('badges')}
          onOpenReportModal={onOpenReportModal}
        />
      )}

      {/* ================================================================== */}
      {/* 4. SUB-VIEW: ACHIEVEMENTS & BADGES                                 */}
      {/* ================================================================== */}
      {subView === 'badges' && (
        <BadgesView
          sections={sections}
          progress={progress}
          onSelectChapter={onSelectChapter}
          onStartQuiz={onStartQuiz}
        />
      )}

      {/* ================================================================== */}
      {/* 5. SUB-VIEW: PERSONAL NOTEBOOK                                     */}
      {/* ================================================================== */}
      {subView === 'notes' && (
        <NotebookView
          sections={sections}
          progress={progress}
          onSelectChapter={onSelectChapter}
          onSaveNote={onSaveNote}
        />
      )}

      {/* ================================================================== */}
      {/* 6. SUB-VIEW: EXAM ATTEMPTS HISTORY                                 */}
      {/* ================================================================== */}
      {subView === 'exam_history' && (
        <div className="space-y-4 text-right">
          <div className="p-4 rounded-2xl bg-white border border-[#E5E1EB] shadow-2xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-[#24243B]">
                کارنامه‌ها و سوابق آزمون‌های ورودی
              </h3>
              <button
                type="button"
                onClick={loadExamHistory}
                disabled={isLoadingExamHistory}
                className="px-2.5 py-1 rounded-lg bg-[#F7F5F0] hover:bg-[#EAE4FF] text-[#36345F] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingExamHistory ? 'animate-spin' : ''}`} />
                <span>بروزرسانی / تلاش مجدد</span>
              </button>
            </div>

            {examHistoryError && (
              <div className="p-3 rounded-xl bg-[#FFE5DC] border border-[#D9534F]/30 flex items-center justify-between gap-2 text-xs text-[#7F1D1D] font-bold">
                <span>{examHistoryError}</span>
                <button
                  type="button"
                  onClick={loadExamHistory}
                  className="px-3 py-1 rounded-lg bg-white text-[#24243B] font-extrabold cursor-pointer"
                >
                  تلاش مجدد
                </button>
              </div>
            )}

            {examHistory && examHistory.attempts.length > 0 ? (
              <div className="space-y-2.5">
                {examHistory.attempts.map((att) => {
                  const wPct = att.weightedScorePercent ?? att.rawScorePercent ?? 0;
                  const scaled = estimateKonkoorScaledScore(wPct);
                  return (
                    <div
                      key={att.id}
                      className="p-3.5 rounded-xl bg-[#F7F5F0] border border-[#E5E1EB] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <span className="text-xs sm:text-sm font-black text-[#24243B] block">
                          {att.blueprintTitle}
                        </span>
                        <span className="text-[11px] font-bold text-[#69697E] mt-0.5 block">
                          {att.status === 'in_progress'
                            ? `ناتمام (${toPersianDigits(att.totalQuestions)} سوال)`
                            : `تراز: ${toPersianDigits(
                                scaled.toLocaleString('en-US')
                              )} • درصد وزنی: ${toPersianDigits(wPct)}٪ • سوالات: ${toPersianDigits(
                                att.totalQuestions
                              )}`}
                        </span>
                      </div>

                      {onOpenExamSimulator && (
                        <button
                          type="button"
                          onClick={() => {
                            playDuoSound('click');
                            onOpenExamSimulator(att.id);
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-[#36345F] hover:bg-[#24243B] text-white text-xs font-bold cursor-pointer transition-colors self-start sm:self-auto min-h-[38px]"
                        >
                          مشاهده کارنامه
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center bg-[#F7F5F0] rounded-xl border border-dashed border-[#CFC9DA]">
                <p className="text-xs font-bold text-[#69697E]">
                  هنوز هیچ تلاشی در شبیه‌ساز آزمون ثبت نکرده‌اید.
                </p>
                <button
                  onClick={() => {
                    playDuoSound('click');
                    onStartQuiz();
                  }}
                  className="mt-3 px-4 py-2 rounded-xl bg-[#7056D8] text-white text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>ورود به مرکز آزمون</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 7. SUB-VIEW: ACADEMIC MENTOR & SUPPORT TICKETS                     */}
      {/* ================================================================== */}
      {subView === 'support' && (
        <SupportSystemView
          tickets={tickets}
          onAddTicket={onAddTicket}
        />
      )}

      <PrerequisiteInspectorModal
        isOpen={isPrerequisiteInspectorOpen}
        onClose={() => setIsPrerequisiteInspectorOpen(false)}
      />
    </div>
  );
};
