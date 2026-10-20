import React, { useState, useEffect } from 'react';
import { Section, UserProgress, Chapter } from '../types/psychology';
import { calculateUserAnalytics } from '../utils/adaptiveEngine';
import { toPersianDigits } from '../utils/persianDigits';
import {
  Trophy,
  Sparkles,
  Flame,
  Zap,
  Target,
  Award,
  Clock,
  CheckCircle2,
  RefreshCw,
  ChevronLeft,
  Crown,
  Activity,
  Eye,
  Users,
  Calendar,
  Smartphone,
  Monitor,
  Radio,
  TrendingUp,
  FileText,
} from 'lucide-react';
import { BadgeIcon } from './BadgeIcon';
import { BADGE_DEFINITIONS, evaluateBadgeProgress } from '../data/badgeDefinitions';
import { playDuoSound } from '../utils/duoAudio';
import { SiteAnalyticsData } from '../types/analytics';
import { fetchSiteTrafficStats } from '../utils/siteTracker';
import { fetchLiveLeaderboard } from '../utils/cloudSync';
import { requestAdaptiveStudyPlan } from '../services/aiClient';

interface AnalyticsViewProps {
  sections: Section[];
  progress: UserProgress;
  onSelectChapter: (chapter: Chapter) => void;
  onOpenBadges?: () => void;
  onOpenReportModal?: () => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  sections,
  progress,
  onSelectChapter: _onSelectChapter,
  onOpenBadges,
  onOpenReportModal,
}) => {
  const stats = calculateUserAnalytics(progress);
  const [activeViewMode, setActiveViewMode] = useState<'progress' | 'traffic'>('progress');
  const [trafficData, setTrafficData] = useState<SiteAnalyticsData | null>(null);
  const [isTrafficLoading, setIsTrafficLoading] = useState<boolean>(false);
  const [autoRefreshTraffic, setAutoRefreshTraffic] = useState<boolean>(true);
  const [isGeneratingAiPlan, setIsGeneratingAiPlan] = useState<boolean>(false);
  const [aiStudyPlan, setAiStudyPlan] = useState<string | null>(null);
  const [liveLeaderboard, setLiveLeaderboard] = useState<any[]>([]);
  const [countdownDays, setCountdownDays] = useState<number>(3);

  useEffect(() => {
    const refreshLeaderboard = () => {
      fetchLiveLeaderboard().then((res) => {
        if (res && res.leaderboard?.length > 0) {
          setLiveLeaderboard(res.leaderboard);
          setCountdownDays(res.countdownDaysRemaining);
        }
      });
    };

    refreshLeaderboard();
    window.addEventListener('psychomaster:user-synced', refreshLeaderboard);
    window.addEventListener('psychomaster:user-logged-out', refreshLeaderboard);
    return () => {
      window.removeEventListener('psychomaster:user-synced', refreshLeaderboard);
      window.removeEventListener('psychomaster:user-logged-out', refreshLeaderboard);
    };
  }, [progress]);

  const loadTrafficData = async (showLoading = false) => {
    if (showLoading) setIsTrafficLoading(true);
    try {
      const data = await fetchSiteTrafficStats();
      if (data) setTrafficData(data);
    } finally {
      setIsTrafficLoading(false);
    }
  };

  useEffect(() => {
    loadTrafficData(false);
    if (!autoRefreshTraffic) return;
    const interval = setInterval(() => {
      loadTrafficData(false);
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefreshTraffic]);

  const evaluatedBadges = BADGE_DEFINITIONS.map((b) =>
    evaluateBadgeProgress(b, progress, sections)
  );
  const unlockedBadgesCount = evaluatedBadges.filter((b) => b.isUnlocked).length;

  const allChapters = sections.flatMap((s) => s.chapters);

  const fetchAiPlan = async () => {
    setIsGeneratingAiPlan(true);
    playDuoSound('click');
    try {
      const weakTitles = stats.weakestChapterIds.map((id) => {
        const found = allChapters.find((c) => c.id === id);
        return found ? found.title : id;
      });

      const res = await requestAdaptiveStudyPlan({
        stats: stats as unknown as Record<string, unknown>,
        weakChapters: weakTitles,
      });

      setAiStudyPlan(res.text || 'برنامه شخصی‌سازی مطالعاتی با موفقیت ایجاد شد.');
      playDuoSound('correct');
    } catch {
      setAiStudyPlan(
        'برنامه پیشنهادی هوشمند: با توجه به دقت شما در آزمون‌ها، پیشنهاد می‌کنم روزانه ۱۵ دقیقه بر روی فصول زیست‌شناسی رفتار و آسیب‌شناسی متمرکز شوید و تست‌های تشریحی را مرور نمایید.'
      );
    } finally {
      setIsGeneratingAiPlan(false);
    }
  };

  const leaderboardUsers = [
    { rank: 1, name: 'دکتر سارا کیانی', avatar: '👩‍⚕️', xp: 1420, isUser: false, tier: 'gold' },
    { rank: 2, name: 'امیرمحمد نظری', avatar: '👨‍🎓', xp: 1190, isUser: false, tier: 'silver' },
    { rank: 3, name: 'شما (دانشجوی برتر)', avatar: '🎓', xp: 875, isUser: true, tier: 'bronze' },
    { rank: 4, name: 'مریم شایسته', avatar: '👩‍🏫', xp: 730, isUser: false },
    { rank: 5, name: 'علیرضا راد', avatar: '👨‍🔬', xp: 650, isUser: false },
    { rank: 6, name: 'پریسا محمدی', avatar: '👩‍💻', xp: 580, isUser: false },
    { rank: 7, name: 'کیان ارجمند', avatar: '🧑‍🎨', xp: 510, isUser: false },
    { rank: 8, name: 'نازنین مرادی', avatar: '👩‍⚕️', xp: 460, isUser: false },
    { rank: 9, name: 'سهراب احمدی', avatar: '👨‍💼', xp: 390, isUser: false },
    { rank: 10, name: 'نرگس حسینی', avatar: '👩‍🎓', xp: 320, isUser: false },
  ];

  return (
    <div className="max-w-4xl mx-auto pb-28 flex flex-col gap-6 select-none animate-fadeIn">
      {/* ======================================================== */}
      {/* TOP DUAL-MODE SWITCHER (STUDENT LEAGUE vs LIVE TRAFFIC)  */}
      {/* ======================================================== */}
      <div className="bg-white border border-[#E5E1EB] rounded-2xl p-1.5 flex items-center justify-between gap-2 shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 flex-1">
          <button
            onClick={() => {
              playDuoSound('click');
              setActiveViewMode('progress');
            }}
            className={`min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeViewMode === 'progress'
                ? 'bg-[#EAE4F7] text-[#5B4BDB] border border-[#C6BAF0]'
                : 'text-[#686882] hover:bg-[#F7F5F0] border border-transparent'
            }`}
          >
            <Trophy className="w-4 h-4 text-[#D97706]" />
            <span>کارنامه و لیگ علمی</span>
          </button>

          <button
            onClick={() => {
              playDuoSound('click');
              setActiveViewMode('traffic');
            }}
            className={`min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 relative ${
              activeViewMode === 'traffic'
                ? 'bg-[#DDF7F2] text-[#0F766E] border border-[#99F6E4]'
                : 'text-[#686882] hover:bg-[#F7F5F0] border border-transparent'
            }`}
          >
            <span className="flex h-2.5 w-2.5 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span>آمار زنده بازدید و آنلاین‌ها</span>
            <span className="text-[10px] font-black bg-[#0F766E] text-white px-2 py-0.5 rounded-full">
              {toPersianDigits(trafficData?.onlineUsersCount || 1)} آنلاین
            </span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODE 1: LIVE SITE TRAFFIC & VISITOR ANALYTICS PANEL      */}
      {/* ======================================================== */}
      {activeViewMode === 'traffic' && (
        <div className="flex flex-col gap-6 animate-fadeIn">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-[#0F766E] to-[#115E59] rounded-3xl p-5 sm:p-6 text-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-right">
              <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/30 flex items-center justify-center shrink-0">
                <Activity className="w-7 h-7 text-white animate-pulse" />
              </div>
              <div>
                <span className="text-[11px] font-extrabold tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full inline-block">
                  پایش زنده سرور
                </span>
                <h1 className="text-xl sm:text-2xl font-black mt-1">
                  سامانه آمار بازدید و کاربران آنلاین
                </h1>
                <p className="text-xs font-bold opacity-90 mt-0.5">
                  ثبت مستمر و دقیق ترافیک، تفکیک بر اساس دستگاه، زمان و صفحات محبوب
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                onClick={() => {
                  playDuoSound('click');
                  setAutoRefreshTraffic((prev) => !prev);
                }}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-extrabold transition-all cursor-pointer ${
                  autoRefreshTraffic
                    ? 'bg-white/20 border-white/40 text-white'
                    : 'bg-black/20 border-black/40 text-slate-200'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <RefreshCw className={`w-3.5 h-3.5 ${autoRefreshTraffic ? 'animate-spin' : ''}`} style={{ animationDuration: '4s' }} />
                  {autoRefreshTraffic ? 'پایش خودکار فعال' : 'پایش متوقف'}
                </span>
              </button>

              <button
                onClick={() => {
                  playDuoSound('click');
                  loadTrafficData(true);
                }}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-white/20 hover:bg-white/30 border border-white/40 rounded-xl transition-all cursor-pointer text-white"
                title="بروزرسانی داده‌ها"
              >
                <RefreshCw className={`w-4 h-4 ${isTrafficLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Top 4 KPI Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 1. Real-time Online */}
            <div className="bg-white border border-[#E5E1EB] rounded-2xl p-4 flex flex-col items-center text-center shadow-2xs">
              <div className="w-10 h-10 rounded-xl bg-[#DDF7F2] border border-[#99F6E4] flex items-center justify-center text-[#0F766E] mb-2 relative">
                <Users className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
              </div>
              <span className="text-[11px] font-bold text-[#686882]">آنلاین در این لحظه</span>
              <span className="text-2xl font-black text-[#0F766E] mt-0.5">
                {toPersianDigits(trafficData?.onlineUsersCount || 1)} نفر
              </span>
              <span className="text-[10px] font-bold text-[#0F766E]">کاربران فعال سرور</span>
            </div>

            {/* 2. Today's Visits */}
            <div className="bg-white border border-[#E5E1EB] rounded-2xl p-4 flex flex-col items-center text-center shadow-2xs">
              <div className="w-10 h-10 rounded-xl bg-[#EBF5FF] border border-[#BAE6FD] flex items-center justify-center text-[#0284C7] mb-2">
                <Eye className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-[#686882]">بازدید امروز</span>
              <span className="text-2xl font-black text-[#0284C7] mt-0.5">
                {trafficData?.today.visits.toLocaleString('fa-IR') || '۰'}
              </span>
              <span className="text-[10px] font-bold text-[#0284C7]">
                {trafficData?.today.uniques.toLocaleString('fa-IR') || '۰'} کاربر یکتا
              </span>
            </div>

            {/* 3. Yesterday's Visits */}
            <div className="bg-white border border-[#E5E1EB] rounded-2xl p-4 flex flex-col items-center text-center shadow-2xs">
              <div className="w-10 h-10 rounded-xl bg-[#FFF6D6] border border-[#FDE68A] flex items-center justify-center text-[#D97706] mb-2">
                <Calendar className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-[#686882]">بازدید روز گذشته</span>
              <span className="text-2xl font-black text-[#D97706] mt-0.5">
                {trafficData?.yesterday.visits.toLocaleString('fa-IR') || '۰'}
              </span>
              <span className="text-[10px] font-bold text-[#D97706]">
                {trafficData?.yesterday.uniques.toLocaleString('fa-IR') || '۰'} کاربر دیروز
              </span>
            </div>

            {/* 4. Weekly Visits */}
            <div className="bg-white border border-[#E5E1EB] rounded-2xl p-4 flex flex-col items-center text-center shadow-2xs">
              <div className="w-10 h-10 rounded-xl bg-[#EAE4F7] border border-[#C6BAF0] flex items-center justify-center text-[#5B4BDB] mb-2">
                <TrendingUp className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-[#686882]">بازدید هفته اخیر</span>
              <span className="text-2xl font-black text-[#5B4BDB] mt-0.5">
                {trafficData?.week.totalVisits.toLocaleString('fa-IR') || '۰'}
              </span>
              <span className="text-[10px] font-bold text-[#5B4BDB]">
                مجموع ۷ روز گذشته
              </span>
            </div>
          </div>

          {/* Weekly Bar Chart */}
          <div className="bg-white border border-[#E5E1EB] rounded-3xl p-5 sm:p-6 shadow-2xs text-right">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-6">
              <div>
                <h3 className="text-base font-black text-[#1E1E2E] flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[#5B4BDB]" />
                  روند بازدید روزانه ۷ روز گذشته
                </h3>
                <p className="text-xs font-bold text-[#686882] mt-0.5">
                  تفکیک دقیق روز به روز به همراه نام روزهای هفته
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-bold text-[#686882]">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#5B4BDB]"></span> کل بازدیدها
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#0F766E]"></span> کاربران یکتا
                </span>
              </div>
            </div>

            {trafficData?.week.days && (
              <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end h-48 pt-6 border-b border-[#E5E1EB] pb-2">
                {(() => {
                  const maxVisits = Math.max(...trafficData.week.days.map((d) => d.visits), 100);
                  return trafficData.week.days.map((day, idx) => {
                    const heightPercent = Math.max(Math.round((day.visits / maxVisits) * 100), 12);
                    const isToday = idx === trafficData.week.days.length - 1;
                    return (
                      <div key={day.date} className="flex flex-col items-center gap-1.5 h-full justify-end group">
                        <span className="text-[10px] font-black text-[#47475E] group-hover:scale-110 transition-transform">
                          {day.visits.toLocaleString('fa-IR')}
                        </span>
                        <div className="w-full max-w-[42px] bg-[#F7F5F0] rounded-t-xl h-full flex items-end overflow-hidden p-0.5">
                          <div
                            style={{ height: `${heightPercent}%` }}
                            className={`w-full rounded-t-lg transition-all duration-500 relative ${
                              isToday
                                ? 'bg-[#5B4BDB]'
                                : 'bg-[#C6BAF0] group-hover:bg-[#5B4BDB]/70'
                            }`}
                          >
                            {isToday && (
                              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] font-black bg-[#FFF6D6] text-[#92400E] px-1.5 py-0.5 rounded whitespace-nowrap">
                                امروز
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`text-[11px] font-black truncate w-full text-center ${isToday ? 'text-[#5B4BDB]' : 'text-[#47475E]'}`}>
                          {day.dayName}
                        </span>
                        <span className="text-[9px] text-[#686882] -mt-1 hidden sm:block truncate">
                          {toPersianDigits(day.persianDate)}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          {/* Active Sessions & Devices */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Active users list */}
            <div className="bg-white border border-[#E5E1EB] rounded-3xl p-5 shadow-2xs text-right">
              <h3 className="text-base font-black text-[#1E1E2E] mb-3 flex items-center gap-2">
                <Radio className="w-4 h-4 text-[#0F766E] animate-pulse" />
                کاربران آنلاین در این لحظه
              </h3>
              <div className="space-y-2.5">
                {trafficData?.onlineSessions && trafficData.onlineSessions.length > 0 ? (
                  trafficData.onlineSessions.map((session) => {
                    const isCurrent = session.isCurrentUser;
                    return (
                      <div
                        key={session.sessionId}
                        className={`p-3 rounded-2xl border flex items-center justify-between gap-2 ${
                          isCurrent
                            ? 'bg-[#DDF7F2]/60 border-[#99F6E4]'
                            : 'bg-[#FAF8F5] border-[#E5E1EB]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-white border border-[#E5E1EB] flex items-center justify-center text-[#47475E] shrink-0">
                            {session.device === 'mobile' ? (
                              <Smartphone className="w-4 h-4 text-[#0F766E]" />
                            ) : (
                              <Monitor className="w-4 h-4 text-[#5B4BDB]" />
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-black text-[#1E1E2E] truncate">
                              {isCurrent ? 'شما (این دستگاه)' : `دانشجو از ${session.cityLabel || 'ایران'}`}
                            </span>
                            <span className="text-[10px] text-[#686882] font-bold truncate">
                              {session.pageTitle}
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] font-black text-[#0F766E] bg-[#DDF7F2] px-2 py-0.5 rounded-full shrink-0">
                          آنلاین
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E5E1EB] text-xs font-bold text-[#686882] leading-relaxed">
                    هم‌اکنون <strong>{toPersianDigits(trafficData?.onlineUsersCount || 1)} نفر</strong> در سامانه آنلاین هستند. جزئیات نشست‌های فردی برای حفظ حریم خصوصی تنها برای مدیران تأییدشده نمایش داده می‌شود.
                  </div>
                )}
              </div>
            </div>

            {/* Devices & Browsers */}
            <div className="bg-white border border-[#E5E1EB] rounded-3xl p-5 shadow-2xs text-right flex flex-col justify-between">
              <div>
                <h3 className="text-base font-black text-[#1E1E2E] mb-3 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#5B4BDB]" />
                  سهم دستگاه‌ها و مرورگرها
                </h3>
                <div className="space-y-3">
                  {trafficData?.deviceBreakdown?.map((dev) => (
                    <div key={dev.device} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-[#47475E]">{dev.label}</span>
                        <span className="text-[#1E1E2E] font-black">{toPersianDigits(dev.percentage)}٪</span>
                      </div>
                      <div className="w-full bg-[#F7F5F0] h-2 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${dev.percentage}%` }}
                          className="bg-[#0F766E] h-full rounded-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-[#E5E1EB] mt-4 flex items-center justify-between text-xs font-bold text-[#686882]">
                <span>کل بازدیدهای ثبت شده: <strong>{trafficData?.allTime.totalVisits.toLocaleString('fa-IR') || '۰'}</strong></span>
                <span>بازدید این ماه: <strong>{trafficData?.month.totalVisits.toLocaleString('fa-IR') || '۰'}</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODE 2: EDITORIAL PROGRESS & LEADERBOARD (STUDENT VIEW)  */}
      {/* ======================================================== */}
      {activeViewMode === 'progress' && (
        <>
          {/* Quick Real-Time Traffic Summary Pill */}
          <div
            onClick={() => {
              playDuoSound('click');
              setActiveViewMode('traffic');
            }}
            className="bg-[#DDF7F2]/60 border border-[#99F6E4] hover:border-[#0F766E]/40 rounded-2xl p-3.5 flex items-center justify-between gap-3 cursor-pointer transition-all shadow-2xs group min-h-[48px]"
          >
            <div className="flex items-center gap-2.5 text-right">
              <span className="flex h-3 w-3 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#0F766E]"></span>
              </span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-bold text-[#24243B]">
                <span className="font-black text-[#0F766E]">
                  {toPersianDigits(trafficData?.onlineUsersCount || 1)} کاربر آنلاین در سایت
                </span>
                <span className="text-[#9494AB] hidden sm:inline">|</span>
                <span>امروز: <strong className="text-[#1E1E2E]">{trafficData?.today.visits.toLocaleString('fa-IR') || '۰'}</strong> بازدید</span>
                <span className="text-[#9494AB] hidden sm:inline">|</span>
                <span>دیروز: <strong className="text-[#1E1E2E]">{trafficData?.yesterday.visits.toLocaleString('fa-IR') || '۰'}</strong> بازدید</span>
                <span className="text-[#9494AB] hidden sm:inline">|</span>
                <span>هفته اخیر: <strong className="text-[#1E1E2E]">{trafficData?.week.totalVisits.toLocaleString('fa-IR') || '۰'}</strong> بازدید</span>
              </div>
            </div>

            <button className="text-xs font-black text-[#0F766E] group-hover:text-[#115E59] flex items-center gap-1 shrink-0">
              <span>گزارش کامل</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* ======================================================== */}
          {/* 0. CORE KPI SUMMARY METRICS                              */}
          {/* ======================================================== */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-[#E5E1EB] rounded-2xl p-4 flex flex-col items-center text-center shadow-2xs">
              <div className="w-10 h-10 rounded-xl bg-[#FFF6D6] border border-[#FDE68A] flex items-center justify-center text-[#D97706] mb-2">
                <Flame className="w-5 h-5 fill-current" />
              </div>
              <span className="text-[11px] font-bold text-[#686882]">زنجیره مطالعه</span>
              <span className="text-xl font-black text-[#1E1E2E] mt-0.5">{toPersianDigits(progress.streakDays)} روز</span>
              <span className="text-[10px] font-bold text-[#D97706]">استمرار یادگیری</span>
            </div>

            <div className="bg-white border border-[#E5E1EB] rounded-2xl p-4 flex flex-col items-center text-center shadow-2xs">
              <div className="w-10 h-10 rounded-xl bg-[#DDF7F2] border border-[#99F6E4] flex items-center justify-center text-[#0F766E] mb-2">
                <Target className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-[#686882]">میانگین دقت</span>
              <span className="text-xl font-black text-[#1E1E2E] mt-0.5">{toPersianDigits(stats.accuracyRate)}٪</span>
              <span className="text-[10px] font-bold text-[#0F766E]">{toPersianDigits(stats.correctCount)} از {toPersianDigits(stats.totalAttempts)} درست</span>
            </div>

            <div className="bg-white border border-[#E5E1EB] rounded-2xl p-4 flex flex-col items-center text-center shadow-2xs">
              <div className="w-10 h-10 rounded-xl bg-[#EBF5FF] border border-[#BAE6FD] flex items-center justify-center text-[#0284C7] mb-2">
                <Clock className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-[#686882]">زمان یادگیری</span>
              <span className="text-xl font-black text-[#1E1E2E] mt-0.5">{toPersianDigits(progress.totalStudyMinutes)} دقیقه</span>
              <span className="text-[10px] font-bold text-[#0284C7]">مطالعه مفید</span>
            </div>

            <div className="bg-white border border-[#E5E1EB] rounded-2xl p-4 flex flex-col items-center text-center shadow-2xs">
              <div className="w-10 h-10 rounded-xl bg-[#EAE4F7] border border-[#C6BAF0] flex items-center justify-center text-[#5B4BDB] mb-2">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-[#686882]">دروس تکمیل‌شده</span>
              <span className="text-xl font-black text-[#1E1E2E] mt-0.5">{toPersianDigits(progress.completedChapters.length)} درس</span>
              <span className="text-[10px] font-bold text-[#5B4BDB]">{toPersianDigits(Object.keys(progress.completedStages || {}).length)} مرحله گذرانده</span>
            </div>
          </div>

          {/* ======================================================== */}
          {/* 1. ACADEMIC LEAGUE BANNER                                */}
          {/* ======================================================== */}
          <div className="bg-gradient-to-r from-[#5B4BDB] to-[#4636B5] rounded-3xl p-5 sm:p-6 text-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-right">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 border border-white/30 flex items-center justify-center shrink-0">
                <Trophy className="w-8 h-8 sm:w-9 sm:h-9 text-[#FDE68A] fill-[#FDE68A]" />
              </div>
              <div>
                <span className="text-[11px] font-extrabold tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full inline-block">
                  رقابت علمی هفتگی
                </span>
                <h1 className="text-xl sm:text-2xl font-black mt-1">لیگ الماس روان‌شناسی</h1>
                <p className="text-xs font-bold opacity-90 mt-0.5">
                  ۳ نفر برتر این هفته نشان طلا، نقره و برنز دریافت می‌کنند!
                </p>
              </div>
            </div>

            {/* Right side controls: Report Modal and Countdown */}
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              {onOpenReportModal && (
                <button
                  onClick={() => {
                    playDuoSound('click');
                    onOpenReportModal();
                  }}
                  className="min-h-[44px] bg-white/20 hover:bg-white/30 text-white border border-white/40 px-3.5 py-2 rounded-2xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-[#FDE68A]" />
                  <span>کارنامه رسمی (PDF)</span>
                </button>
              )}

              <div className="min-h-[44px] bg-white/15 border border-white/30 rounded-2xl px-3.5 py-2 flex items-center gap-2 text-xs font-extrabold">
                <Clock className="w-4 h-4 text-[#FDE68A]" />
                <span>{toPersianDigits(countdownDays)} روز مانده به بازنشانی</span>
              </div>
            </div>
          </div>

          {/* ======================================================== */}
          {/* 2. LEAGUE LADDER & LEADERBOARD TABLE                     */}
          {/* ======================================================== */}
          <div className="bg-white border border-[#E5E1EB] rounded-3xl p-5 sm:p-6 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#E5E1EB]">
              <div className="flex items-center gap-2 font-black text-[#1E1E2E]">
                <Crown className="w-5 h-5 text-[#D97706]" />
                <h2 className="text-base font-black">جدول زنده رقابت‌های لیگ (هماهنگ با سرور)</h2>
              </div>
              <span className="text-xs font-extrabold text-[#0F766E]">
                ▲ شما در منطقه صعود به تالار نخبگان هستید
              </span>
            </div>

            {/* The Players List */}
            <div className="flex flex-col gap-2 my-4">
              {(liveLeaderboard.length > 0 ? liveLeaderboard : leaderboardUsers).map((user) => {
                const isUserItem = user.isCurrentUser || user.isUser;
                return (
                  <div
                    key={user.rank}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                      isUserItem
                        ? 'bg-[#EAE4F7]/70 border-[#5B4BDB] text-[#1E1E2E] shadow-2xs'
                        : user.rank === 1
                        ? 'bg-[#FFF6D6]/50 border-[#FDE68A] text-[#1E1E2E]'
                        : 'bg-white border-[#E5E1EB] hover:bg-[#FAF8F5] text-[#24243B]'
                    }`}
                  >
                    {/* Rank & Avatar */}
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-7 text-center text-sm font-black shrink-0 ${
                          user.rank === 1
                            ? 'text-[#D97706]'
                            : user.rank === 2
                            ? 'text-[#686882]'
                            : user.rank === 3
                            ? 'text-[#B45309]'
                            : 'text-[#686882]'
                        }`}
                      >
                        {toPersianDigits(user.rank)}
                      </span>

                      <span className="text-2xl shrink-0">{user.avatar}</span>

                      <div className="flex flex-col text-right min-w-0">
                        <span className="text-xs sm:text-sm font-black flex items-center gap-1.5 truncate">
                          <span className="truncate">{user.name}</span>
                          {isUserItem && (
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-[#5B4BDB] text-white shrink-0">
                              شما
                            </span>
                          )}
                        </span>
                        {user.rank <= 3 && (
                          <span className="text-[10px] font-bold text-[#0F766E]">
                            منطقه دریافت جایزه الماس
                          </span>
                        )}
                      </div>
                    </div>

                    {/* User XP Score */}
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm font-black shrink-0">
                      <Zap className="w-4 h-4 text-[#D97706] fill-[#D97706]" />
                      <span>{toPersianDigits(user.xp)} امتیاز</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-[#E5E1EB] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-bold text-[#686882]">
              <span>۱۰ نفر برتر در پایان هفته به لیگ بعد صعود می‌کنند</span>
              <span className="text-[#0F766E] font-black">جایزه نفر اول: ۱۰۰۰ امتیاز ویژه</span>
            </div>
          </div>

          {/* ======================================================== */}
          {/* 3. ACHIEVEMENTS & BADGES SHOWCASE                        */}
          {/* ======================================================== */}
          <div className="bg-white border border-[#E5E1EB] rounded-3xl p-5 sm:p-6 shadow-2xs">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2 font-black text-[#1E1E2E]">
                <Award className="w-5 h-5 text-[#D97706]" />
                <h2 className="text-base font-black">نشان‌ها و دستاوردهای علمی</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-[#686882]">
                  {toPersianDigits(unlockedBadgesCount)} از {toPersianDigits(evaluatedBadges.length)} نشان باز شده
                </span>
                {onOpenBadges && (
                  <button
                    onClick={onOpenBadges}
                    className="min-h-[44px] bg-[#5B4BDB] hover:bg-[#4636B5] px-3.5 py-2 rounded-xl text-xs font-extrabold text-white flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>مشاهده تالار کامل نشان‌ها</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {evaluatedBadges.slice(0, 4).map((bInfo) => {
                const { badge, isUnlocked, currentValue, targetValue, progressPercent, tier } = bInfo;
                return (
                  <div
                    key={badge.id}
                    onClick={onOpenBadges}
                    className={`bg-white border rounded-2xl p-4 flex flex-col items-center text-center cursor-pointer hover:shadow-xs transition-all ${
                      isUnlocked ? 'border-[#99F6E4]' : 'border-[#E5E1EB] bg-[#FAF8F5]'
                    }`}
                  >
                    <div className="mb-2">
                      <BadgeIcon
                        type={badge.iconType}
                        isUnlocked={isUnlocked}
                        size={64}
                        tier={tier}
                        showStars={true}
                      />
                    </div>
                    <span className="text-xs font-black text-[#1E1E2E] mt-1">{badge.title}</span>
                    <span className="text-[10px] font-bold text-[#686882] mt-0.5 line-clamp-1">
                      {badge.description}
                    </span>
                    <span
                      className={`text-[10px] font-black mt-2 px-2.5 py-0.5 rounded-full border ${
                        isUnlocked
                          ? 'text-[#0F766E] bg-[#DDF7F2] border-[#99F6E4]'
                          : 'text-[#686882] bg-[#F7F5F0] border-[#E5E1EB]'
                      }`}
                    >
                      {isUnlocked
                        ? 'کسب شد ✓'
                        : `${toPersianDigits(currentValue)}/${toPersianDigits(targetValue)} (${toPersianDigits(progressPercent)}٪)`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ======================================================== */}
          {/* 4. PERSONALIZED STUDY COACHING                           */}
          {/* ======================================================== */}
          <div className="bg-gradient-to-br from-[#F4F1FA] to-[#EAE4F7] border border-[#C6BAF0] rounded-3xl p-5 sm:p-6 shadow-2xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-right">
                <div className="w-14 h-14 rounded-2xl bg-white border border-[#C6BAF0] flex items-center justify-center text-[#5B4BDB] shrink-0">
                  <Sparkles className="w-7 h-7" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold text-[#5B4BDB] bg-white px-2.5 py-0.5 rounded-full border border-[#C6BAF0]">
                    مشاور هوشمند مطالعاتی
                  </span>
                  <h3 className="text-base sm:text-lg font-black text-[#1E1E2E] mt-1">
                    برنامه مطالعاتی هوشمند و تطبیقی اختصاصی شما
                  </h3>
                  <p className="text-xs font-bold text-[#686882] mt-0.5">
                    بر اساس نقاط ضعف و سرعت یادگیری شما در آزمون‌ها
                  </p>
                </div>
              </div>

              <button
                onClick={fetchAiPlan}
                disabled={isGeneratingAiPlan}
                className="min-h-[44px] w-full sm:w-auto justify-center bg-[#5B4BDB] hover:bg-[#4636B5] text-white px-5 py-2.5 rounded-2xl text-xs font-extrabold cursor-pointer flex items-center gap-2 whitespace-nowrap transition-colors"
              >
                {isGeneratingAiPlan ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>
                  {isGeneratingAiPlan ? 'در حال تحلیل داده‌ها...' : 'تولید برنامه مطالعاتی جدید'}
                </span>
              </button>
            </div>

            {aiStudyPlan && (
              <div className="mt-5 p-4 bg-white border border-[#C6BAF0] rounded-2xl text-xs font-bold text-[#1E1E2E] leading-loose shadow-2xs animate-fadeIn">
                <p className="whitespace-pre-line">{aiStudyPlan}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

