import React, { useState, useEffect, useMemo, useRef } from 'react';
import { psychologySections } from './data/psychologyCurriculum';
import { Chapter, UserProgress, SupportTicket, DifficultyLevel, StageCompletionRecord } from './types/psychology';
import { BadgeDefinition } from './types/badges';
import { BADGE_DEFINITIONS, getAllBadgeProgress, findNewlyUnlockedBadges } from './data/badgeDefinitions';
import { loadUserProgress, saveUserProgress, loadSupportTickets, saveSupportTickets } from './utils/storage';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { BookReaderView } from './components/BookReaderView';
import { QuizCenterView } from './components/QuizCenterView';
import { BadgesView } from './components/BadgesView';
import { BadgeUnlockModal } from './components/BadgeUnlockModal';
import { AnalyticsView } from './components/AnalyticsView';
import { SupportSystemView } from './components/SupportSystemView';
import { AdvancedSearchModal } from './components/AdvancedSearchModal';
import { SettingsModal } from './components/SettingsModal';
import { NotebookView } from './components/NotebookView';
import { SourceCodeModal } from './components/SourceCodeModal';
import { StageExecutionProvider } from './context/StageExecutionContext';
import { PomodoroTimerModal } from './components/PomodoroTimerModal';
import { SiteTrafficAnalyticsModal } from './components/SiteTrafficAnalyticsModal';
import { trackSiteEvent, sendHeartbeatPing } from './utils/siteTracker';
import { usePWAInstall } from './utils/usePWAInstall';
import { WifiOff } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'book' | 'quiz' | 'analytics' | 'badges' | 'support' | 'notes'>('dashboard');
  const [currentChapter, setCurrentChapter] = useState<Chapter>(psychologySections[0].chapters[0]);
  const [quizTargetChapter, setQuizTargetChapter] = useState<Chapter | null>(null);

  const [progress, setProgress] = useState<UserProgress>(loadUserProgress);
  const [tickets, setTickets] = useState<SupportTicket[]>(loadSupportTickets);

  const [newlyUnlockedBadge, setNewlyUnlockedBadge] = useState<BadgeDefinition | null>(null);

  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isSourceCodeOpen, setIsSourceCodeOpen] = useState<boolean>(false);
  const [isPomodoroOpen, setIsPomodoroOpen] = useState<boolean>(false);
  const [isTrafficModalOpen, setIsTrafficModalOpen] = useState<boolean>(false);
  const [onlineCount, setOnlineCount] = useState<number>(1);

  const { isOffline } = usePWAInstall();

  // Track unlocked badges
  const evaluatedBadges = useMemo(() => {
    return getAllBadgeProgress(progress, psychologySections);
  }, [progress]);

  const unlockedBadgeCount = useMemo(() => {
    return evaluatedBadges.filter((b) => b.isUnlocked).length;
  }, [evaluatedBadges]);

  const prevUnlockedIdsRef = useRef<string[]>(
    progress.unlockedBadgeIds || evaluatedBadges.filter((b) => b.isUnlocked).map((b) => b.badge.id)
  );

  // Check for badge unlocks whenever progress changes
  const checkBadgeUnlocks = (newProg: UserProgress) => {
    const freshUnlocked = findNewlyUnlockedBadges(
      prevUnlockedIdsRef.current,
      newProg,
      psychologySections
    );

    if (freshUnlocked.length > 0) {
      const firstNew = freshUnlocked[0];
      setNewlyUnlockedBadge(firstNew);
      const allUnlockedIds = [
        ...prevUnlockedIdsRef.current,
        ...freshUnlocked.map((b) => b.id),
      ];
      prevUnlockedIdsRef.current = allUnlockedIds;
      return allUnlockedIds;
    }
    return prevUnlockedIdsRef.current;
  };

  // Sync progress to localStorage
  useEffect(() => {
    saveUserProgress(progress);
  }, [progress]);

  // Sync tickets to localStorage
  useEffect(() => {
    saveSupportTickets(tickets);
  }, [tickets]);

  // Keyboard shortcut Ctrl+K or Cmd+K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getTabTitle = (tab: string) => {
    switch (tab) {
      case 'dashboard': return 'مسیر یادگیری (سرفصل‌ها)';
      case 'book': return 'کتابچه و درس‌های روان‌شناسی';
      case 'quiz': return 'تمرین و آزمون‌های مفهومی';
      case 'analytics': return 'لیگ و کارنامه تحصیلی';
      case 'badges': return 'مدال‌ها و افتخارات';
      case 'support': return 'سوپر دوئو (هوش مصنوعی)';
      case 'notes': return 'دفترچه یادداشت و واژگان';
      default: return 'روان‌لینگو';
    }
  };

  // Real-time visitor tracking and active session heartbeat
  useEffect(() => {
    const title = getTabTitle(activeTab);
    const path = `/${activeTab}`;

    trackSiteEvent({
      eventType: 'pageview',
      path,
      title,
    });

    const ping = async () => {
      const count = await sendHeartbeatPing(path, title);
      if (count !== null) {
        setOnlineCount(count);
      }
    };

    ping();
    const interval = setInterval(ping, 20000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        ping();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeTab]);

  const handleSelectChapter = (chapter: Chapter) => {
    setCurrentChapter(chapter);
    setActiveTab('book');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartQuiz = (chapter?: Chapter) => {
    setQuizTargetChapter(chapter || currentChapter);
    setActiveTab('quiz');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleBookmark = (chapterId: string) => {
    setProgress((prev) => {
      const exists = prev.bookmarkedChapters.includes(chapterId);
      return {
        ...prev,
        bookmarkedChapters: exists
          ? prev.bookmarkedChapters.filter((id) => id !== chapterId)
          : [...prev.bookmarkedChapters, chapterId],
      };
    });
  };

  const handleTogglePin = (chapterId: string) => {
    setProgress((prev) => {
      const exists = prev.pinnedChapters.includes(chapterId);
      return {
        ...prev,
        pinnedChapters: exists
          ? prev.pinnedChapters.filter((id) => id !== chapterId)
          : [...prev.pinnedChapters, chapterId],
      };
    });
  };

  const handleSaveNote = (chapterId: string, noteText: string) => {
    setProgress((prev) => ({
      ...prev,
      chapterNotes: {
        ...prev.chapterNotes,
        [chapterId]: noteText,
      },
    }));
  };

  const handleMarkCompleted = (chapterId: string) => {
    setProgress((prev) => {
      const exists = prev.completedChapters.includes(chapterId);
      const updatedProg = {
        ...prev,
        completedChapters: exists
          ? prev.completedChapters.filter((id) => id !== chapterId)
          : [...prev.completedChapters, chapterId],
      };
      const updatedBadgeIds = checkBadgeUnlocks(updatedProg);
      return { ...updatedProg, unlockedBadgeIds: updatedBadgeIds };
    });
  };

  const handleRecordQuizResult = (
    chapterId: string,
    questionId: string,
    isCorrect: boolean,
    userAnswer: any,
    timeSpentSeconds: number,
    difficulty: DifficultyLevel
  ) => {
    setProgress((prev) => {
      const newHistoryItem = {
        chapterId,
        questionId,
        isCorrect,
        userAnswer,
        timestamp: Date.now(),
        timeSpentSeconds,
        difficulty,
      };

      // Add to completed chapters if correct
      const updatedCompleted = isCorrect && !prev.completedChapters.includes(chapterId)
        ? [...prev.completedChapters, chapterId]
        : prev.completedChapters;

      const updatedProg: UserProgress = {
        ...prev,
        quizHistory: [newHistoryItem, ...prev.quizHistory],
        completedChapters: updatedCompleted,
        totalStudyMinutes: prev.totalStudyMinutes + Math.max(1, Math.round(timeSpentSeconds / 60)),
      };

      const updatedBadgeIds = checkBadgeUnlocks(updatedProg);
      return { ...updatedProg, unlockedBadgeIds: updatedBadgeIds };
    });
  };

  const handleCompleteStage = (record: StageCompletionRecord) => {
    setProgress((prev) => {
      const currentCompleted = prev.completedStages || {};
      const updatedStages = {
        ...currentCompleted,
        [record.stageNumber]: record,
      };

      const newHistoryItem = {
        chapterId: 'ch-1',
        questionId: `stage-${record.stageNumber}`,
        isCorrect: true,
        userAnswer: 'completed',
        timestamp: Date.now(),
        timeSpentSeconds: 45,
        difficulty: 'intermediate' as DifficultyLevel,
      };

      const updatedProg: UserProgress = {
        ...prev,
        completedStages: updatedStages,
        unlockedStageNumber: Math.max(prev.unlockedStageNumber || 1, record.stageNumber + 1),
        quizHistory: [newHistoryItem, ...prev.quizHistory],
        totalStudyMinutes: prev.totalStudyMinutes + 3,
        streakDays: prev.streakDays < 1 ? 1 : prev.streakDays,
      };

      const updatedBadgeIds = checkBadgeUnlocks(updatedProg);
      return { ...updatedProg, unlockedBadgeIds: updatedBadgeIds };
    });
  };

  const handleAddTicket = (newTicket: SupportTicket) => {
    setTickets((prev) => [newTicket, ...prev]);
  };

  const handleAskMentorAboutChapter = (chapterTitle: string, sectionTitle: string) => {
    setActiveTab('support');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogStudyTime = (chapterId: string, seconds: number, xpBonus: number) => {
    setProgress((prev) => {
      const currentChapterSecs = prev.chapterStudyTime?.[chapterId] || 0;
      const updatedChapterStudyTime = {
        ...(prev.chapterStudyTime || {}),
        [chapterId]: currentChapterSecs + seconds,
      };
      const additionalMinutes = Math.max(1, Math.round(seconds / 60));
      const updatedProg: UserProgress = {
        ...prev,
        chapterStudyTime: updatedChapterStudyTime,
        totalStudyMinutes: prev.totalStudyMinutes + additionalMinutes,
        totalPomodoroSessionsCompleted: (prev.totalPomodoroSessionsCompleted || 0) + 1,
        streakDays: prev.streakDays < 1 ? 1 : prev.streakDays,
      };
      const updatedBadgeIds = checkBadgeUnlocks(updatedProg);
      return { ...updatedProg, unlockedBadgeIds: updatedBadgeIds };
    });
  };

  const handleResetData = () => {
    localStorage.clear();
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-slate-900 font-sans flex flex-col selection:bg-[#D7FFB8] selection:text-[#2E7500]">
      {/* Offline Status Notice Banner */}
      {isOffline && (
        <div className="bg-amber-500 text-white text-xs font-black py-1.5 px-4 text-center flex items-center justify-center gap-2 shadow-xs">
          <WifiOff className="w-3.5 h-3.5" />
          <span>حالت آفلاین فعال است: تمامی سرفصل‌ها، متون کتابچه و مراحل کوئیز روان‌شناسی بدون نیاز به اینترنت در دسترس شما هستند.</span>
        </div>
      )}

      {/* Top Bar Contract Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenSourceCode={() => setIsSourceCodeOpen(true)}
        onOpenPomodoro={() => setIsPomodoroOpen(true)}
        onOpenTrafficAnalytics={() => setIsTrafficModalOpen(true)}
        streakDays={progress.streakDays}
        unlockedBadgeCount={unlockedBadgeCount}
        onlineCount={onlineCount}
      />

      {/* Main Body View */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pt-3 sm:pt-6 pb-24 lg:pb-8">
        {activeTab === 'dashboard' && (
          <StageExecutionProvider
            progress={progress}
            onCompleteStage={handleCompleteStage}
          >
            <DashboardView
              sections={psychologySections}
              progress={progress}
              onSelectChapter={handleSelectChapter}
              onStartQuiz={handleStartQuiz}
              onOpenNotes={() => setActiveTab('notes')}
              onOpenBadges={() => setActiveTab('badges')}
              onCompleteStage={handleCompleteStage}
            />
          </StageExecutionProvider>
        )}

        {activeTab === 'book' && (
          <BookReaderView
            sections={psychologySections}
            currentChapter={currentChapter}
            onSelectChapter={handleSelectChapter}
            onStartQuiz={handleStartQuiz}
            progress={progress}
            onToggleBookmark={handleToggleBookmark}
            onTogglePin={handleTogglePin}
            onSaveNote={handleSaveNote}
            onMarkCompleted={handleMarkCompleted}
            onAskMentorAboutChapter={handleAskMentorAboutChapter}
            onOpenPomodoro={() => setIsPomodoroOpen(true)}
            onUpdateSettings={(newSettings) =>
              setProgress((prev) => ({
                ...prev,
                customSettings: { ...prev.customSettings, ...newSettings },
              }))
            }
          />
        )}

        {activeTab === 'quiz' && (
          <QuizCenterView
            sections={psychologySections}
            selectedChapter={quizTargetChapter}
            onClearSelectedChapter={() => {
              setQuizTargetChapter(null);
              setActiveTab('dashboard');
            }}
            onSelectChapter={handleSelectChapter}
            progress={progress}
            onRecordQuizResult={handleRecordQuizResult}
            onOpenBadges={() => setActiveTab('badges')}
          />
        )}

        {activeTab === 'badges' && (
          <BadgesView
            sections={psychologySections}
            progress={progress}
            onSelectChapter={handleSelectChapter}
            onStartQuiz={handleStartQuiz}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            sections={psychologySections}
            progress={progress}
            onSelectChapter={handleSelectChapter}
            onOpenBadges={() => setActiveTab('badges')}
          />
        )}

        {activeTab === 'support' && (
          <SupportSystemView
            tickets={tickets}
            onAddTicket={handleAddTicket}
            selectedChapterTitle={currentChapter.title}
            selectedSectionTitle={
              psychologySections.find((s) => s.id === currentChapter.sectionId)?.title
            }
          />
        )}

        {activeTab === 'notes' && (
          <NotebookView
            sections={psychologySections}
            progress={progress}
            onSelectChapter={handleSelectChapter}
            onSaveNote={handleSaveNote}
          />
        )}
      </div>

      {/* Badge Unlock Celebration Modal */}
      <BadgeUnlockModal
        badge={newlyUnlockedBadge}
        onClose={() => setNewlyUnlockedBadge(null)}
        onViewAllBadges={() => {
          setNewlyUnlockedBadge(null);
          setActiveTab('badges');
        }}
      />

      {/* Advanced Search Modal */}
      <AdvancedSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        sections={psychologySections}
        progress={progress}
        onSelectChapter={handleSelectChapter}
      />

      {/* Customization & Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        progress={progress}
        onUpdateSettings={(newSettings) =>
          setProgress((prev) => ({
            ...prev,
            customSettings: { ...prev.customSettings, ...newSettings },
          }))
        }
        sections={psychologySections}
        onTogglePinChapter={handleTogglePin}
        onResetData={handleResetData}
      />

      {/* Source Code Inspector & Exporter Modal */}
      <SourceCodeModal
        isOpen={isSourceCodeOpen}
        onClose={() => setIsSourceCodeOpen(false)}
      />

      {/* Pomodoro Focus Session Timer Modal */}
      <PomodoroTimerModal
        isOpen={isPomodoroOpen}
        onClose={() => setIsPomodoroOpen(false)}
        chapter={currentChapter}
        progress={progress}
        onLogStudyTime={handleLogStudyTime}
      />

      {/* Live Site Traffic & Real-Time Visitor Analytics Modal */}
      <SiteTrafficAnalyticsModal
        isOpen={isTrafficModalOpen}
        onClose={() => setIsTrafficModalOpen(false)}
      />
    </div>
  );
}
