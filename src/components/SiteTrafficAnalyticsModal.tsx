import React, { useState, useEffect } from 'react';
import {
  Users,
  Activity,
  Calendar,
  Clock,
  Smartphone,
  Monitor,
  Tablet,
  TrendingUp,
  RefreshCw,
  X,
  Radio,
  Eye,
  Globe,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  ArrowUpRight,
} from 'lucide-react';
import { SiteAnalyticsData } from '../types/analytics';
import { fetchSiteTrafficStats, getOrCreateSessionId, getOrCreateVisitorId } from '../utils/siteTracker';
import { playDuoSound } from '../utils/duoAudio';

interface SiteTrafficAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SiteTrafficAnalyticsModal: React.FC<SiteTrafficAnalyticsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [data, setData] = useState<SiteAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'sessions' | 'pages'>('overview');

  const loadData = async (showLoadingSpinner = false) => {
    if (showLoadingSpinner) setIsLoading(true);
    try {
      const stats = await fetchSiteTrafficStats();
      if (stats) {
        setData(stats);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadData(true);

    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadData(false);
    }, 8000); // Poll every 8s while modal is open

    return () => clearInterval(interval);
  }, [isOpen, autoRefresh]);

  if (!isOpen) return null;

  const currentSessionId = getOrCreateSessionId();
  const currentVisitorId = getOrCreateVisitorId();

  // Calculate day-over-day growth rate
  const todayVisits = data?.today.visits || 0;
  const yesterdayVisits = data?.yesterday.visits || 1;
  const growthRate = Math.round(((todayVisits - yesterdayVisits) / yesterdayVisits) * 100);

  // Peak hour
  const hourly = data?.today.hourlyDistribution || [];
  let peakHour = 0;
  let peakHourCount = 0;
  hourly.forEach((count, h) => {
    if (count > peakHourCount) {
      peakHourCount = count;
      peakHour = h;
    }
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="traffic-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/65 backdrop-blur-xs select-none animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border-2 border-b-6 border-slate-300 rounded-3xl w-full max-w-4xl max-h-[94dvh] flex flex-col shadow-2xl overflow-hidden animate-scaleUp">
        {/* ======================================================== */}
        {/* HEADER: Real-Time Signal & Controls                      */}
        {/* ======================================================== */}
        <div className="p-4 sm:p-5 border-b-2 border-slate-200 bg-slate-50/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 text-right min-w-0 flex-1">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center text-emerald-600 shrink-0 relative">
              <Activity className="w-6 h-6 animate-pulse" />
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white"></span>
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="traffic-modal-title" className="text-lg sm:text-xl font-black text-slate-800 truncate">
                  پنل زنده بازدید و ترافیک سایت
                </h2>
                <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                  <Radio className="w-3 h-3 animate-pulse" /> زنده (LIVE)
                </span>
              </div>
              <p className="text-xs font-bold text-slate-400 truncate">
                آمار واقعی بازدیدکنندگان، کاربران آنلاین و تحلیل رفتار یادگیرندگان
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Auto refresh switch */}
            <button
              onClick={() => {
                playDuoSound('click');
                setAutoRefresh((prev) => !prev);
              }}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 text-xs font-black transition-all cursor-pointer ${
                autoRefresh
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'bg-slate-100 border-slate-200 text-slate-500'
              }`}
              title="بروزرسانی خودکار هر ۸ ثانیه"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-spin' : ''}`} style={{ animationDuration: '4s' }} />
              <span>{autoRefresh ? 'پایش خودکار فعال' : 'پایش متوقف'}</span>
            </button>

            {/* Manual refresh button */}
            <button
              onClick={() => {
                playDuoSound('click');
                loadData(true);
              }}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-all border-2 border-slate-200 cursor-pointer"
              title="بروزرسانی دستی آمار"
              aria-label="بروزرسانی دستی آمار"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* Close button */}
            <button
              onClick={() => {
                playDuoSound('click');
                onClose();
              }}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-all border-2 border-slate-200 cursor-pointer"
              aria-label="بستن پنجره"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-tab navigation */}
        <div className="flex items-center gap-2 px-4 sm:px-6 pt-3 pb-2 border-b border-slate-100 bg-white shrink-0 overflow-x-auto touch-scroll">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all shrink-0 ${
              activeSubTab === 'overview'
                ? 'bg-[#E5F6FD] text-[#1CB0F6] border-2 border-[#1CB0F6]'
                : 'text-slate-600 hover:bg-slate-100 border-2 border-transparent'
            }`}
          >
            📊 داشبورد و نمودار هفتگی
          </button>
          <button
            onClick={() => setActiveSubTab('sessions')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all shrink-0 flex items-center gap-1.5 ${
              activeSubTab === 'sessions'
                ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-400'
                : 'text-slate-600 hover:bg-slate-100 border-2 border-transparent'
            }`}
          >
            <span>🟢 کاربران آنلاین هم‌اکنون</span>
            <span className="bg-emerald-500 text-white text-[10px] px-1.5 py-0.2 rounded-full">
              {data?.onlineUsersCount || 1}
            </span>
          </button>
          <button
            onClick={() => setActiveSubTab('pages')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all shrink-0 ${
              activeSubTab === 'pages'
                ? 'bg-purple-50 text-purple-700 border-2 border-purple-400'
                : 'text-slate-600 hover:bg-slate-100 border-2 border-transparent'
            }`}
          >
            📄 پربازدیدترین صفحات و دستگاه‌ها
          </button>
        </div>

        {/* ======================================================== */}
        {/* MODAL BODY (Scrollable on mobile & desktop)              */}
        {/* ======================================================== */}
        <div className="flex-1 overflow-y-auto touch-scroll p-4 sm:p-6 space-y-6">
          {/* Top 4 KPI Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Real-time Online Users */}
            <div className="bg-emerald-50/70 border-2 border-b-4 border-emerald-300 rounded-2xl p-3.5 sm:p-4 flex flex-col text-right relative overflow-hidden shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-black text-emerald-800">آنلاین در این لحظه</span>
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-emerald-950">
                  {data?.onlineUsersCount ?? '...'}
                </span>
                <span className="text-xs font-bold text-emerald-700">کاربر فعال</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 mt-1">
                پایش لحظه‌ای بر اساس هارت‌بیت فعال
              </span>
            </div>

            {/* 2. Today's Visits */}
            <div className="bg-sky-50/70 border-2 border-b-4 border-sky-300 rounded-2xl p-3.5 sm:p-4 flex flex-col text-right shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-black text-sky-800">بازدید امروز</span>
                <Eye className="w-4 h-4 text-[#1CB0F6]" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-sky-950">
                  {data?.today.visits.toLocaleString('fa-IR') ?? '...'}
                </span>
                <span className="text-xs font-bold text-sky-700">بازدید</span>
              </div>
              <span className="text-[10px] font-bold text-sky-600 mt-1">
                {data?.today.uniques.toLocaleString('fa-IR')} کاربر یکتا ({data?.today.persianDate})
              </span>
            </div>

            {/* 3. Yesterday's Visits */}
            <div className="bg-amber-50/70 border-2 border-b-4 border-amber-300 rounded-2xl p-3.5 sm:p-4 flex flex-col text-right shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-black text-amber-800">بازدید روز گذشته</span>
                <Calendar className="w-4 h-4 text-[#FF9600]" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-amber-950">
                  {data?.yesterday.visits.toLocaleString('fa-IR') ?? '...'}
                </span>
                <span className="text-xs font-bold text-amber-700">بازدید</span>
              </div>
              <span className="text-[10px] font-bold text-amber-700 mt-1">
                {data?.yesterday.uniques.toLocaleString('fa-IR')} کاربر یکتا ({data?.yesterday.persianDate})
              </span>
            </div>

            {/* 4. Weekly Visits (Past 7 Days) */}
            <div className="bg-purple-50/70 border-2 border-b-4 border-purple-300 rounded-2xl p-3.5 sm:p-4 flex flex-col text-right shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-black text-purple-800">بازدید هفته اخیر</span>
                <TrendingUp className="w-4 h-4 text-[#CE82FF]" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black text-purple-950">
                  {data?.week.totalVisits.toLocaleString('fa-IR') ?? '...'}
                </span>
                <span className="text-xs font-bold text-purple-700">بازدید</span>
              </div>
              <span className="text-[10px] font-bold text-purple-600 mt-1">
                {data?.week.totalUniques.toLocaleString('fa-IR')} کاربر منحصر‌به‌فرد
              </span>
            </div>
          </div>

          {/* SUB-TAB 1: OVERVIEW & CHARTS */}
          {activeSubTab === 'overview' && (
            <div className="space-y-6">
              {/* 7-Day Interactive Bar Chart */}
              <div className="bg-white border-2 border-b-4 border-slate-200 rounded-3xl p-4 sm:p-6 shadow-xs">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-6">
                  <div className="text-right">
                    <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-[#1CB0F6]" />
                      روند بازدید روزانه ۷ روز گذشته
                    </h3>
                    <p className="text-xs font-bold text-slate-400 mt-0.5">
                      تفکیک دقیق تعداد بازدیدها و کاربران یکتا در طول هفته
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold bg-slate-100 px-3 py-1 rounded-xl text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#1CB0F6] inline-block"></span>
                    <span>کل بازدیدها</span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block mr-2"></span>
                    <span>کاربران یکتا</span>
                  </div>
                </div>

                {/* Bars */}
                {data?.week.days && (
                  <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end h-52 pt-8 border-b-2 border-slate-200 pb-2">
                    {(() => {
                      const maxVisits = Math.max(...data.week.days.map((d) => d.visits), 100);
                      return data.week.days.map((day, idx) => {
                        const heightPercent = Math.max(Math.round((day.visits / maxVisits) * 100), 12);
                        const isToday = idx === data.week.days.length - 1;
                        return (
                          <div key={day.date} className="flex flex-col items-center gap-1.5 h-full justify-end group">
                            {/* Value tooltip label */}
                            <span className="text-[10px] font-black text-slate-600 group-hover:scale-110 transition-transform">
                              {day.visits.toLocaleString('fa-IR')}
                            </span>
                            {/* Bar container */}
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
                                  <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-black bg-[#FFC800] text-amber-950 px-1 py-0.2 rounded-md whitespace-nowrap shadow-xs">
                                    امروز
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Day name */}
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

                <div className="flex flex-wrap items-center justify-between text-xs font-bold text-slate-500 mt-3 pt-1">
                  <span>مجموع ۷ روز اخیر: <strong className="text-slate-800">{data?.week.totalVisits.toLocaleString('fa-IR')} بازدید</strong></span>
                  <span>میانگین روزانه: <strong className="text-slate-800">{Math.round((data?.week.totalVisits || 0) / 7).toLocaleString('fa-IR')} بازدید</strong></span>
                  <span>رشد نسبت به دیروز: <strong className={growthRate >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{growthRate >= 0 ? `+${growthRate}٪` : `${growthRate}٪`}</strong></span>
                </div>
              </div>

              {/* 24-Hour Distribution (Today's Peak Hours) */}
              <div className="bg-white border-2 border-b-4 border-slate-200 rounded-3xl p-4 sm:p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4 text-right">
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-slate-800 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-amber-500" />
                      ساعات اوج مطالعه و بازدید امروز (۲۴ ساعت)
                    </h3>
                    <p className="text-xs font-bold text-slate-400 mt-0.5">
                      ساعت اوج کنونی: ساعت {peakHour}:۰۰ با {peakHourCount} بازدید
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-12 sm:grid-cols-24 gap-1 items-end h-24 pt-4 border-b border-slate-100 pb-2">
                  {hourly.map((count, hour) => {
                    const maxHourly = Math.max(...hourly, 1);
                    const hPercent = Math.max(Math.round((count / maxHourly) * 100), 8);
                    const isPeak = hour === peakHour;
                    return (
                      <div key={hour} className="flex flex-col items-center justify-end h-full group" title={`ساعت ${hour}:۰۰ - ${count} بازدید`}>
                        <div
                          style={{ height: `${hPercent}%` }}
                          className={`w-full max-w-[14px] rounded-t-sm transition-all ${
                            isPeak
                              ? 'bg-amber-500'
                              : count > 0
                              ? 'bg-[#1CB0F6]/70 group-hover:bg-[#1CB0F6]'
                              : 'bg-slate-200'
                          }`}
                        />
                        <span className="text-[8px] text-slate-400 mt-1 select-none">
                          {hour % 3 === 0 ? hour : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Monthly and All-Time Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 flex items-center justify-between text-right">
                  <div>
                    <span className="text-xs font-bold text-slate-400">بازدید ماه جاری (۳۰ روز گذشته)</span>
                    <h4 className="text-xl font-black text-slate-800 mt-0.5">
                      {data?.month.totalVisits.toLocaleString('fa-IR')} بازدید
                    </h4>
                    <span className="text-[11px] font-bold text-slate-500">
                      {data?.month.totalUniques.toLocaleString('fa-IR')} کاربر متمایز
                    </span>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-sky-100 text-[#1CB0F6] flex items-center justify-center font-black">
                    <Calendar className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 flex items-center justify-between text-right">
                  <div>
                    <span className="text-xs font-bold text-slate-400">کل بازدیدها از زمان راه‌اندازی</span>
                    <h4 className="text-xl font-black text-slate-800 mt-0.5">
                      {data?.allTime.totalVisits.toLocaleString('fa-IR')} بازدید
                    </h4>
                    <span className="text-[11px] font-bold text-slate-500">
                      {data?.allTime.totalUniques?.toLocaleString('fa-IR')} کاربر ثبت‌شده
                    </span>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-black">
                    <Globe className="w-6 h-6" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SUB-TAB 2: ACTIVE SESSIONS (WHO IS ONLINE RIGHT NOW) */}
          {activeSubTab === 'sessions' && (
            <div className="space-y-4 text-right">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                    <Radio className="w-5 h-5 text-emerald-500 animate-pulse" />
                    جلسات و کاربران فعال در این لحظه ({data?.onlineSessions?.length || 0} نفر)
                  </h3>
                  <p className="text-xs font-bold text-slate-400 mt-0.5">
                    دستگاه، مرورگر، مکان تقریبی و صفحه‌ای که هم‌اکنون در حال مطالعه آن هستند
                  </p>
                </div>
              </div>

              <div className="divide-y-2 divide-slate-100 border-2 border-slate-200 rounded-2xl bg-white overflow-hidden shadow-xs">
                {data?.onlineSessions && data.onlineSessions.length > 0 ? (
                  data.onlineSessions.map((session) => {
                    const isCurrent = session.isCurrentUser || session.sessionId === currentSessionId || session.visitorId === currentVisitorId;
                    return (
                      <div
                        key={session.sessionId}
                        className={`p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors ${
                          isCurrent ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border-2 ${
                            isCurrent
                              ? 'bg-emerald-500 text-white border-emerald-600'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {session.device === 'mobile' ? (
                              <Smartphone className="w-5 h-5" />
                            ) : session.device === 'tablet' ? (
                              <Tablet className="w-5 h-5" />
                            ) : (
                              <Monitor className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-slate-800">
                                {isCurrent ? 'شما (این مرورگر)' : `دانشجو از ${session.cityLabel || 'ایران'}`}
                              </span>
                              {isCurrent && (
                                <span className="text-[10px] font-black bg-emerald-500 text-white px-2 py-0.2 rounded-full">
                                  من
                                </span>
                              )}
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.2 rounded-md">
                                {session.browser} · {session.os}
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-500 mt-0.5 flex items-center gap-1.5">
                              <span className="text-slate-400">در حال مشاهده:</span>
                              <strong className="text-slate-700">{session.pageTitle || session.currentPath}</strong>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-100/60 px-2.5 py-1 rounded-xl self-end sm:self-center">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                          <span>فعال همین حالا</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-6 text-center text-slate-500 font-bold text-xs sm:text-sm space-y-1">
                    <p className="text-slate-700 font-black">
                      حفاظت از حریم خصوصی کاربران فعال است ({data?.onlineUsersCount || 1} کاربر آنلاین هم‌اکنون)
                    </p>
                    <p className="text-xs text-slate-400">
                      مشاهده جزئیات نشست‌های فردی و شناسه بازدیدکنندگان تنها برای مدیران تأییدشده سامانه مجاز است.
                    </p>
                  </div>
                )}
              </div>

              {/* Live Activity Stream (shown only when detailed events are authorized) */}
              {data?.recentEvents && data.recentEvents.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#1CB0F6]" />
                    جریان فعالیت‌های زنده یادگیرندگان
                  </h4>
                  <div className="space-y-2">
                    {data.recentEvents.slice(0, 8).map((ev) => (
                      <div
                        key={ev.id}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs font-bold gap-2 text-right"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-[#1CB0F6] shrink-0"></span>
                          <span className="text-slate-800 truncate">{ev.title}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0">{ev.timeAgo}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SUB-TAB 3: TOP PAGES, DEVICES & BROWSERS */}
          {activeSubTab === 'pages' && (
            <div className="space-y-6 text-right">
              {/* Top Pages */}
              <div className="bg-white border-2 border-slate-200 rounded-3xl p-4 sm:p-6 shadow-xs">
                <h3 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-[#1CB0F6]" />
                  محبوب‌ترین و پربازدیدترین بخش‌های سامانه
                </h3>
                <div className="space-y-3">
                  {data?.topPages && data.topPages.map((page, idx) => (
                    <div key={page.path} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs font-black">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center text-[10px]">
                            {idx + 1}
                          </span>
                          <span className="text-slate-800">{page.title}</span>
                          <code className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.2 rounded">
                            {page.path}
                          </code>
                        </div>
                        <span className="text-slate-600">
                          {page.visits.toLocaleString('fa-IR')} بازدید ({page.percentage}٪)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${page.percentage}%` }}
                          className="bg-gradient-to-r from-[#1CB0F6] to-[#007CB8] h-full rounded-full transition-all duration-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Devices and Browsers grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Devices */}
                <div className="bg-white border-2 border-slate-200 rounded-3xl p-4 sm:p-5 shadow-xs">
                  <h4 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    تفکیک نوع دستگاه کاربران
                  </h4>
                  <div className="space-y-3">
                    {data?.deviceBreakdown && data.deviceBreakdown.map((dev) => (
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

                {/* Browsers */}
                <div className="bg-white border-2 border-slate-200 rounded-3xl p-4 sm:p-5 shadow-xs">
                  <h4 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-purple-600" />
                    سهم مرورگرهای اینترنتی
                  </h4>
                  <div className="space-y-3">
                    {data?.browserBreakdown && data.browserBreakdown.map((br) => (
                      <div key={br.browser} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-slate-700">{br.label}</span>
                          <span className="text-slate-900 font-black">{br.percentage}٪</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${br.percentage}%` }}
                            className="bg-purple-500 h-full rounded-full"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="p-3 sm:p-4 border-t-2 border-slate-200 bg-slate-50/90 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-bold text-slate-400 text-center sm:text-right shrink-0">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>ثبت آمار با احترام به حریم خصوصی (بدون کوکی‌های ردیاب شخص ثالث)</span>
          </div>
          <span className="text-[11px]">
            آخرین همگام‌سازی: {data?.lastUpdated ? new Date(data.lastUpdated).toLocaleTimeString('fa-IR') : 'همین حالا'}
          </span>
        </div>
      </div>
    </div>
  );
};
