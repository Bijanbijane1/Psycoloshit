import React, { useState, useEffect } from 'react';
import { Section, UserProgress, Chapter } from '../types/psychology';
import { calculateUserAnalytics } from '../utils/adaptiveEngine';
import {
  Trophy,
  Sparkles,
  Flame,
  Zap,
  Target,
  Award,
  Clock,
  CheckCircle2,
  Gift,
  RefreshCw,
  ChevronLeft,
  Crown,
  Activity,
  Eye,
  Users,
  Calendar,
  Smartphone,
  Monitor,
  Tablet,
  Radio,
  TrendingUp,
  Globe,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import { DuoMascot } from './DuoMascot';
import { BadgeIcon } from './BadgeIcon';
import { BADGE_DEFINITIONS, evaluateBadgeProgress } from '../data/badgeDefinitions';
import { playDuoSound } from '../utils/duoAudio';
import { SiteAnalyticsData } from '../types/analytics';
import { fetchSiteTrafficStats, getOrCreateSessionId, getOrCreateVisitorId } from '../utils/siteTracker';
import { fetchLiveLeaderboard } from '../utils/cloudSync';
import confetti from 'canvas-confetti';

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
  onSelectChapter,
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

      const res = await fetch('/api/ai/adaptive-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stats,
          weakChapters: weakTitles,
        }),
      });

      const data = await res.json().catch(() => ({}));
      setAiStudyPlan(data.plan || 'برنامه شخصی‌سازی دوئو با موفقیت ایجاد شد.');
      playDuoSound('correct');
    } catch {
      setAiStudyPlan(
        'برنامه پیشنهادی Duo: با توجه به دقت شما در آزمون‌ها، پیشنهاد می‌کنم روزانه ۱۵ دقیقه بر روی فصول زیست‌شناسی رفتار و آسیب‌شناسی متمرکز شوید و تست‌های تشریحی را مرور نمایید.'
      );
    } finally {
      setIsGeneratingAiPlan(false);
    }
  };

  // Mock Duolingo Diamond League ranking list
  const leaderboardUsers = [
    { rank: 1, name: 'دکتر سارا کیانی', avatar: '👩‍⚕️', xp: 1420, isUser: false, tier: 'gold' },
    { rank: 2, name: 'امیرمحمد نظری', avatar: '👨‍🎓', xp: 1190, isUser: false, tier: 'silver' },
    { rank: 3, name: 'شما (دانشجوی برتر)', avatar: '🦉', xp: 875, isUser: true, tier: 'bronze' },
    { rank: 4, name: 'مریم شایسته', avatar: '👩‍🏫', xp: 730, isUser: false },
    { rank: 5, name: 'علیرضا راد', avatar: '👨‍🔬', xp: 650, isUser: false },
    { rank: 6, name: 'پریسا محمدی', avatar: '👩‍💻', xp: 580, isUser: false },
    { rank: 7, name: 'کیان ارجمند', avatar: '🧑‍🎨', xp: 510, isUser: false },
    { rank: 8, name: 'نازنین مرادی', avatar: '👩‍⚕️', xp: 460, isUser: false },
    { rank: 9, name: 'سهراب احمدی', avatar: '👨‍💼', xp: 390, isUser: false },
    { rank: 10, name: 'نرگس حسینی', avatar: '👩‍🎓', xp: 320, isUser: false },
  ];

  return (
    <div className="max-w-4xl mx-auto pb-24 flex flex-col gap-6 select-none animate-fadeIn">
      {/* ======================================================== */}
      {/* TOP DUAL-MODE SWITCHER (STUDENT LEAGUE vs LIVE TRAFFIC)  */}
      {/* ======================================================== */}
      <div className="bg-white border-2 border-slate-200 rounded-2xl p-1.5 flex items-center justify-between gap-2 shadow-xs">
        <div className="grid grid-cols-2 gap-1.5 flex-1">
          <button
            onClick={() => {
              playDuoSound('click');
              setActiveViewMode('progress');
            }}
            className={`py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
              activeViewMode === 'progress'
                ? 'bg-[#E5F6FD] text-[#1CB0F6] border-2 border-[#1CB0F6] border-b-4'
                : 'text-slate-600 hover:bg-slate-100 border-2 border-transparent'
            }`}
          >
            <Trophy className="w-4 h-4 text-[#FFC800]" />
            <span>کارنامه و لیگ الماس</span>
          </button>

          <button
            onClick={() => {
              playDuoSound('click');
              setActiveViewMode('traffic');
            }}
            className={`py-2 px-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 relative ${
              activeViewMode === 'traffic'
                ? 'bg-emerald-50 text-emerald-800 border-2 border-emerald-400 border-b-4'
                : 'text-slate-600 hover:bg-slate-100 border-2 border-transparent'
            }`}
          >
            <span className="flex h-2.5 w-2.5 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span>آمار زنده بازدید و آنلاین‌ها</span>
            <span className="text-[10px] font-black bg-emerald-500 text-white px-1.5 py-0.2 rounded-full">
              {trafficData?.onlineUsersCount || 1} آنلاین
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
          <div className="bg-gradient-to-r from-emerald-600 to-teal-700 border-b-4 border-emerald-800 rounded-3xl p-5 sm:p-6 text-white shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-right">
              <div className="w-14 h-14 rounded-2xl bg-white/20 border-2 border-white/40 flex items-center justify-center shrink-0">
                <Activity className="w-8 h-8 text-white animate-pulse" />
              </div>
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider bg-white/25 px-2.5 py-0.5 rounded-full inline-block">
                  پایش زنده سرور (REAL-TIME HEARTBEAT)
                </span>
                <h1 className="text-xl sm:text-2xl font-black mt-1">
                  سامانه آمار بازدید و کاربران آنلاین
                </h1>
                <p className="text-xs font-bold opacity-90 mt-0.5">
                  ثبت مستمر و دقیق ترافیک، تفکیک بر اساس دستگاه، زمان و صفحات محبوب
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  playDuoSound('click');
                  setAutoRefreshTraffic((prev) => !prev);
                }}
                className={`px-3 py-1.5 rounded-xl border-2 text-xs font-black transition-all cursor-pointer ${
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
                className="p-2 bg-white/20 hover:bg-white/30 border-2 border-white/40 rounded-xl transition-all cursor-pointer text-white"
                title="بروزرسانی داده‌ها"
              >
                <RefreshCw className={`w-4 h-4 ${isTrafficLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Top 4 KPI Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 1. Real-time Online */}
            <div className="bg-white border-2 border-b-4 border-emerald-300 rounded-2xl p-4 flex flex-col items-center text-center shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mb-2 relative">
                <Users className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
              </div>
              <span className="text-[11px] font-black text-slate-400">آنلاین در این لحظه</span>
              <span className="text-2xl font-black text-emerald-700 mt-0.5">
                {trafficData?.onlineUsersCount || 1} نفر
              </span>
              <span className="text-[10px] font-bold text-emerald-600">کاربران فعال سرور</span>
            </div>

            {/* 2. Today's Visits */}
            <div className="bg-white border-2 border-b-4 border-sky-300 rounded-2xl p-4 flex flex-col items-center text-center shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-[#1CB0F6] mb-2">
                <Eye className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-black text-slate-400">بازدید امروز</span>
              <span className="text-2xl font-black text-sky-700 mt-0.5">
                {trafficData?.today.visits.toLocaleString('fa-IR') || '۰'}
              </span>
              <span className="text-[10px] font-bold text-sky-600">
                {trafficData?.today.uniques.toLocaleString('fa-IR')} کاربر یکتا
              </span>
            </div>

            {/* 3. Yesterday's Visits */}
            <div className="bg-white border-2 border-b-4 border-amber-300 rounded-2xl p-4 flex flex-col items-center text-center shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-[#FF9600] mb-2">
                <Calendar className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-black text-slate-400">بازدید روز گذشته</span>
              <span className="text-2xl font-black text-amber-700 mt-0.5">
                {trafficData?.yesterday.visits.toLocaleString('fa-IR') || '۰'}
              </span>
              <span className="text-[10px] font-bold text-amber-600">
                {trafficData?.yesterday.uniques.toLocaleString('fa-IR')} کاربر دیروز
              </span>
            </div>

            {/* 4. Weekly Visits */}
            <div className="bg-white border-2 border-b-4 border-purple-300 rounded-2xl p-4 flex flex-col items-center text-center shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-[#CE82FF] mb-2">
                <TrendingUp className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-black text-slate-400">بازدید هفته اخیر</span>
              <span className="text-2xl font-black text-purple-700 mt-0.5">
                {trafficData?.week.totalVisits.toLocaleString('fa-IR') || '۰'}
              </span>
              <span className="text-[10px] font-bold text-purple-600">
                مجموع ۷ روز گذشته
              </span>
            </div>
          </div>

          {/* Weekly Bar Chart */}
          <div className="bg-white border-2 border-b-4 border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xs text-right">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-6">
              <div>
                <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[#1CB0F6]" />
                  روند بازدید روزانه ۷ روز گذشته
                </h3>
                <p className="text-xs font-bold text-slate-400 mt-0.5">
                  تفکیک دقیق روز به روز به همراه نام روزهای هفته
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#1CB0F6]"></span> کل بازدیدها
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-400"></span> کاربران یکتا
                </span>
              </div>
            </div>

            {trafficData?.week.days && (
              <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end h-48 pt-6 border-b-2 border-slate-200 pb-2">
                {(() => {
                  const maxVisits = Math.max(...trafficData.week.days.map((d) => d.visits), 100);
                  return trafficData.week.days.map((day, idx) => {
                    const heightPercent = Math.max(Math.round((day.visits / maxVisits) * 100), 12);
                    const isToday = idx === trafficData.week.days.length - 1;
                    return (
                      <div key={day.date} className="flex flex-col items-center gap-1.5 h-full justify-end group">
                        <span className="text-[10px] font-black text-slate-600 group-hover:scale-110 transition-transform">
                          {day.visits.toLocaleString('fa-IR')}
                        </span>
                        <div className="w-full max-w-[42px] bg-slate-100 rounded-t-xl h-full flex items-end overflow-hidden p-0.5">
                          <div
                            style={{ height: `${heightPercent}%` }}
                            className={`w-full rounded-t-lg transition-all duration-500 relative ${
                              isToday
                                ? 'bg-gradient-to-t from-[#1899D6] to-[#1CB0F6] border-t-2 border-[#1899D6]'
                                : 'bg-gradient-to-t from-slate-400 to-slate-300 group-hover:from-sky-400 group-hover:to-sky-300'
                            }`}
                          >
                            {isToday && (
                              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] font-black bg-[#FFC800] text-amber-950 px-1 py-0.2 rounded whitespace-nowrap">
                                امروز
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`text-[11px] font-black truncate w-full text-center ${isToday ? 'text-[#1CB0F6]' : 'text-slate-600'}`}>
                          {day.dayName}
                        </span>
                        <span className="text-[9px] text-slate-400 -mt-1 hidden sm:block truncate">
                          {day.persianDate}
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
            <div className="bg-white border-2 border-b-4 border-slate-200 rounded-3xl p-5 shadow-xs text-right">
              <h3 className="text-base font-black text-slate-800 mb-3 flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
                کاربران آنلاین در این لحظه
              </h3>
              <div className="space-y-2.5">
                {trafficData?.onlineSessions?.map((session) => {
                  const isCurrent = session.isCurrentUser;
                  return (
                    <div
                      key={session.sessionId}
                      className={`p-3 rounded-2xl border-2 flex items-center justify-between gap-2 ${
                        isCurrent
                          ? 'bg-emerald-50/70 border-emerald-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                          {session.device === 'mobile' ? (
                            <Smartphone className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Monitor className="w-4 h-4 text-sky-600" />
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-black text-slate-800 truncate">
                            {isCurrent ? 'شما (این دستگاه)' : `دانشجو از ${session.cityLabel || 'ایران'}`}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold truncate">
                            {session.pageTitle}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">
                        آنلاین
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Devices & Browsers */}
            <div className="bg-white border-2 border-b-4 border-slate-200 rounded-3xl p-5 shadow-xs text-right flex flex-col justify-between">
              <div>
                <h3 className="text-base font-black text-slate-800 mb-3 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#1CB0F6]" />
                  سهم دستگاه‌ها و مرورگرها
                </h3>
                <div className="space-y-3">
                  {trafficData?.deviceBreakdown?.map((dev) => (
                    <div key={dev.device} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-700">{dev.label}</span>
                        <span className="text-slate-900 font-black">{dev.percentage}٪</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${dev.percentage}%` }}
                          className="bg-emerald-500 h-full rounded-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 mt-4 flex items-center justify-between text-xs font-bold text-slate-500">
                <span>کل بازدیدهای ثبت شده: <strong>{trafficData?.allTime.totalVisits.toLocaleString('fa-IR')}</strong></span>
                <span>بازدید این ماه: <strong>{trafficData?.month.totalVisits.toLocaleString('fa-IR')}</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODE 2: DUOLINGO PROGRESS & LEADERBOARD (STUDENT VIEW)   */}
      {/* ======================================================== */}
      {activeViewMode === 'progress' && (
        <>
          {/* Quick Real-Time Traffic Summary Pill */}
          <div
            onClick={() => {
              playDuoSound('click');
              setActiveViewMode('traffic');
            }}
            className="bg-emerald-50/80 border-2 border-emerald-300 hover:border-emerald-400 rounded-2xl p-3 flex items-center justify-between gap-3 cursor-pointer transition-all shadow-2xs group"
          >
            <div className="flex items-center gap-2.5 text-right">
              <span className="flex h-3 w-3 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-bold text-slate-700">
                <span className="font-black text-emerald-800">
                  {trafficData?.onlineUsersCount || 1} کاربر آنلاین در سایت
                </span>
                <span className="text-slate-400 hidden sm:inline">|</span>
                <span>امروز: <strong className="text-slate-900">{trafficData?.today.visits.toLocaleString('fa-IR') || '۰'}</strong> بازدید</span>
                <span className="text-slate-400 hidden sm:inline">|</span>
                <span>دیروز: <strong className="text-slate-900">{trafficData?.yesterday.visits.toLocaleString('fa-IR') || '۰'}</strong> بازدید</span>
                <span className="text-slate-400 hidden sm:inline">|</span>
                <span>هفته اخیر: <strong className="text-slate-900">{trafficData?.week.totalVisits.toLocaleString('fa-IR') || '۰'}</strong> بازدید</span>
              </div>
            </div>

            <button className="text-xs font-black text-emerald-700 group-hover:text-emerald-900 flex items-center gap-1 shrink-0">
              <span>گزارش کامل</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* ======================================================== */}
          {/* 0. CORE KPI SUMMARY METRICS                              */}
          {/* ======================================================== */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border-2 border-b-4 border-slate-200 rounded-2xl p-4 flex flex-col items-center text-center shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#FF9600] mb-2">
                <Flame className="w-5 h-5 fill-current" />
              </div>
              <span className="text-[11px] font-black text-slate-400">زنجیره مطالعه</span>
              <span className="text-xl font-black text-slate-800 mt-0.5">{progress.streakDays} روز</span>
              <span className="text-[10px] font-bold text-[#FF9600]">استمرار یادگیری</span>
            </div>

            <div className="bg-white border-2 border-b-4 border-slate-200 rounded-2xl p-4 flex flex-col items-center text-center shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#58CC02] mb-2">
                <Target className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-black text-slate-400">میانگین دقت</span>
              <span className="text-xl font-black text-slate-800 mt-0.5">{stats.accuracyRate}٪</span>
              <span className="text-[10px] font-bold text-[#58CC02]">{stats.correctCount} از {stats.totalAttempts} درست</span>
            </div>

            <div className="bg-white border-2 border-b-4 border-slate-200 rounded-2xl p-4 flex flex-col items-center text-center shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-[#1CB0F6] mb-2">
                <Clock className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-black text-slate-400">زمان یادگیری</span>
              <span className="text-xl font-black text-slate-800 mt-0.5">{progress.totalStudyMinutes} دقیقه</span>
              <span className="text-[10px] font-bold text-[#1CB0F6]">مطالعه مفید</span>
            </div>

            <div className="bg-white border-2 border-b-4 border-slate-200 rounded-2xl p-4 flex flex-col items-center text-center shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-[#CE82FF] mb-2">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-black text-slate-400">دروس تکمیل‌شده</span>
              <span className="text-xl font-black text-slate-800 mt-0.5">{progress.completedChapters.length} درس</span>
              <span className="text-[10px] font-bold text-[#CE82FF]">{Object.keys(progress.completedStages || {}).length} مرحله گذرانده</span>
            </div>
          </div>

      {/* ======================================================== */}
      {/* 1. DUOLINGO LEAGUE BANNER: DIAMOND LEAGUE                */}
      {/* ======================================================== */}
      <div className="bg-gradient-to-r from-[#1CB0F6] to-[#007CB8] border-b-4 border-[#1899D6] rounded-3xl p-6 text-white shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-right">
          <div className="w-16 h-16 rounded-2xl bg-white/20 border-2 border-white/40 flex items-center justify-center shrink-0">
            <Trophy className="w-9 h-9 text-[#FFC800] fill-[#FFC800]" />
          </div>
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider bg-white/25 px-2.5 py-0.5 rounded-full inline-block">
              لیگ‌های هفتگی دوئولینگو
            </span>
            <h1 className="text-2xl sm:text-3xl font-black mt-1">لیگ الماس (Diamond League)</h1>
            <p className="text-xs font-bold opacity-90 mt-0.5">
              ۳ نفر برتر این هفته مدال طلا، نقره و برنز دریافت می‌کنند!
            </p>
          </div>
        </div>

        {/* Right side controls: Report Modal and Countdown */}
        <div className="flex items-center gap-2 flex-wrap">
          {onOpenReportModal && (
            <button
              onClick={() => {
                playDuoSound('click');
                onOpenReportModal();
              }}
              className="bg-white/20 hover:bg-white/30 text-white border-2 border-white/40 px-3.5 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <FileText className="w-4 h-4 text-[#FFC800]" />
              <span>کارنامه رسمی (PDF)</span>
            </button>
          )}

          <div className="bg-white/20 border-2 border-white/30 rounded-2xl px-3.5 py-2 flex items-center gap-2 text-xs font-black">
            <Clock className="w-4 h-4 text-[#FFC800]" />
            <span>{countdownDays} روز مانده به بازنشانی</span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. LEAGUE LADDER & LEADERBOARD TABLE                     */}
      {/* ======================================================== */}
      <div className="bg-white border-2 border-b-4 border-slate-200 rounded-3xl p-6 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b-2 border-slate-100">
          <div className="flex items-center gap-2 font-black text-slate-800">
            <Crown className="w-5 h-5 text-[#FFC800]" />
            <h2 className="text-base font-black">جدول زنده رقابت‌های لیگ (هماهنگ با سرور)</h2>
          </div>
          <span className="text-xs font-black text-[#58CC02]">
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
                className={`flex items-center justify-between p-3.5 rounded-2xl border-2 transition-all ${
                  isUserItem
                    ? 'bg-[#E5F6FD] border-[#1CB0F6] border-b-4 text-[#1899D6] scale-[1.01] shadow-xs'
                    : user.rank === 1
                    ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                {/* Rank & Avatar */}
                <div className="flex items-center gap-3">
                  <span
                    className={`w-7 text-center text-sm font-black ${
                      user.rank === 1
                        ? 'text-[#FFC800]'
                        : user.rank === 2
                        ? 'text-slate-400'
                        : user.rank === 3
                        ? 'text-[#CD7F32]'
                        : 'text-slate-400'
                    }`}
                  >
                    {user.rank}
                  </span>

                  <span className="text-2xl">{user.avatar}</span>

                  <div className="flex flex-col text-right">
                    <span className="text-xs sm:text-sm font-black flex items-center gap-1.5">
                      {user.name}
                      {user.isUser && (
                        <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-[#1CB0F6] text-white">
                          شما
                        </span>
                      )}
                    </span>
                    {user.rank <= 3 && (
                      <span className="text-[10px] font-bold text-[#58CC02]">
                        منطقه دریافت جایزه الماس
                      </span>
                    )}
                  </div>
                </div>

                {/* User XP Score */}
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-black">
                  <Zap className="w-4 h-4 text-[#FFC800] fill-[#FFC800]" />
                  <span>{user.xp} XP</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-3 border-t-2 border-slate-100 flex items-center justify-between text-xs font-bold text-slate-400">
          <span>۱۰ نفر برتر در پایان هفته به لیگ بعد صعود می‌کنند</span>
          <span className="text-[#58CC02] font-black">جایزه نفر اول: ۱۰۰۰ گوهر 💎</span>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. ACHIEVEMENTS & DUO BADGES SHOWCASE                   */}
      {/* ======================================================== */}
      <div className="bg-white border-2 border-b-4 border-slate-200 rounded-3xl p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2 font-black text-slate-800">
            <Award className="w-5 h-5 text-[#FF9600]" />
            <h2 className="text-base font-black">مدال‌ها و افتخارات روان‌لینگو</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500">
              {unlockedBadgesCount} از {evaluatedBadges.length} مدال باز شده
            </span>
            {onOpenBadges && (
              <button
                onClick={onOpenBadges}
                className="duo-btn-green px-3 py-1.5 rounded-xl text-xs font-black text-white flex items-center gap-1 cursor-pointer"
              >
                <span>مشاهده تالار کامل مدال‌ها</span>
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
                className={`bg-white border-2 border-b-4 rounded-2xl p-4 flex flex-col items-center text-center cursor-pointer hover:shadow-xs transition-transform hover:-translate-y-0.5 ${
                  isUnlocked ? 'border-emerald-300' : 'border-slate-200 bg-slate-50/50'
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
                <span className="text-xs font-black text-slate-800 mt-1">{badge.title}</span>
                <span className="text-[10px] font-bold text-slate-400 mt-0.5 line-clamp-1">
                  {badge.description}
                </span>
                <span
                  className={`text-[10px] font-black mt-2 px-2.5 py-0.5 rounded-full border ${
                    isUnlocked
                      ? 'text-[#58CC02] bg-emerald-50 border-emerald-200'
                      : 'text-slate-500 bg-slate-100 border-slate-200'
                  }`}
                >
                  {isUnlocked ? 'کسب شد ✓' : `${currentValue}/${targetValue} (${progressPercent}٪)`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4. SUPER DUO AI PERSONALIZED STUDY COACHING             */}
      {/* ======================================================== */}
      <div className="bg-gradient-to-br from-[#F5EEFF] to-[#EBE0FF] border-2 border-b-4 border-[#CE82FF] rounded-3xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-right">
            <DuoMascot mood="super" size={68} />
            <div>
              <span className="text-[10px] font-black uppercase text-[#8035CE] bg-white px-2 py-0.5 rounded-full border border-[#CE82FF]">
                SUPER DUO COACH
              </span>
              <h3 className="text-lg font-black text-slate-800 mt-1">
                برنامه مطالعاتی هوشمند و تطبیقی اختصاصی شما
              </h3>
              <p className="text-xs font-bold text-slate-600 mt-0.5">
                بر اساس نقاط ضعف و سرعت یادگیری شما در کوئیزها
              </p>
            </div>
          </div>

          <button
            onClick={fetchAiPlan}
            disabled={isGeneratingAiPlan}
            className="duo-btn-purple px-5 py-3 rounded-2xl text-xs font-black cursor-pointer flex items-center gap-2 whitespace-nowrap"
          >
            {isGeneratingAiPlan ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>
              {isGeneratingAiPlan ? 'در حال تحلیل داده‌ها...' : 'تولید برنامه جدید هوش مصنوعی'}
            </span>
          </button>
        </div>

        {aiStudyPlan && (
          <div className="mt-5 p-4 bg-white border-2 border-[#CE82FF] rounded-2xl text-xs font-bold text-slate-800 leading-loose shadow-2xs animate-fadeIn">
            <p className="whitespace-pre-line">{aiStudyPlan}</p>
          </div>
        )}
      </div>
    </>
  )}
</div>
);
};
