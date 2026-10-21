import React from 'react';
import {
  Home,
  Compass,
  Zap,
  User,
  Flame,
  Search,
  Volume2,
  VolumeX,
  Brain,
  Users,
  Scale,
  Palette,
  BookOpen,
  GraduationCap,
  Landmark,
  ChevronDown,
  Plus,
  Check,
} from 'lucide-react';
import { getAudioMuted, toggleAudioMuted, playDuoSound } from '../utils/duoAudio';
import { PWAInstallButton } from './PWAInstallButton';
import { useAuth } from '../context/AuthContext';
import { toPersianDigits } from '../utils/persianDigits';
import { LearningDisciplineId, LearningDisciplineDefinition } from '../types/psychology';
import {
  LEARNING_DISCIPLINES,
  DEFAULT_LEARNING_DISCIPLINE_ID,
  getDisciplineDefinition,
} from '../utils/storage';

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
  activeDiscipline?: LearningDisciplineId;
  onSelectDiscipline?: (disciplineId: LearningDisciplineId) => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenSourceCode?: () => void;
  onOpenPomodoro?: () => void;
  onOpenTrafficAnalytics?: () => void;
  streakDays: number;
  totalXp?: number;
  soundEnabled?: boolean;
  onToggleSound?: (nextSoundEnabled: boolean) => void;
  unlockedBadgeCount?: number;
  onlineCount?: number;
  isOffline?: boolean;
  isSyncingCloud?: boolean;
}

