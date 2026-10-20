import React, { useState, useEffect } from 'react';
import { Section, Chapter, UserProgress } from '../types/psychology';
import { calculateUserAnalytics } from '../utils/adaptiveEngine';
import { BADGE_DEFINITIONS, evaluateBadgeProgress } from '../data/badgeDefinitions';
import { BadgeIcon } from './BadgeIcon';
import { AnalyticsView } from './AnalyticsView';
import { BadgesView } from './BadgesView';
import { NotebookView } from './NotebookView';
import { PrerequisiteInspectorModal } from './PrerequisiteInspectorModal';
import { PWAInstallButton } from './PWAInstallButton';
import { useAuth } from '../context/AuthContext';
import { getAudioMuted, toggleAudioMuted, playDuoSound } from '../utils/duoAudio';
import { toPersianDigits } from '../utils/persianDigits';
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
  Clock,
  Target,
  Search,
  SlidersHorizontal,
  Timer,
  Volume2,
  VolumeX,
  Activity,
  Code2,
  FileText,
  Bookmark,
  Pin,
  ChevronLeft,
  CheckCircle2,
  BookOpen,
} from 'lucide-react';

export type UserPanelSubView = 'overview' | 'analytics' | 'badges' | 'notes';

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
}

export const UserPanelView: React.FC<UserPanelViewProps> = ({
  sections,
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
}) => {
  const { currentUser, isAuthenticated, openGoogleSignInModal, setIsAccountModalOpen } = useAuth();
  const [subView, setSubView] = useState<UserPanelSubView>(initialSubView);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(getAudioMuted);
  const [isPrerequisiteInspectorOpen, setIsPrerequisiteInspectorOpen] = useState<boolean>(false);
  const [examHistory, setExamHistory] = useState<UserExamHistorySummary | null>(null);

  useEffect(() => {
    setSubView(initialSubView);
  }, [initialSubView]);

  useEffect(() => {
    fetchUserExamHistory()
      .then((res) => setExamHistory(res))
      .catch(() => {});
  }, [currentUser?.userId]);

  const handleSelectSubView = (next: UserPanelSubView) => {
    playDuoSound('click');
    setSubView(next);
    if (onSubViewChange) {
      onSubViewChange(next);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleMute = () => {
    const next = toggleAudioMuted();
    setIsAudioMuted(next);
    if (!next) {
      playDuoSound('click');
    }
  };

  const stats = calculateUserAnalytics(progress);
  const completedStagesMap = progress.completedStages || {};
  const completedStageNumbers = Object.keys(completedStagesMap).map(Number);
  const completedStageCount = completedStageNumbers.length;
  const verifiedStageCount = completedStageNumbers.filter((num) => {
    const rec = completedStagesMap[num];
    return Boolean(rec?.verified === true || rec?.source === 'online-verified');
  }).length;
  const offlineLocalStageCount = Math.max(0, completedStageCount - verifiedStageCount);

  const evaluatedBadges = BADGE_DEFINITIONS.map((b) =>
    evaluateBadgeProgress(b, progress, sections)
  );
  const unlockedBadges = evaluatedBadges.filter((b) => b.isUnlocked);

  const allChapters = sections.flatMap((s) => s.chapters);
  const savedNotesCount = Object.values(progress.chapterNotes || {}).filter(
    (t) => t && t.trim().length > 0
  ).length;
  const bookmarkedChaptersList = allChapters.filter((c) =>
    progress.bookmarkedChapters.includes(c.id)
  );
  const pinnedChaptersList = allChapters.filter((c) => progress.pinnedChapters.includes(c.id));

  const userXp =
    currentUser?.xp ??
    completedStageCount * 25 + (progress.completedChapters?.length || 0) * 20;

  return (
    <div className="space-y-6 pb-20">
      {/* ================================================================== */}
      {/* 1. USER PANEL HEADER & SUB-DESTINATION SWITCHER                    */}
      {/* ================================================================== */}
      <section aria-label="پنل کاربری و پایش عملکرد" className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-3 border-b border-[#E5E1EB]">
          <div>
            <span className="text-xs font-extrabold tracking-wide text-[#7056D8] block mb-1">
              پنل کاربری · پایش عملکرد، دستاوردها و ابزارهای مطالعه
            </span>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-[#24243B] leading-tight">
              ایستگاه شخصی و کارنامه تحصیلی
            </h1>
          </div>

          {/* Sub-view Switcher */}
          <div className="grid grid-cols-2 sm:inline-flex items-center p-1 rounded-2xl bg-white border border-[#E5E1EB] text-xs font-bold gap-1 w-full lg:w-auto">
            <button
              onClick={() => handleSelectSubView('overview')}
              className={`px-3.5 py-2 rounded-xl cursor-pointer transition-colors min-h-[44px] flex items-center justify-center gap-1.5 whitespace-nowrap ${
                subView === 'overview'
                  ? 'bg-[#36345F] text-white font-extrabold'
                  : 'text-[#69697E] hover:text-[#24243B]'
              }`}
            >
              <User className="w-3.5 h-3.5 shrink-0" />
              <span>نمای کلی پنل</span>
            </button>

            <button
              onClick={() => handleSelectSubView('analytics')}
              className={`px-3.5 py-2 rounded-xl cursor-pointer transition-colors min-h-[44px] flex items-center justify-center gap-1.5 whitespace-nowrap ${
                subView === 'analytics'
                  ? 'bg-[#3976E4] text-white font-extrabold'
                  : 'text-[#69697E] hover:text-[#24243B]'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 shrink-0" />
              <span>کارنامه و لیگ</span>
            </button>

            <button
              onClick={() => handleSelectSubView('badges')}
              className={`px-3.5 py-2 rounded-xl cursor-pointer transition-colors min-h-[44px] flex items-center justify-center gap-1.5 whitespace-nowrap ${
                subView === 'badges'
                  ? 'bg-[#E5A33D] text-[#24243B] font-extrabold'
                  : 'text-[#69697E] hover:text-[#24243B]'
              }`}
            >
              <Award className="w-3.5 h-3.5 shrink-0" />
              <span>دستاوردها ({toPersianDigits(unlockedBadges.length)})</span>
            </button>

            <button
              onClick={() => handleSelectSubView('notes')}
              className={`px-3.5 py-2 rounded-xl cursor-pointer transition-colors min-h-[44px] flex items-center justify-center gap-1.5 whitespace-nowrap ${
                subView === 'notes'
                  ? 'bg-[#EF786B] text-white font-extrabold'
                  : 'text-[#69697E] hover:text-[#24243B]'
              }`}
            >
              <BookMarked className="w-3.5 h-3.5 shrink-0" />
              <span>یادداشت‌ها ({toPersianDigits(savedNotesCount)})</span>
            </button>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 2. OVERVIEW MODE: 5 STRUCTURED MONITORING & MANAGEMENT SECTIONS    */}
      {/* ================================================================== */}
      {subView === 'overview' && (
        <div className="space-y-6">
          {/* SECTION 1: ACCOUNT & CLOUD SYNC STATUS */}
          <section
            aria-label="حساب کاربری و وضعیت همگام‌سازی"
            className="rounded-3xl bg-white border border-[#E5E1EB] p-5 sm:p-6 shadow-2xs space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E1EB]">
              <div className="flex items-center gap-3.5">
                {isAuthenticated && currentUser ? (
                  currentUser.picture && !currentUser.picture.includes('default-user') ? (
                    <img
                      src={currentUser.picture}
                      alt={currentUser.name}
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 rounded-2xl object-cover border border-[#E5E1EB] shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-[#36345F] text-white flex items-center justify-center text-xl font-black shrink-0">
                      {currentUser.avatar || '🎓'}
                    </div>
                  )
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-[#EAE4FF] text-[#36345F] flex items-center justify-center shrink-0 border border-[#7056D8]/25">
                    <User className="w-7 h-7 text-[#7056D8]" />
                  </div>
                )}

                <div className="text-right">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base sm:text-lg font-black text-[#24243B]">
                      {isAuthenticated && currentUser
                        ? currentUser.name
                        : 'حساب کاربری مهمان (ذخیره در مرورگر)'}
                    </h2>
                    <span
                      className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg ${
                        isOffline
                          ? 'bg-[#FFF0C8] text-[#5C3D0E]'
                          : isSyncingCloud
                          ? 'bg-[#E1ECFF] text-[#1E3A8A]'
                          : 'bg-[#DDF3E9] text-[#134E4A]'
                      }`}
                    >
                      {isOffline
                        ? 'حالت آفلاین'
                        : isSyncingCloud
                        ? 'در حال همگام‌سازی...'
                        : 'همگام‌سازی ابری آماده'}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-[#69697E] mt-1">
                    {isAuthenticated && currentUser
                      ? currentUser.email || 'متصل به حساب کاربری گوگل و جدول ملی'
                      : 'برای پشتیبان‌گیری ابری در تمام دستگاه‌ها و ثبت رسمی رکوردها، وارد حساب گوگل شوید.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {isAuthenticated && currentUser ? (
                  <button
                    onClick={() => {
                      playDuoSound('click');
                      setIsAccountModalOpen(true);
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#EAE4FF] hover:bg-[#DDD3FF] text-[#36345F] text-xs font-extrabold cursor-pointer transition-colors min-h-[44px]"
                  >
                    مدیریت حساب کاربری
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      playDuoSound('click');
                      openGoogleSignInModal('signin');
                    }}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#7056D8] hover:bg-[#5E43C4] text-white text-xs font-extrabold cursor-pointer transition-colors min-h-[44px]"
                  >
                    ورود یا ثبت‌نام با گوگل
                  </button>
                )}
              </div>
            </div>

            {/* Stage Provenance Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl bg-[#F7F5F0] border border-[#E5E1EB] flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-[#69697E] block">
                    کل دروس تکمیل‌شده
                  </span>
                  <span className="text-sm font-black text-[#24243B] mt-0.5 block tabular-nums">
                    {toPersianDigits(completedStageCount)} از ۱۰۰ درس
                  </span>
                </div>
                <CheckCircle2 className="w-5 h-5 text-[#7056D8]" />
              </div>

              <div className="p-3.5 rounded-2xl bg-[#DDF3E9]/65 border border-[#389D77]/30 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-[#134E4A] block">
                    تأیید شده در سرور (ثبت در لیگ)
                  </span>
                  <span className="text-sm font-black text-[#134E4A] mt-0.5 block tabular-nums">
                    {toPersianDigits(verifiedStageCount)} درس
                  </span>
                </div>
                <ShieldCheck className="w-5 h-5 text-[#389D77]" />
              </div>

              <div className="p-3.5 rounded-2xl bg-[#FFF0C8]/75 border border-[#E5A33D]/40 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-[#5C3D0E] block">
                    ذخیره محلی/آفلاین
                  </span>
                  <span className="text-sm font-black text-[#5C3D0E] mt-0.5 block tabular-nums">
                    {toPersianDigits(offlineLocalStageCount)} درس
                  </span>
                </div>
                <CloudOff className="w-5 h-5 text-[#C98A27]" />
              </div>
            </div>

            {offlineLocalStageCount > 0 && (
              <div className="p-3.5 rounded-2xl bg-[#FFF0C8] border border-[#E5A33D] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs font-bold text-[#5C3D0E]">
                  شما {toPersianDigits(offlineLocalStageCount)} درس تکمیل‌شده در حالت آفلاین دارید که می‌توانید در بخش یادگیری به صورت آنلاین تأیید کنید.
                </p>
                <button
                  onClick={() => {
                    playDuoSound('click');
                    onNavigateToLearning();
                  }}
                  className="px-4 py-2 rounded-xl bg-[#24243B] hover:bg-[#36345F] text-white text-xs font-extrabold cursor-pointer shrink-0 min-h-[44px]"
                >
                  مشاهده و تأیید در بخش یادگیری
                </button>
              </div>
            )}
          </section>

          {/* SECTION 2: PERFORMANCE & MONITORING SUMMARY */}
          <section
            aria-label="خلاصه عملکرد و کارنامه"
            className="rounded-3xl bg-white border border-[#E5E1EB] p-5 sm:p-6 shadow-2xs space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E5E1EB]">
              <div>
                <h2 className="text-base font-black text-[#24243B]">
                  پایش عملکرد و آمار یادگیری
                </h2>
                <p className="text-xs font-medium text-[#69697E] mt-0.5">
                  شاخص‌های کمی مطالعه، دقت پاسخ‌گویی و وضعیت تسلط بر مباحث
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    playDuoSound('click');
                    onOpenReportModal();
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#F7F5F0] hover:bg-[#EAE4FF]/50 border border-[#CFC9DA] text-[#24243B] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors min-h-[44px]"
                >
                  <FileText className="w-4 h-4 text-[#7056D8]" />
                  <span>کارنامه رسمی قابل چاپ</span>
                </button>

                <button
                  onClick={() => handleSelectSubView('analytics')}
                  className="px-4 py-2 rounded-xl bg-[#3976E4] hover:bg-[#2B62C7] text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors min-h-[44px]"
                >
                  <Trophy className="w-4 h-4" />
                  <span>مشاهده کارنامه کامل و لیگ</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-[#EAE4FF]/55 border border-[#7056D8]/25">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#36345F]">امتیاز تجربه کل</span>
                  <Zap className="w-4 h-4 text-[#7056D8] fill-[#7056D8]" />
                </div>
                <div className="text-lg font-black text-[#24243B] mt-2 tabular-nums">
                  {toPersianDigits(userXp)} <span className="text-xs font-bold">XP</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#FFF0C8]/65 border border-[#E5A33D]/35">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#5C3D0E]">پیوستگی مطالعه</span>
                  <Flame className="w-4 h-4 text-[#E5A33D] fill-[#E5A33D]" />
                </div>
                <div className="text-lg font-black text-[#24243B] mt-2 tabular-nums">
                  {toPersianDigits(progress.streakDays)} روز
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#E1ECFF]/65 border border-[#3976E4]/25">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1E3A8A]">دقت پاسخ‌گویی</span>
                  <Target className="w-4 h-4 text-[#3976E4]" />
                </div>
                <div className="text-lg font-black text-[#24243B] mt-2 tabular-nums">
                  {toPersianDigits(stats.accuracyRate)}٪
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#DDF3E9]/65 border border-[#149D9A]/25">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#134E4A]">زمان مطالعه ثبت‌شده</span>
                  <Clock className="w-4 h-4 text-[#149D9A]" />
                </div>
                <div className="text-lg font-black text-[#24243B] mt-2 tabular-nums">
                  {toPersianDigits(progress.totalStudyMinutes)} دقیقه
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 2B: ENTRANCE EXAM SIMULATOR & KARNAMEH HISTORY */}
          <section
            aria-label="سوابق شبیه‌ساز آزمون و کارنامه کنکور"
            className="rounded-3xl bg-white border border-[#E5E1EB] p-5 sm:p-6 shadow-2xs space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E5E1EB]">
              <div>
                <h2 className="text-base font-black text-[#24243B]">
                  سوابق شبیه‌ساز آزمون و تراز کنکور
                </h2>
                <p className="text-xs font-medium text-[#69697E] mt-0.5">
                  پایش نتایج آزمون‌های جامع زمان‌دار، تراز تخمینی و کارنامه‌های تحلیلی
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  playDuoSound('click');
                  if (onOpenExamSimulator) onOpenExamSimulator();
                  else onStartQuiz();
                }}
                className="px-4 py-2 rounded-xl bg-[#5842BC] hover:bg-[#4935A3] text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors min-h-[44px]"
              >
                <Trophy className="w-4 h-4" />
                <span>ورود به شبیه‌ساز کنکور</span>
              </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-[#EAE4FF]/55 border border-[#7056D8]/25">
                <span className="text-xs font-bold text-[#36345F]">آزمون‌های تکمیل‌شده</span>
                <div className="text-lg font-black text-[#24243B] mt-1.5 tabular-nums">
                  {toPersianDigits(examHistory?.stats.totalCompletedExams ?? 0)} آزمون
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#DDF3E9]/65 border border-[#149D9A]/25">
                <span className="text-xs font-bold text-[#134E4A]">بهترین تراز کنکور</span>
                <div className="text-lg font-black text-[#24243B] mt-1.5 tabular-nums">
                  {toPersianDigits(
                    (examHistory?.stats.totalCompletedExams
                      ? estimateKonkoorScaledScore(examHistory.stats.bestRawScorePercent)
                      : 0
                    ).toLocaleString('en-US')
                  )}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#FFF0C8]/65 border border-[#E5A33D]/35">
                <span className="text-xs font-bold text-[#5C3D0E]">میانگین درصد کل</span>
                <div className="text-lg font-black text-[#24243B] mt-1.5 tabular-nums">
                  {toPersianDigits(examHistory?.stats.averageRawScorePercent ?? 0)}٪
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#E1ECFF]/65 border border-[#3976E4]/25">
                <span className="text-xs font-bold text-[#1E3A8A]">مبحث نیازمند تقویت</span>
                <div className="text-xs sm:text-sm font-black text-[#24243B] mt-1.5 truncate">
                  {examHistory?.stats.weakestSectionTitle ?? 'پس از اولین آزمون'}
                </div>
              </div>
            </div>

            {examHistory && examHistory.attempts.length > 0 && (
              <div className="space-y-2 pt-1">
                <span className="text-xs font-extrabold text-[#69697E] block">
                  آخرین کارنامه‌های ثبت‌شده:
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {examHistory.attempts.slice(0, 4).map((att) => {
                    const wPct = att.weightedScorePercent ?? att.rawScorePercent ?? 0;
                    const scaled = estimateKonkoorScaledScore(wPct);
                    return (
                      <div
                        key={att.id}
                        className="p-3 rounded-2xl bg-[#F7F5F0] border border-[#E5E1EB] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-black text-[#24243B] truncate">
                            {att.blueprintTitle}
                          </div>
                          <div className="text-[11px] font-bold text-[#69697E] mt-0.5">
                            {att.status === 'in_progress'
                              ? `ناتمام (${toPersianDigits(att.totalQuestions)} سوال)`
                              : `تراز: ${toPersianDigits(
                                  scaled.toLocaleString('en-US')
                                )} • درصد وزنی: ${toPersianDigits(wPct)}٪`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            playDuoSound('click');
                            if (onOpenExamSimulator) {
                              onOpenExamSimulator(
                                att.status === 'in_progress' ? undefined : att.id
                              );
                            } else {
                              onStartQuiz();
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#EAE4FF] border border-[#CFC9DA] text-[11px] font-extrabold text-[#24243B] shrink-0 min-h-[38px]"
                        >
                          {att.status === 'in_progress' ? 'ادامه آزمون' : 'مشاهده کارنامه'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* SECTION 3: ACHIEVEMENTS & PERSONAL STUDY ASSETS (2-Column Split on Desktop) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Achievements Card */}
            <section
              aria-label="مدال‌ها و دستاوردهای علمی"
              className="rounded-3xl bg-white border border-[#E5E1EB] p-5 sm:p-6 shadow-2xs flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-[#E5E1EB]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[#FFF0C8] flex items-center justify-center">
                      <Award className="w-5 h-5 text-[#C98A27]" />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-black text-[#24243B]">
                        مدال‌ها و دستاوردهای علمی
                      </h3>
                      <span className="text-[11px] font-bold text-[#69697E]">
                        {toPersianDigits(unlockedBadges.length)} از{' '}
                        {toPersianDigits(evaluatedBadges.length)} نشان کسب‌شده
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5 my-4">
                  {evaluatedBadges.slice(0, 6).map((bInfo) => (
                    <div
                      key={bInfo.badge.id}
                      className={`flex flex-col items-center text-center p-2.5 rounded-2xl border ${
                        bInfo.isUnlocked
                          ? 'bg-[#FFF0C8]/50 border-[#E5A33D]/50'
                          : 'bg-[#F7F5F0] border-[#E5E1EB]'
                      }`}
                    >
                      <BadgeIcon
                        type={bInfo.badge.iconType}
                        isUnlocked={bInfo.isUnlocked}
                        size={32}
                      />
                      <span className="text-[10px] font-extrabold text-[#24243B] mt-1.5 line-clamp-1">
                        {bInfo.badge.title}
                      </span>
                      <span className="text-[9px] font-bold text-[#69697E] mt-0.5 tabular-nums">
                        {bInfo.isUnlocked ? 'کسب‌شده' : `${toPersianDigits(bInfo.progressPercent)}٪`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleSelectSubView('badges')}
                className="w-full py-2.5 px-4 rounded-xl bg-[#F7F5F0] hover:bg-[#FFF0C8]/60 border border-[#E5E1EB] text-[#24243B] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors min-h-[44px]"
              >
                <span>مشاهده تالار کامل دستاوردها</span>
                <ChevronLeft className="w-4 h-4 text-[#69697E]" />
              </button>
            </section>

            {/* Personal Study Assets Card */}
            <section
              aria-label="دارایی‌های شخصی مطالعه"
              className="rounded-3xl bg-white border border-[#E5E1EB] p-5 sm:p-6 shadow-2xs flex flex-col justify-between gap-4"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#E5E1EB]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[#FFE5DC] flex items-center justify-center">
                      <BookMarked className="w-5 h-5 text-[#EF786B]" />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-black text-[#24243B]">
                        اندوخته‌ها و یادداشت‌های شخصی
                      </h3>
                      <span className="text-[11px] font-bold text-[#69697E]">
                        دسترسی سریع به خلاصه‌نویسی‌ها و فصول نشان‌گذاری‌شده
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-2xl bg-[#F7F5F0] border border-[#E5E1EB] flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-[#69697E] block">
                        یادداشت‌های ثبت‌شده
                      </span>
                      <span className="text-sm font-black text-[#24243B] mt-0.5 block tabular-nums">
                        {toPersianDigits(savedNotesCount)} فصل
                      </span>
                    </div>
                    <BookMarked className="w-4 h-4 text-[#EF786B]" />
                  </div>

                  <div className="p-3 rounded-2xl bg-[#F7F5F0] border border-[#E5E1EB] flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-[#69697E] block">
                        فصول نشان‌شده
                      </span>
                      <span className="text-sm font-black text-[#24243B] mt-0.5 block tabular-nums">
                        {toPersianDigits(bookmarkedChaptersList.length)} فصل
                      </span>
                    </div>
                    <Bookmark className="w-4 h-4 text-[#E5A33D]" />
                  </div>

                  <div className="p-3 rounded-2xl bg-[#F7F5F0] border border-[#E5E1EB] flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-[#69697E] block">
                        فصول سنجاق‌شده
                      </span>
                      <span className="text-sm font-black text-[#24243B] mt-0.5 block tabular-nums">
                        {toPersianDigits(pinnedChaptersList.length)} فصل
                      </span>
                    </div>
                    <Pin className="w-4 h-4 text-[#149D9A]" />
                  </div>

                  <div className="p-3 rounded-2xl bg-[#F7F5F0] border border-[#E5E1EB] flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-[#69697E] block">
                        جلسات پومودورو
                      </span>
                      <span className="text-sm font-black text-[#24243B] mt-0.5 block tabular-nums">
                        {toPersianDigits(progress.totalPomodoroSessionsCompleted || 0)} جلسه
                      </span>
                    </div>
                    <Timer className="w-4 h-4 text-[#7056D8]" />
                  </div>
                </div>

                {(pinnedChaptersList.length > 0 || bookmarkedChaptersList.length > 0) && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-extrabold text-[#69697E] block">
                      فصول منتخب شما برای مرور سریع:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[...pinnedChaptersList, ...bookmarkedChaptersList]
                        .filter((v, i, a) => a.findIndex((t) => t.id === v.id) === i)
                        .slice(0, 3)
                        .map((chap) => (
                          <button
                            key={chap.id}
                            onClick={() => {
                              playDuoSound('click');
                              onSelectChapter(chap);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[#F7F5F0] hover:bg-[#EAE4FF]/50 border border-[#E5E1EB] text-xs font-bold text-[#24243B] flex items-center gap-1.5 cursor-pointer min-h-[40px]"
                          >
                            <BookOpen className="w-3.5 h-3.5 text-[#7056D8]" />
                            <span className="truncate max-w-[180px]">{chap.title}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={() => handleSelectSubView('notes')}
                  className="py-2.5 px-3.5 rounded-xl bg-[#FFE5DC]/75 hover:bg-[#FFE5DC] border border-[#EF786B]/35 text-[#7C2D12] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors min-h-[44px]"
                >
                  <BookMarked className="w-4 h-4 text-[#EF786B]" />
                  <span>دفترچه یادداشت و واژگان</span>
                </button>

                <button
                  onClick={() => {
                    playDuoSound('click');
                    setIsPrerequisiteInspectorOpen(true);
                  }}
                  className="py-2.5 px-3.5 rounded-xl bg-[#F7F5F0] hover:bg-[#FFF0C8]/60 border border-[#E5E1EB] text-[#24243B] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors min-h-[44px]"
                >
                  <ShieldCheck className="w-4 h-4 text-[#C98A27]" />
                  <span>نقشه پیش‌نیازها و سطوح</span>
                </button>
              </div>
            </section>
          </div>

          {/* SECTION 4: STUDY TOOLS, PREFERENCES & SYSTEM UTILITIES */}
          <section
            aria-label="ابزارهای مطالعه و تنظیمات سامانه"
            className="rounded-3xl bg-white border border-[#E5E1EB] p-5 sm:p-6 shadow-2xs space-y-4"
          >
            <div className="pb-3 border-b border-[#E5E1EB]">
              <h2 className="text-base font-black text-[#24243B]">
                ابزارهای مطالعه و تنظیمات شخصی‌سازی
              </h2>
              <p className="text-xs font-medium text-[#69697E] mt-0.5">
                دسترسی مستقیم به تایمر تمرکز، جستجوی پیشرفته، تنظیمات نمایش و نصب اپلیکیشن
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <button
                onClick={() => {
                  playDuoSound('click');
                  onOpenPomodoro();
                }}
                className="p-4 rounded-2xl bg-[#F7F5F0] hover:bg-[#DDF3E9]/50 border border-[#E5E1EB] text-right flex items-center gap-3 cursor-pointer transition-colors min-h-[64px]"
              >
                <div className="w-10 h-10 rounded-xl bg-[#DDF3E9] text-[#149D9A] flex items-center justify-center shrink-0">
                  <Timer className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-extrabold text-[#24243B] block">
                    تایمر مطالعه پومودورو
                  </span>
                  <span className="text-[11px] font-medium text-[#69697E]">
                    مدیریت جلسات تمرکز ۲۵ دقیقه‌ای
                  </span>
                </div>
              </button>

              <button
                onClick={() => {
                  playDuoSound('click');
                  onOpenSearch();
                }}
                className="p-4 rounded-2xl bg-[#F7F5F0] hover:bg-[#E1ECFF]/50 border border-[#E5E1EB] text-right flex items-center gap-3 cursor-pointer transition-colors min-h-[64px]"
              >
                <div className="w-10 h-10 rounded-xl bg-[#E1ECFF] text-[#3976E4] flex items-center justify-center shrink-0">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-extrabold text-[#24243B] block">
                    جستجوی پیشرفته علمی
                  </span>
                  <span className="text-[11px] font-medium text-[#69697E]">
                    جستجو در سرفصل‌ها، واژگان و مفاهیم
                  </span>
                </div>
              </button>

              <button
                onClick={() => {
                  playDuoSound('click');
                  onOpenSettings();
                }}
                className="p-4 rounded-2xl bg-[#F7F5F0] hover:bg-[#EAE4FF]/50 border border-[#E5E1EB] text-right flex items-center gap-3 cursor-pointer transition-colors min-h-[64px]"
              >
                <div className="w-10 h-10 rounded-xl bg-[#EAE4FF] text-[#36345F] flex items-center justify-center shrink-0">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-extrabold text-[#24243B] block">
                    تنظیمات مطالعه و نمایش
                  </span>
                  <span className="text-[11px] font-medium text-[#69697E]">
                    هدف روزانه، اندازه قلم و مدیریت داده‌ها
                  </span>
                </div>
              </button>

              <button
                onClick={handleToggleMute}
                className="p-4 rounded-2xl bg-[#F7F5F0] hover:bg-[#FFF0C8]/50 border border-[#E5E1EB] text-right flex items-center gap-3 cursor-pointer transition-colors min-h-[64px]"
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isAudioMuted
                      ? 'bg-[#E5E1EB] text-[#69697E]'
                      : 'bg-[#DDF3E9] text-[#389D77]'
                  }`}
                >
                  {isAudioMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </div>
                <div>
                  <span className="text-xs font-extrabold text-[#24243B] block">
                    بازخورد صوتی برنامه
                  </span>
                  <span className="text-[11px] font-medium text-[#69697E]">
                    وضعیت فعلی: {isAudioMuted ? 'بی‌صدا (خاموش)' : 'فعال (روشن)'}
                  </span>
                </div>
              </button>

              <button
                onClick={() => {
                  playDuoSound('click');
                  onOpenTrafficAnalytics();
                }}
                className="p-4 rounded-2xl bg-[#F7F5F0] hover:bg-[#DDF3E9]/50 border border-[#E5E1EB] text-right flex items-center gap-3 cursor-pointer transition-colors min-h-[64px]"
              >
                <div className="w-10 h-10 rounded-xl bg-[#DDF3E9] text-[#389D77] flex items-center justify-center shrink-0">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-extrabold text-[#24243B] block">
                    وضعیت و ترافیک سامانه
                  </span>
                  <span className="text-[11px] font-medium text-[#69697E]">
                    {toPersianDigits(onlineCount)} پژوهشگر آنلاین در این لحظه
                  </span>
                </div>
              </button>

              <button
                onClick={() => {
                  playDuoSound('click');
                  onOpenSourceCode();
                }}
                className="p-4 rounded-2xl bg-[#F7F5F0] hover:bg-[#EAE4FF]/50 border border-[#E5E1EB] text-right flex items-center gap-3 cursor-pointer transition-colors min-h-[64px]"
              >
                <div className="w-10 h-10 rounded-xl bg-[#EAE4FF] text-[#7056D8] flex items-center justify-center shrink-0">
                  <Code2 className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-extrabold text-[#24243B] block">
                    سورس‌کد و معماری سامانه
                  </span>
                  <span className="text-[11px] font-medium text-[#69697E]">
                    مشاهده ساختار فنی <span className="ltr-term">React + TypeScript</span>
                  </span>
                </div>
              </button>
            </div>

            <div className="pt-2">
              <PWAInstallButton variant="sheet" />
            </div>
          </section>
        </div>
      )}

      {/* ================================================================== */}
      {/* 3. SUB-VIEW: ANALYTICS & NATIONAL LEAGUE (`AnalyticsView`)         */}
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
      {/* 4. SUB-VIEW: ACHIEVEMENTS & BADGES (`BadgesView`)                  */}
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
      {/* 5. SUB-VIEW: PERSONAL NOTEBOOK (`NotebookView`)                    */}
      {/* ================================================================== */}
      {subView === 'notes' && (
        <NotebookView
          sections={sections}
          progress={progress}
          onSelectChapter={onSelectChapter}
          onSaveNote={onSaveNote}
        />
      )}

      <PrerequisiteInspectorModal
        isOpen={isPrerequisiteInspectorOpen}
        onClose={() => setIsPrerequisiteInspectorOpen(false)}
      />
    </div>
  );
};
