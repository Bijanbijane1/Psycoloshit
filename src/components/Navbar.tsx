import React, { useState } from 'react';
import {
  Compass,
  BookOpen,
  Zap,
  Trophy,
  Award,
  BookMarked,
  Sparkles,
  Flame,
  Gem,
  Heart,
  Search,
  SlidersHorizontal,
  Code2,
  Volume2,
  VolumeX,
  Timer,
  MoreHorizontal,
  X,
  Activity,
} from 'lucide-react';
import { DuoMascot } from './DuoMascot';
import { getAudioMuted, toggleAudioMuted, playDuoSound } from '../utils/duoAudio';
import { PWAInstallButton } from './PWAInstallButton';

interface NavbarProps {
  activeTab: 'dashboard' | 'book' | 'quiz' | 'analytics' | 'badges' | 'support' | 'notes';
  setActiveTab: (tab: 'dashboard' | 'book' | 'quiz' | 'analytics' | 'badges' | 'support' | 'notes') => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenSourceCode?: () => void;
  onOpenPomodoro?: () => void;
  onOpenTrafficAnalytics?: () => void;
  streakDays: number;
  unlockedBadgeCount?: number;
  onlineCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenSearch,
  onOpenSettings,
  onOpenSourceCode,
  onOpenPomodoro,
  onOpenTrafficAnalytics,
  streakDays,
  unlockedBadgeCount = 0,
  onlineCount = 1,
}) => {
  const [isAudioMuted, setIsAudioMuted] = React.useState<boolean>(getAudioMuted);
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState<boolean>(false);

  const handleToggleMute = () => {
    const next = toggleAudioMuted();
    setIsAudioMuted(next);
    if (!next) {
      playDuoSound('click');
    }
  };

  const navTabs = [
    { id: 'dashboard' as const, label: 'مسیر یادگیری', icon: Compass, badge: null },
    { id: 'book' as const, label: 'کتابچه و درس‌ها', icon: BookOpen, badge: null },
    { id: 'quiz' as const, label: 'تمرین و آزمون', icon: Zap, badge: 'XP+' },
    { id: 'badges' as const, label: 'مدال‌ها و افتخارات', icon: Award, badge: `${unlockedBadgeCount} مدال` },
    { id: 'analytics' as const, label: 'لیگ و کارنامه', icon: Trophy, badge: 'الماس' },
    { id: 'notes' as const, label: 'واژه‌نامه و یادداشت', icon: BookMarked, badge: null },
    { id: 'support' as const, label: 'سوپر دوئو (AI)', icon: Sparkles, badge: 'PRO' },
  ];

  // Mobile Bottom Navigation Bar Tabs (Top 4 most used + More Drawer)
  const mobilePrimaryTabs = [
    { id: 'dashboard' as const, label: 'مسیر', icon: Compass },
    { id: 'book' as const, label: 'کتابچه', icon: BookOpen },
    { id: 'quiz' as const, label: 'تمرین', icon: Zap, badge: 'XP+' },
    { id: 'analytics' as const, label: 'لیگ', icon: Trophy },
  ];

  const handleMobileTabSelect = (tabId: 'dashboard' | 'book' | 'quiz' | 'analytics' | 'badges' | 'support' | 'notes') => {
    playDuoSound('click');
    setActiveTab(tabId);
    setIsMobileMoreOpen(false);
  };

  return (
    <>
      {/* ============================================================== */}
      {/* 1. TOP APP BAR (Compact on mobile, full width on desktop)      */}
      {/* ============================================================== */}
      <header className="sticky top-0 z-40 bg-white border-b-2 border-slate-200 shadow-2xs select-none">
        <div className="max-w-7xl mx-auto px-2.5 sm:px-6">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Duolingo Brand Wordmark */}
            <button
              onClick={() => {
                playDuoSound('click');
                setActiveTab('dashboard');
              }}
              className="flex items-center gap-2 cursor-pointer group select-none text-right shrink-0 min-h-[44px]"
            >
              <DuoMascot mood="happy" size={36} animate={false} />
              <div className="flex flex-col">
                <span className="text-lg sm:text-2xl font-black text-[#58CC02] tracking-tight group-hover:scale-105 transition-transform flex items-center gap-1">
                  روان‌لینگو
                  <span className="text-[9px] font-black uppercase tracking-wider px-1 py-0.2 rounded-md bg-[#FFC800] text-amber-950 border border-[#E5A500]">
                    PLUS
                  </span>
                </span>
                <span className="text-[10px] text-slate-400 font-bold hidden sm:block -mt-1">
                  یادگیری روان‌شناسی به سبک دوئولینگو
                </span>
              </div>
            </button>

            {/* Desktop Navigation Links (>= lg viewports) */}
            <nav className="hidden lg:flex items-center gap-1.5">
              {navTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      playDuoSound('click');
                      setActiveTab(tab.id);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 select-none ${
                      isActive
                        ? 'bg-[#E5F6FD] text-[#1CB0F6] border-2 border-[#1CB0F6] border-b-4 translate-y-[-1px]'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-2 border-transparent'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-[#1CB0F6]' : 'text-slate-400'}`} />
                    <span>{tab.label}</span>
                    {tab.badge && (
                      <span
                        className={`text-[9px] font-black px-1.5 py-0.2 rounded-full ${
                          tab.badge === 'PRO'
                            ? 'bg-[#CE82FF] text-white'
                            : tab.badge === 'الماس'
                            ? 'bg-[#1CB0F6] text-white'
                            : 'bg-[#FFC800] text-amber-950'
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Gamification Stats Bar (Streak, Gems, Hearts, Search, Mute) */}
            <div className="flex items-center gap-1.5 sm:gap-3 text-xs font-black">
              {/* Real-time Online Users Badge */}
              <button
                onClick={() => {
                  playDuoSound('click');
                  if (onOpenTrafficAnalytics) onOpenTrafficAnalytics();
                }}
                className="flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl border-2 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 cursor-pointer transition-all shadow-2xs min-h-[38px] group"
                title="مشاهده آمار زنده ترافیک و کاربران آنلاین"
                aria-label="مشاهده آمار زنده ترافیک"
              >
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-xs sm:text-sm font-black text-emerald-950">
                  {onlineCount || 1}
                </span>
                <span className="hidden sm:inline text-[11px] font-bold text-emerald-700">
                  آنلاین
                </span>
              </button>

              {/* Streak Flame */}
              <div
                className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl border-2 border-slate-200 bg-white hover:bg-orange-50/50 cursor-pointer transition-colors shadow-2xs min-h-[38px]"
                title={`${streakDays} روز زنجیره یادگیری فعال`}
              >
                <Flame className="w-4 h-4 text-[#FF9600] fill-[#FF9600]" />
                <span className="text-[#FF9600] text-xs sm:text-sm font-black">{streakDays}</span>
                <span className="hidden sm:inline text-[11px] text-slate-400 font-bold">روز</span>
              </div>

              {/* Gems / Lingots */}
              <div
                className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl border-2 border-slate-200 bg-white hover:bg-sky-50/50 cursor-pointer transition-colors shadow-2xs min-h-[38px]"
                title="۴۸۰ گوهر اندوخته"
              >
                <Gem className="w-3.5 h-3.5 text-[#1CB0F6] fill-[#1CB0F6]" />
                <span className="text-[#1CB0F6] text-xs sm:text-sm font-black">۴۸۰</span>
              </div>

              {/* Hearts */}
              <div
                className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl border-2 border-slate-200 bg-white hover:bg-rose-50/50 cursor-pointer transition-colors shadow-2xs min-h-[38px]"
                title="۵ جان پر (آماده آزمون)"
              >
                <Heart className="w-3.5 h-3.5 text-[#FF4B4B] fill-[#FF4B4B]" />
                <span className="text-[#FF4B4B] text-xs sm:text-sm font-black">۵</span>
              </div>

              {/* Audio Effects Mute Toggle Button */}
              <button
                onClick={handleToggleMute}
                className={`p-2 rounded-xl transition-all cursor-pointer border-2 min-w-[38px] min-h-[38px] flex items-center justify-center ${
                  isAudioMuted
                    ? 'bg-rose-50 border-rose-200 text-rose-500 hover:bg-rose-100'
                    : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title={isAudioMuted ? 'صداها خاموش است (فعال‌سازی صدا)' : 'صداها روشن است (بی‌صدا کردن)'}
                aria-label={isAudioMuted ? 'فعال‌سازی صداهای برنامه' : 'بی‌صدا کردن برنامه'}
              >
                {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {/* Pomodoro Timer (Desktop only in top bar) */}
              {onOpenPomodoro && (
                <button
                  onClick={() => {
                    playDuoSound('click');
                    onOpenPomodoro();
                  }}
                  className="hidden xl:flex p-2 px-2.5 text-[#FF9600] hover:bg-orange-50 rounded-xl transition-all cursor-pointer border-2 border-orange-200 items-center gap-1.5 min-h-[38px]"
                  title="تایمر مطالعه متمرکز پومودورو"
                  aria-label="تایمر پومودورو"
                >
                  <Timer className="w-4 h-4" />
                  <span className="text-xs font-black">پومودورو</span>
                </button>
              )}

              {/* In-App PWA Install Button */}
              <div className="hidden sm:block">
                <PWAInstallButton />
              </div>

              {/* Fast Search Trigger */}
              <button
                onClick={() => {
                  playDuoSound('click');
                  onOpenSearch();
                }}
                className="p-2 sm:px-3 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer border-2 border-slate-200 flex items-center gap-1.5 min-w-[38px] min-h-[38px] justify-center"
                title="جستجو در سرفصل‌ها (Ctrl+K)"
                aria-label="جستجوی سریع"
              >
                <Search className="w-4 h-4" />
                <kbd className="hidden md:inline-block text-[10px] font-sans font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-300">
                  ⌘K
                </kbd>
              </button>

              {/* Settings (Desktop only in top bar) */}
              <button
                onClick={() => {
                  playDuoSound('click');
                  onOpenSettings();
                }}
                className="hidden lg:flex p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer border-2 border-slate-200 min-w-[38px] min-h-[38px] items-center justify-center"
                title="تنظیمات سامانه"
                aria-label="تنظیمات سامانه"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ============================================================== */}
      {/* 2. ERGONOMIC FIXED MOBILE BOTTOM TAB BAR (< lg viewports)      */}
      {/* Natural Thumb Zone (Bottom 40% of viewport)                    */}
      {/* ============================================================== */}
      {activeTab !== 'quiz' && (
        <nav
          aria-label="ناوبری لمسی موبایل"
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t-2 border-slate-200 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.08)] select-none"
        >
          <div className="grid grid-cols-5 items-center h-15 max-w-lg mx-auto px-1">
            {mobilePrimaryTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleMobileTabSelect(tab.id)}
                  className={`flex flex-col items-center justify-center h-full min-h-[48px] py-1 cursor-pointer transition-all relative ${
                    isActive ? 'text-[#1CB0F6]' : 'text-slate-400 hover:text-slate-600'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <div className="relative">
                    <Icon
                      className={`w-5 h-5 transition-transform ${
                        isActive ? 'scale-110 text-[#1CB0F6] stroke-[2.5]' : 'text-slate-400'
                      }`}
                    />
                    {tab.badge && (
                      <span className="absolute -top-1.5 -right-3 text-[8px] font-black bg-[#58CC02] text-white px-1 py-0.2 rounded-full shadow-2xs">
                        {tab.badge}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] mt-0.5 tracking-tight font-black ${
                      isActive ? 'text-[#1CB0F6]' : 'text-slate-500'
                    }`}
                  >
                    {tab.label}
                  </span>
                  {isActive && (
                    <span className="absolute bottom-1 w-4 h-1 rounded-full bg-[#1CB0F6]" />
                  )}
                </button>
              );
            })}

            {/* Tab 5: "بیشتر" (More / Drawer Trigger) */}
            <button
              onClick={() => {
                playDuoSound('click');
                setIsMobileMoreOpen(true);
              }}
              className={`flex flex-col items-center justify-center h-full min-h-[48px] py-1 cursor-pointer transition-all relative ${
                isMobileMoreOpen || ['badges', 'notes', 'support'].includes(activeTab)
                  ? 'text-[#CE82FF]'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              aria-label="امکانات بیشتر"
            >
              <div className="relative">
                <MoreHorizontal
                  className={`w-5 h-5 transition-transform ${
                    isMobileMoreOpen || ['badges', 'notes', 'support'].includes(activeTab)
                      ? 'scale-110 text-[#CE82FF] stroke-[2.5]'
                      : 'text-slate-400'
                  }`}
                />
                {unlockedBadgeCount > 0 && (
                  <span className="absolute -top-1 -right-2.5 w-2 h-2 rounded-full bg-[#FFC800] ring-1 ring-white" />
                )}
              </div>
              <span
                className={`text-[10px] mt-0.5 tracking-tight font-black ${
                  isMobileMoreOpen || ['badges', 'notes', 'support'].includes(activeTab)
                    ? 'text-[#CE82FF]'
                    : 'text-slate-500'
                }`}
              >
                بیشتر
              </span>
            </button>
          </div>
        </nav>
      )}

      {/* ============================================================== */}
      {/* 3. MOBILE "MORE" BOTTOM ACTION SHEET / DRAWER                  */}
      {/* ============================================================== */}
      {isMobileMoreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end select-none animate-fadeIn">
          {/* Backdrop */}
          <div
            onClick={() => setIsMobileMoreOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
          />

          {/* Drawer Container */}
          <div className="relative z-10 bg-white rounded-t-3xl border-t-2 border-slate-200 p-5 pb-safe max-h-[85vh] overflow-y-auto shadow-2xl animate-scaleUp">
            {/* Grab Handle */}
            <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4" />

            <div className="flex items-center justify-between pb-3 border-b-2 border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <DuoMascot mood="happy" size={32} animate={false} />
                <h3 className="text-sm font-black text-slate-800">امکانات و ابزارهای روان‌لینگو</h3>
              </div>
              <button
                onClick={() => setIsMobileMoreOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Grid of Secondary Features */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* Badges & Medals */}
              <button
                onClick={() => handleMobileTabSelect('badges')}
                className={`p-3.5 rounded-2xl border-2 text-right flex items-center gap-3 cursor-pointer transition-all min-h-[56px] ${
                  activeTab === 'badges'
                    ? 'bg-[#FFF7D6] border-[#FFC800] text-amber-950 font-black shadow-xs'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800 font-bold'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-[#FFC800]/20 flex items-center justify-center shrink-0">
                  <Award className="w-5 h-5 text-[#E5A500]" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-black">مدال‌ها و افتخارات</span>
                  <span className="text-[10px] text-slate-400 font-bold">
                    {unlockedBadgeCount} مدال کسب‌شده
                  </span>
                </div>
              </button>

              {/* Notebook & Flashcards */}
              <button
                onClick={() => handleMobileTabSelect('notes')}
                className={`p-3.5 rounded-2xl border-2 text-right flex items-center gap-3 cursor-pointer transition-all min-h-[56px] ${
                  activeTab === 'notes'
                    ? 'bg-[#FFF3E0] border-[#FF9600] text-orange-950 font-black shadow-xs'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800 font-bold'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                  <BookMarked className="w-5 h-5 text-[#FF9600]" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-black">دفترچه و واژگان</span>
                  <span className="text-[10px] text-slate-400 font-bold">یادداشت‌ها و فلش‌کارت</span>
                </div>
              </button>

              {/* Super Duo AI Mentor */}
              <button
                onClick={() => handleMobileTabSelect('support')}
                className={`p-3.5 rounded-2xl border-2 text-right flex items-center gap-3 cursor-pointer transition-all min-h-[56px] ${
                  activeTab === 'support'
                    ? 'bg-[#F4E8FF] border-[#CE82FF] text-purple-950 font-black shadow-xs'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800 font-bold'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-[#CE82FF]/20 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-[#CE82FF]" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-black">سوپر دوئو (AI)</span>
                  <span className="text-[10px] text-purple-600 font-black">منتور رفع اشکال</span>
                </div>
              </button>

              {/* Pomodoro Focus Timer */}
              {onOpenPomodoro && (
                <button
                  onClick={() => {
                    playDuoSound('click');
                    setIsMobileMoreOpen(false);
                    onOpenPomodoro();
                  }}
                  className="p-3.5 rounded-2xl border-2 bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800 text-right flex items-center gap-3 cursor-pointer transition-all min-h-[56px]"
                >
                  <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <Timer className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-black">تایمر پومودورو</span>
                    <span className="text-[10px] text-slate-400 font-bold">مطالعه متمرکز ۲۵ دقیقه‌ای</span>
                  </div>
                </button>
              )}

              {/* Real-time Traffic & Visitor Analytics Trigger */}
              <button
                onClick={() => {
                  playDuoSound('click');
                  setIsMobileMoreOpen(false);
                  if (onOpenTrafficAnalytics) onOpenTrafficAnalytics();
                }}
                className="p-3.5 rounded-2xl border-2 bg-emerald-50/80 border-emerald-300 hover:bg-emerald-100 text-emerald-950 text-right flex items-center gap-3 cursor-pointer transition-all min-h-[56px]"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-200/70 flex items-center justify-center shrink-0 text-emerald-700">
                  <Activity className="w-5 h-5 animate-pulse" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black">آمار زنده و ترافیک</span>
                    <span className="text-[9px] font-black bg-emerald-500 text-white px-1.5 py-0.2 rounded-full">
                      {onlineCount || 1} آنلاین
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-700 font-bold">بازدید امروز، دیروز و هفته</span>
                </div>
              </button>

              {/* Search Modal Trigger */}
              <button
                onClick={() => {
                  playDuoSound('click');
                  setIsMobileMoreOpen(false);
                  onOpenSearch();
                }}
                className="p-3.5 rounded-2xl border-2 bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800 text-right flex items-center gap-3 cursor-pointer transition-all min-h-[56px]"
              >
                <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center shrink-0">
                  <Search className="w-5 h-5 text-[#1CB0F6]" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-black">جستجوی پیشرفته</span>
                  <span className="text-[10px] text-slate-400 font-bold">سرفصل‌ها و تست‌ها</span>
                </div>
              </button>

              {/* Settings Modal Trigger */}
              <button
                onClick={() => {
                  playDuoSound('click');
                  setIsMobileMoreOpen(false);
                  onOpenSettings();
                }}
                className="p-3.5 rounded-2xl border-2 bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800 text-right flex items-center gap-3 cursor-pointer transition-all min-h-[56px]"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center shrink-0">
                  <SlidersHorizontal className="w-5 h-5 text-slate-600" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-black">تنظیمات برنامه</span>
                  <span className="text-[10px] text-slate-400 font-bold">صدا، قلم، سختی آزمون</span>
                </div>
              </button>
            </div>

            {/* Source Code Viewer Option */}
            {onOpenSourceCode && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <button
                  onClick={() => {
                    playDuoSound('click');
                    setIsMobileMoreOpen(false);
                    onOpenSourceCode();
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black flex items-center justify-between cursor-pointer min-h-[44px]"
                >
                  <div className="flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-indigo-600" />
                    <span>مشاهده و دانلود سورس‌کد کامل پروژه</span>
                  </div>
                  <span className="text-[10px] text-slate-400">TypeScript & React</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