export function renderDisciplineIcon(
  iconName: LearningDisciplineDefinition['iconName'],
  className = 'w-4 h-4'
): React.ReactNode {
  switch (iconName) {
    case 'brain':
      return <Brain className={className} />;
    case 'users':
      return <Users className={className} />;
    case 'scale':
      return <Scale className={className} />;
    case 'palette':
      return <Palette className={className} />;
    case 'book-open':
      return <BookOpen className={className} />;
    case 'graduation-cap':
      return <GraduationCap className={className} />;
    case 'landmark':
      return <Landmark className={className} />;
    default:
      return <Brain className={className} />;
  }
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
  activeDiscipline = DEFAULT_LEARNING_DISCIPLINE_ID,
  onSelectDiscipline,
  onOpenSearch,
  streakDays,
  totalXp,
  soundEnabled,
  onToggleSound,
  isOffline = false,
  isSyncingCloud = false,
}) => {
  const { currentUser, isAuthenticated, openGoogleSignInModal, setIsAccountModalOpen } = useAuth();
  const [isAudioMuted, setIsAudioMuted] = React.useState<boolean>(() =>
    typeof soundEnabled === 'boolean' ? !soundEnabled : getAudioMuted()
  );
  const [isDisciplineMenuOpen, setIsDisciplineMenuOpen] = React.useState<boolean>(false);
  const disciplineMenuContainerRef = React.useRef<HTMLDivElement | null>(null);

  const activeDisciplineMeta = React.useMemo(
    () => getDisciplineDefinition(activeDiscipline),
    [activeDiscipline]
  );

  React.useEffect(() => {
    if (!isDisciplineMenuOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (
        disciplineMenuContainerRef.current &&
        !disciplineMenuContainerRef.current.contains(event.target as Node)
      ) {
        setIsDisciplineMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDisciplineMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDisciplineMenuOpen]);

  React.useEffect(() => {
    if (typeof soundEnabled === 'boolean') {
      setIsAudioMuted(!soundEnabled);
    }
  }, [soundEnabled]);

  React.useEffect(() => {
    const handleMuteEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ muted: boolean; soundEnabled: boolean }>).detail;
      if (detail && typeof detail.muted === 'boolean') {
        setIsAudioMuted(detail.muted);
      } else {
        setIsAudioMuted(getAudioMuted());
      }
    };
    window.addEventListener('psychomaster:audio-mute-changed', handleMuteEvent);
    return () => window.removeEventListener('psychomaster:audio-mute-changed', handleMuteEvent);
  }, []);

  const handleToggleMute = () => {
    const nextMuted = toggleAudioMuted();
    setIsAudioMuted(nextMuted);
    onToggleSound?.(!nextMuted);
  };

  // Resolve secondary and legacy sub-tabs to their parent primary destination
  const resolvedPrimaryTab: 'dashboard' | 'learning' | 'quiz' | 'profile' =
    activeTab === 'book'
      ? 'learning'
      : activeTab === 'analytics' ||
        activeTab === 'badges' ||
        activeTab === 'notes' ||
        activeTab === 'support'
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
      desktopLabel: 'یادگیری',
      icon: Compass,
      activeClass: 'bg-[#DDF3E9] border-[#149D9A]/40 text-[#134E4A]',
      iconClass: 'text-[#149D9A]',
      mobileTint: 'bg-[#DDF3E9]',
      mobileText: 'text-[#134E4A]',
      mobileIconColor: 'text-[#149D9A]',
    },
    {
      id: 'quiz' as const,
      label: 'آزمونها',
      desktopLabel: 'آزمونها',
      icon: Zap,
      activeClass: 'bg-[#E1ECFF] border-[#3976E4]/40 text-[#1E3A8A]',
      iconClass: 'text-[#3976E4]',
      mobileTint: 'bg-[#E1ECFF]',
      mobileText: 'text-[#1E3A8A]',
      mobileIconColor: 'text-[#3976E4]',
    },
    {
      id: 'profile' as const,
      label: 'پنل من',
      desktopLabel: 'پنل من',
      icon: User,
      activeClass: 'bg-[#FFF0C8] border-[#E5A33D]/50 text-[#5C3D0E]',
      iconClass: 'text-[#C98A27]',
      mobileTint: 'bg-[#FFF0C8]',
      mobileText: 'text-[#5C3D0E]',
      mobileIconColor: 'text-[#C98A27]',
    },
  ];

  const userXp = Math.max(totalXp ?? 0, currentUser?.xp ?? 0);

  return (
    <>
      {/* ============================================================== */}
      {/* 1. EDITORIAL TOP NAVIGATION BAR                                */}
      {/* ============================================================== */}
      <header className="sticky top-0 z-40 glass-header select-none">
        <div className="max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-2 sm:gap-3">
            {/* Zone 1: Brand Identity + Compact Discipline Switcher */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                onClick={() => {
                  playDuoSound('click');
                  setActiveTab('dashboard');
                }}
                className="flex items-center gap-2 cursor-pointer text-right shrink-0 min-h-[44px] group"
              >
                <PsychologyStudioEmblem size={36} />
                <div className="flex flex-col">
                  <span className="text-sm sm:text-lg font-black text-[#24243B] tracking-tight leading-none whitespace-nowrap">
                    روان‌مستر
                  </span>
                  <span className="hidden md:inline text-[11px] font-medium text-[#69697E] mt-1 whitespace-nowrap">
                    پلتفرم آموزش و کنکور روان‌شناسی
                  </span>
                </div>
              </button>

              {/* Compact Header Learning-Domain Selector & Switch/Add Control */}
              <div
                ref={disciplineMenuContainerRef}
                className="relative"
                data-testid="navbar-discipline-switcher"
              >
                <button
                  type="button"
                  onClick={() => {
                    playDuoSound('click');
                    setIsDisciplineMenuOpen((prev) => !prev);
                  }}
                  aria-haspopup="listbox"
                  aria-expanded={isDisciplineMenuOpen}
                  aria-label={`حوزه یادگیری فعال: ${activeDisciplineMeta.label} — تغییر یا افزودن حوزه`}
                  title={`حوزه فعال: ${activeDisciplineMeta.label} (تغییر یا افزودن حوزه یادگیری)`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[#E5E1EB] hover:border-[#7056D8] bg-white text-[#24243B] transition-colors cursor-pointer min-h-[44px] shrink-0"
                >
                  <span
                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${activeDisciplineMeta.palette.badgeBg} ${activeDisciplineMeta.palette.iconColor}`}
                  >
                    {renderDisciplineIcon(activeDisciplineMeta.iconName, 'w-3.5 h-3.5')}
                  </span>
                  <span className="text-xs font-extrabold text-[#24243B] whitespace-nowrap">
                    {activeDisciplineMeta.label}
                  </span>
                  <span
                    className="inline-flex items-center justify-center w-4 h-4 rounded-md bg-[#F7F5F0] text-[#69697E]"
                    aria-hidden="true"
                  >
                    <Plus className="w-3 h-3" />
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-[#69697E] transition-transform duration-200 ${
                      isDisciplineMenuOpen ? 'rotate-180 text-[#24243B]' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>

                {isDisciplineMenuOpen && (
                  <div
                    role="listbox"
                    aria-label="انتخاب یا افزودن حوزه یادگیری"
                    className="absolute right-0 mt-2 w-64 sm:w-72 rounded-2xl bg-white border border-[#E5E1EB] shadow-lg p-2 z-50 text-right"
                  >
                    <div className="px-2.5 py-1.5 border-b border-[#E5E1EB] mb-1">
                      <span className="text-[11px] font-extrabold text-[#24243B] block">
                        تغییر یا افزودن حوزه یادگیری
                      </span>
                      <span className="text-[10px] text-[#69697E] block mt-0.5">
                        پیشرفت و امتیاز شما در تمام حوزه‌ها حفظ می‌شود
                      </span>
                    </div>

                    <div className="space-y-1 max-h-80 overflow-y-auto">
                      {LEARNING_DISCIPLINES.map((discipline) => {
                        const isSelected = discipline.id === activeDisciplineMeta.id;
                        return (
                          <button
                            key={discipline.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              playDuoSound('click');
                              onSelectDiscipline?.(discipline.id);
                              setIsDisciplineMenuOpen(false);
                            }}
                            className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer min-h-[44px] ${
                              isSelected
                                ? 'bg-[#EAE4FF]/70 text-[#24243B] font-extrabold border border-[#7056D8]/30'
                                : 'text-[#24243B] hover:bg-[#F7F5F0] font-bold border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${discipline.palette.badgeBg} ${discipline.palette.iconColor}`}
                              >
                                {renderDisciplineIcon(discipline.iconName, 'w-4 h-4')}
                              </span>
                              <div className="truncate text-right">
                                <span className="block truncate">{discipline.label}</span>
                                <span className="text-[10px] font-medium text-[#69697E] block truncate">
                                  {discipline.hasCurriculum ? 'سرفصل کامل فعال' : 'در حال تدوین سرفصل'}
                                </span>
                              </div>
                            </div>

                            {isSelected && (
                              <Check className="w-4 h-4 text-[#7056D8] shrink-0" aria-hidden="true" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

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

              {/* Audio Mute Toggle */}
              <button
                type="button"
                aria-pressed={!isAudioMuted}
                onClick={handleToggleMute}
                className={`flex p-2 rounded-xl transition-colors cursor-pointer border min-w-[44px] min-h-[44px] items-center justify-center ${
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
      {/* 2. MOBILE 4-DESTINATION BOTTOM NAVIGATION BAR (< lg viewports) */}
      {/* ============================================================== */}
      <nav
        aria-label="ناوبری موبایل"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF]/96 backdrop-blur-md border-t border-[#E5E1EB] pb-safe select-none touch-manipulation"
      >
        <div className="grid grid-cols-4 items-center h-16 max-w-lg mx-auto px-2">
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
                  className={`w-12 h-7 rounded-xl flex items-center justify-center transition-colors ${
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
                  className={`text-[11px] mt-0.5 tracking-tight whitespace-nowrap ${
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
    </>
  );
};
