import React from 'react';
import {
  Home,
  Compass,
  Zap,
  Sparkles,
  User,
  Flame,
  Search,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { getAudioMuted, toggleAudioMuted, playDuoSound } from '../utils/duoAudio';
import { PWAInstallButton } from './PWAInstallButton';
import { useAuth } from '../context/AuthContext';
import { toPersianDigits } from '../utils/persianDigits';

export type AppPrimaryTab =
  | 'dashboard'
  | 'learning'
  | 'quiz'
  | 'support'
  | 'profile'
  | 'book'
  | 'analytics'
  | 'badges'
  | 'notes';

interface NavbarProps {
  activeTab: AppPrimaryTab;
  setActiveTab: (tab: AppPrimaryTab) => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenSourceCode?: () => void;
  onOpenPomodoro?: () => void;
  onOpenTrafficAnalytics?: () => void;
  streakDays: number;
  unlockedBadgeCount?: number;
  onlineCount?: number;
  isOffline?: boolean;
  isSyncingCloud?: boolean;
}

/**
 * Original Psychology & Cognition Geometric Emblem
 * Layered abstract neural-cognitive hemispheres in Deep Indigo, Violet, Turquoise, and Warm Amber
 */
const PsychologyStudioEmblem: React.FC<{ size?: number }> = ({ size = 36 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    className="shrink-0"
  >
    <rect width="40" height="40" rx="12" fill="#36345F" />
    {/* Left cognitive hemisphere arc */}
    <path
      d="M19 10C13.8 10 10 14.2 10 19.5C10 23.4 12.3 26.8 15.8 28.2C16.6 28.5 17.5 29 19 29V10Z"
      fill="#7056D8"
    />
    {/* Right analytical hemisphere arc */}
    <path
      d="M21 10C26.2 10 30 14.2 30 19.5C30 23.4 27.7 26.8 24.2 28.2C23.4 28.5 22.5 29 21 29V10Z"
      fill="#149D9A"
    />
    {/* Neural connection pathways */}
    <circle cx="15.5" cy="17.5" r="2" fill="#EAE4FF" />
    <circle cx="24.5" cy="17.5" r="2" fill="#DDF3E9" />
    <circle cx="20" cy="23.5" r="2.3" fill="#E5A33D" />
    <path
      d="M15.5 17.5L20 23.5L24.5 17.5"
      stroke="#FFF0C8"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenSearch,
  streakDays,
  isOffline = false,
  isSyncingCloud = false,
}) => {
  const { currentUser, isAuthenticated, openGoogleSignInModal, setIsAccountModalOpen } = useAuth();
  const [isAudioMuted, setIsAudioMuted] = React.useState<boolean>(getAudioMuted);

  const handleToggleMute = () => {
    const next = toggleAudioMuted();
    setIsAudioMuted(next);
    if (!next) {
      playDuoSound('click');
    }
  };

  // Resolve legacy sub-tabs to their parent primary destination
  const resolvedPrimaryTab: 'dashboard' | 'learning' | 'quiz' | 'support' | 'profile' =
    activeTab === 'book' || activeTab === 'notes'
      ? 'learning'
      : activeTab === 'analytics' || activeTab === 'badges'
      ? 'profile'
      : activeTab;

  const primaryDestinations = [
    {
      id: 'dashboard' as const,
      label: 'خانه',
      desktopLabel: 'خانه',
      icon: Home,
      activeClass: 'bg-[#EAE4FF] border-[#7056D8]/40 text-[#36345F]',
      iconClass: 'text-[#7056D8]',
      mobileTint: 'bg-[#EAE4FF]',
      mobileText: 'text-[#36345F]',
      mobileIconColor: 'text-[#7056D8]',
    },
    {
      id: 'learning' as const,
      label: 'یادگیری',
      desktopLabel: 'یادگیری و دروس',
      icon: Compass,
      activeClass: 'bg-[#DDF3E9] border-[#149D9A]/40 text-[#134E4A]',
      iconClass: 'text-[#149D9A]',
      mobileTint: 'bg-[#DDF3E9]',
      mobileText: 'text-[#134E4A]',
      mobileIconColor: 'text-[#149D9A]',
    },
    {
      id: 'quiz' as const,
      label: 'آزمون',
      desktopLabel: 'مرکز آزمون',
      icon: Zap,
      activeClass: 'bg-[#E1ECFF] border-[#3976E4]/40 text-[#1E3A8A]',
      iconClass: 'text-[#3976E4]',
      mobileTint: 'bg-[#E1ECFF]',
      mobileText: 'text-[#1E3A8A]',
      mobileIconColor: 'text-[#3976E4]',
    },
    {
      id: 'support' as const,
      label: 'استاد راهنما',
      desktopLabel: 'استاد راهنما',
      icon: Sparkles,
      activeClass: 'bg-[#FBE2ED] border-[#D85B89]/40 text-[#701A3C]',
      iconClass: 'text-[#D85B89]',
      mobileTint: 'bg-[#FBE2ED]',
      mobileText: 'text-[#701A3C]',
      mobileIconColor: 'text-[#D85B89]',
    },
    {
      id: 'profile' as const,
      label: 'پنل کاربری',
      desktopLabel: 'پنل کاربری',
      icon: User,
      activeClass: 'bg-[#FFF0C8] border-[#E5A33D]/50 text-[#5C3D0E]',
      iconClass: 'text-[#C98A27]',
      mobileTint: 'bg-[#FFF0C8]',
      mobileText: 'text-[#5C3D0E]',
      mobileIconColor: 'text-[#C98A27]',
    },
  ];

  const userXp = currentUser?.xp ?? 0;

  return (
    <>
      {/* ============================================================== */}
      {/* 1. EDITORIAL TOP NAVIGATION BAR                                */}
      {/* ============================================================== */}
      <header className="sticky top-0 z-40 glass-header select-none">
        <div className="max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Zone 1: Brand Identity */}
            <button
              onClick={() => {
                playDuoSound('click');
                setActiveTab('dashboard');
              }}
              className="flex items-center gap-2.5 cursor-pointer text-right shrink-0 min-h-[44px] group"
            >
              <PsychologyStudioEmblem size={38} />
              <div className="flex flex-col">
                <span className="text-base sm:text-lg font-black text-[#24243B] tracking-tight leading-none whitespace-nowrap">
                  روان‌مستر
                </span>
                <span className="hidden sm:inline text-[11px] font-medium text-[#69697E] mt-1 whitespace-nowrap">
                  پلتفرم آموزش و کنکور روان‌شناسی
                </span>
              </div>
            </button>

            {/* Zone 2: Desktop 5-Destination Primary Navigation (>= lg viewports) */}
            <nav
              aria-label="ناوبری اصلی"
              className="hidden lg:flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1"
            >
              {primaryDestinations.map((tab) => {
                const isActive = resolvedPrimaryTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      playDuoSound('click');
                      setActiveTab(tab.id);
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 border min-h-[40px] ${
                      isActive
                        ? `${tab.activeClass} font-extrabold`
                        : 'border-transparent text-[#69697E] hover:bg-white/80 hover:text-[#24243B]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? tab.iconClass : 'text-[#69697E]'}`} />
                    <span>{tab.desktopLabel}</span>
                  </button>
                );
              })}
            </nav>

            {/* Zone 3: Real User Status Counters & Quick Utilities */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs shrink-0">
              {/* Sync / Offline Status Indicator */}
              {(isOffline || isSyncingCloud) && (
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold min-h-[44px] ${
                    isOffline
                      ? 'bg-[#FFF0C8] border-[#E5A33D]/50 text-[#5C3D0E]'
                      : 'bg-[#E1ECFF] border-[#3976E4]/30 text-[#1E3A8A]'
                  }`}
                  title={
                    isOffline
                      ? 'حالت مطالعه آفلاین فعال است'
                      : 'در حال همگام‌سازی پیشرفت با سرور...'
                  }
                >
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                      isOffline ? 'bg-[#E5A33D]' : 'bg-[#3976E4] animate-pulse'
                    }`}
                  />
                  <span className="hidden sm:inline">{isOffline ? 'آفلاین' : 'همگام‌سازی'}</span>
                </div>
              )}

              {/* Streak Counter */}
              <button
                onClick={() => {
                  playDuoSound('click');
                  setActiveTab('profile');
                }}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[#E5E1EB] hover:border-[#E5A33D] bg-white text-[#24243B] min-h-[44px] min-w-[44px] cursor-pointer transition-colors"
                title={`${toPersianDigits(streakDays)} روز پیوستگی مطالعه`}
                aria-label={`${toPersianDigits(streakDays)} روز پیوستگی مطالعه`}
              >
                <Flame
                  className={`w-4 h-4 shrink-0 ${
                    streakDays > 0 ? 'text-[#E5A33D] fill-[#E5A33D]' : 'text-[#CFC9DA]'
                  }`}
                />
                <span className="text-xs font-extrabold text-[#24243B] tabular-nums">
                  {toPersianDigits(streakDays)}
                </span>
              </button>

              {/* Total XP Counter */}
              <button
                onClick={() => {
                  playDuoSound('click');
                  setActiveTab('profile');
                }}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[#E5E1EB] hover:border-[#7056D8] bg-white text-[#24243B] min-h-[44px] cursor-pointer transition-colors"
                title={`مجموع امتیاز تجربه: ${toPersianDigits(userXp)} XP`}
              >
                <Zap className="w-3.5 h-3.5 text-[#7056D8] fill-[#7056D8]" />
                <span className="text-xs font-extrabold text-[#24243B] tabular-nums">
                  {toPersianDigits(userXp)}
                </span>
                <span className="text-[10px] font-bold text-[#69697E]">XP</span>
              </button>

              {/* Search Trigger */}
              <button
                onClick={() => {
                  playDuoSound('click');
                  onOpenSearch();
                }}
                className="p-2 text-[#69697E] hover:text-[#24243B] hover:bg-white rounded-xl transition-colors cursor-pointer border border-[#E5E1EB] bg-white flex items-center justify-center min-w-[44px] min-h-[44px]"
                title="جستجو در سرفصل‌ها و مفاهیم (Ctrl+K)"
                aria-label="جستجوی سریع"
              >
                <Search className="w-4 h-4" />
              </button>

              {/* Audio Mute Toggle (Desktop) */}
              <button
                onClick={handleToggleMute}
                className={`hidden md:flex p-2 rounded-xl transition-colors cursor-pointer border min-w-[44px] min-h-[44px] items-center justify-center ${
                  isAudioMuted
                    ? 'bg-[#F7F5F0] border-[#E5E1EB] text-[#69697E]'
                    : 'bg-white border-[#E5E1EB] text-[#24243B]'
                }`}
                title={
                  isAudioMuted
                    ? 'صداها خاموش است (فعال‌سازی صدا)'
                    : 'صداها روشن است (بی‌صدا کردن)'
                }
                aria-label={isAudioMuted ? 'فعال‌سازی صداهای برنامه' : 'بی‌صدا کردن برنامه'}
              >
                {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {/* In-App PWA Install Button (Desktop) */}
              <div className="hidden xl:block">
                <PWAInstallButton />
              </div>

              {/* Google Sign-In or Authenticated User Button */}
              {isAuthenticated && currentUser ? (
                <button
                  onClick={() => {
                    playDuoSound('click');
                    setIsAccountModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[#E5E1EB] bg-white hover:border-[#7056D8] text-[#24243B] transition-colors cursor-pointer min-h-[44px] min-w-[44px] justify-center"
                  title="مشاهده پروفایل و حساب کاربری"
                >
                  {currentUser.picture && !currentUser.picture.includes('default-user') ? (
                    <img
                      src={currentUser.picture}
                      alt={currentUser.name}
                      referrerPolicy="no-referrer"
                      className="w-6 h-6 rounded-full object-cover border border-[#E5E1EB]"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-[#36345F] text-white flex items-center justify-center text-[11px] font-bold">
                      {currentUser.avatar || '🎓'}
                    </div>
                  )}
                  <span className="hidden sm:inline text-xs font-bold text-[#24243B] max-w-[96px] truncate">
                    {currentUser.name}
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    playDuoSound('click');
                    openGoogleSignInModal();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#CFC9DA] hover:border-[#7056D8] text-[#24243B] cursor-pointer min-h-[44px] transition-colors"
                  title="ورود به حساب کاربری"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span className="text-xs font-extrabold text-[#24243B] whitespace-nowrap">
                    ورود
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ============================================================== */}
      {/* 2. MOBILE 5-DESTINATION BOTTOM NAVIGATION BAR (< lg viewports) */}
      {/* ============================================================== */}
      {activeTab !== 'quiz' && (
        <nav
          aria-label="ناوبری موبایل"
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF]/96 backdrop-blur-md border-t border-[#E5E1EB] pb-safe select-none touch-manipulation"
        >
          <div className="grid grid-cols-5 items-center h-16 max-w-lg mx-auto px-1.5">
            {primaryDestinations.map((tab) => {
              const isActive = resolvedPrimaryTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    playDuoSound('click');
                    setActiveTab(tab.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`flex flex-col items-center justify-center h-full min-h-[48px] py-1 cursor-pointer transition-colors relative select-none ${
                    isActive ? tab.mobileText : 'text-[#69697E] hover:text-[#24243B]'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <div
                    className={`w-11 h-7 rounded-xl flex items-center justify-center transition-colors ${
                      isActive ? tab.mobileTint : 'bg-transparent'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 ${
                        isActive ? `${tab.mobileIconColor} stroke-[2.25]` : 'text-[#69697E]'
                      }`}
                    />
                  </div>
                  <span
                    className={`text-[10px] mt-0.5 tracking-tight whitespace-nowrap ${
                      isActive
                        ? `${tab.mobileText} font-extrabold`
                        : 'text-[#69697E] font-medium'
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
};
