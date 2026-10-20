import React, { useState, useEffect, useMemo, useRef } from 'react';
import { psychologySections } from './data/psychologyCurriculum';
import { Chapter, UserProgress, SupportTicket, DifficultyLevel, StageCompletionRecord } from './types/psychology';
import { BadgeDefinition } from './types/badges';
import { getAllBadgeProgress, findNewlyUnlockedBadges } from './data/badgeDefinitions';
import { loadUserProgress, saveUserProgress, loadSupportTickets, saveSupportTickets, getDefaultUserProgress, mergeCompletedStages } from './utils/storage';
import { Navbar, AppPrimaryTab } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { LearningView, LearningSubMode } from './components/LearningView';
import { UserPanelView, UserPanelSubView } from './components/UserPanelView';
import { BookReaderView } from './components/BookReaderView';
import { QuizCenterView, QuizCenterSubMode } from './components/QuizCenterView';
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
import { ReportExportModal } from './components/ReportExportModal';
import { OfflineSafeErrorBoundary } from './components/OfflineSafeErrorBoundary';
import { trackSiteEvent, sendHeartbeatPing } from './utils/siteTracker';
import { syncProgressToCloud, submitScoreToLeaderboard } from './utils/cloudSync';
import { usePWAInstall } from './utils/usePWAInstall';
import { WifiOff } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { GoogleSignInModal } from './components/GoogleSignInModal';
import { UserAccountModal } from './components/UserAccountModal';
import { GuestMergeModal } from './components/GuestMergeModal';

function AppContent() {
  const [activeTab, setActiveTab] = useState<AppPrimaryTab>('dashboard');
  const [learningSubMode, setLearningSubMode] = useState<LearningSubMode>('stages_100');
  const [userPanelSubView, setUserPanelSubView] = useState<UserPanelSubView>('overview');

  const [currentChapter, setCurrentChapter] = useState<Chapter>(psychologySections[0].chapters[0]);
  const [quizTargetChapter, setQuizTargetChapter] = useState<Chapter | null>(null);
  const [quizSubMode, setQuizSubMode] = useState<QuizCenterSubMode>('entrance_exam');
  const [examAttemptIdToReview, setExamAttemptIdToReview] = useState<string | null>(null);

  const [progress, setProgress] = useState<UserProgress>(() => loadUserProgress());
  const [tickets, setTickets] = useState<SupportTicket[]>(loadSupportTickets);

  const [newlyUnlockedBadge, setNewlyUnlockedBadge] = useState<BadgeDefinition | null>(null);

  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isSourceCodeOpen, setIsSourceCodeOpen] = useState<boolean>(false);
  const [isPomodoroOpen, setIsPomodoroOpen] = useState<boolean>(false);
  const [isTrafficModalOpen, setIsTrafficModalOpen] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const { isOffline } = usePWAInstall();
  const { currentUser, isLoading: isAuthLoading, isGoogleSignInModalOpen, setIsGoogleSignInModalOpen } = useAuth();
  const lastLoadedUserIdRef = useRef<string | null>(null);
  const progressRef = useRef<UserProgress>(progress);
  progressRef.current = progress;

  // Sync authenticated Google user data into local study progress using Golden Invariant merge
  useEffect(() => {
    if (currentUser) {
      const isSwitchingUser = lastLoadedUserIdRef.current !== currentUser.userId;
      lastLoadedUserIdRef.current = currentUser.userId;

      setProgress((prev) => {
        const base = isSwitchingUser ? loadUserProgress(currentUser.userId) : prev;
        const mergedChapters = Array.from(
          new Set([...(base.completedChapters || []), ...(currentUser.completedChapters || [])])
        );
        const mergedBookmarks = Array.from(
          new Set([...(base.bookmarkedChapters || []), ...(currentUser.bookmarkedChapters || [])])
        );
        const mergedStages = mergeCompletedStages(
          base.completedStages,
          (currentUser.completedStages as Record<string, StageCompletionRecord>) || null
        );
        const mergedBadges = Array.from(
          new Set([...(base.unlockedBadgeIds || []), ...(currentUser.unlockedBadgeIds || [])])
        );
        return {
          ...base,
          completedChapters: mergedChapters,
          bookmarkedChapters: mergedBookmarks,
          completedStages: mergedStages,
          unlockedBadgeIds: mergedBadges,
          streakDays: Math.max(base.streakDays || 1, currentUser.streakDays || 1),
          totalStudyMinutes: Math.max(base.totalStudyMinutes || 0, currentUser.totalStudyMinutes || 0),
        };
      });
    }
  }, [currentUser]);

  // Hydrate server-verified completedStages whenever `/api/user/sync` or `/api/leaderboard/submit` completes
  useEffect(() => {
    const handleUserSynced = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      const syncedProfile = customEvent.detail;
      if (!syncedProfile || !syncedProfile.completedStages) return;

      setProgress((prev) => {
        const mergedStages = mergeCompletedStages(
          prev.completedStages,
          syncedProfile.completedStages
        );
        const prevJson = JSON.stringify(prev.completedStages || {});
        const nextJson = JSON.stringify(mergedStages);
        if (prevJson === nextJson) return prev;
        return {
          ...prev,
          completedStages: mergedStages,
        };
      });
    };

    window.addEventListener('psychomaster:user-synced', handleUserSynced);
    return () => window.removeEventListener('psychomaster:user-synced', handleUserSynced);
  }, []);

  // Reset local progress when user logs out
  useEffect(() => {
    const handleLoggedOut = () => {
      lastLoadedUserIdRef.current = null;
      setProgress(getDefaultUserProgress());
    };
    window.addEventListener('psychomaster:user-logged-out', handleLoggedOut);
    return () => window.removeEventListener('psychomaster:user-logged-out', handleLoggedOut);
  }, []);

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

  // Sync progress to localStorage & Cloud (wait until initial auth session check finishes)
  useEffect(() => {
    saveUserProgress(progress, currentUser?.userId);
    if (!isAuthLoading && !isOffline) {
      let active = true;
      setIsSyncingCloud(true);
      syncProgressToCloud(progress).finally(() => {
        if (active) setIsSyncingCloud(false);
      });
      return () => {
        active = false;
      };
    }
  }, [progress, isAuthLoading, currentUser?.userId, isOffline]);

  // Debounced Auto-Sync on Reconnect (`window` `online` event)
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleOnlineReconnect = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        setIsSyncingCloud(true);
        syncProgressToCloud(progressRef.current).finally(() => {
          setIsSyncingCloud(false);
        });
      }, 450);
    };

    window.addEventListener('online', handleOnlineReconnect);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('online', handleOnlineReconnect);
    };
  }, []);

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
      case 'dashboard': return 'خانه (میز کار مطالعه)';
      case 'learning': return 'بخش یادگیری و سرفصل‌ها';
      case 'book': return 'کتابچه و درس‌های روان‌شناسی';
      case 'quiz': return 'مرکز آزمون و تمرین مفهومی';
      case 'profile': return 'پنل کاربری و پایش عملکرد';
      case 'analytics': return 'لیگ و کارنامه تحصیلی';
      case 'badges': return 'مدال‌ها و افتخارات';
      case 'support': return 'استاد راهنما (پشتیبانی علمی)';
      case 'notes': return 'دفترچه یادداشت و واژگان';
      default: return 'روان‌مستر';
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
    setLearningSubMode('book_reader');
    setActiveTab('learning');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenLearning = (mode: LearningSubMode = 'stages_100') => {
    setLearningSubMode(mode);
    setActiveTab('learning');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenUserPanel = (subView: UserPanelSubView = 'overview') => {
    setUserPanelSubView(subView);
    setActiveTab('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartQuiz = (chapter?: Chapter) => {
    if (chapter) {
      setQuizTargetChapter(chapter);
      setQuizSubMode('conceptual_practice');
    } else {
      setQuizTargetChapter(null);
      setQuizSubMode('entrance_exam');
    }
    setExamAttemptIdToReview(null);
    setActiveTab('quiz');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenExamSimulator = (attemptIdToReview?: string) => {
    setQuizTargetChapter(null);
    setQuizSubMode('entrance_exam');
    setExamAttemptIdToReview(attemptIdToReview ?? null);
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

    if (isCorrect) {
      submitScoreToLeaderboard(
        {
          rewardType: 'quiz_answer',
          chapterId,
          questionId,
          userAnswer,
          isCorrect: true,
        },
        progress.streakDays
      );
    }
  };

  const handleCompleteStage = (record: StageCompletionRecord) => {
    setProgress((prev) => {
      const normalizedRecord: StageCompletionRecord = {
        ...record,
        verified: Boolean(record.verified === true || record.source === 'online-verified'),
        source:
          record.verified === true || record.source === 'online-verified'
            ? 'online-verified'
            : 'offline-local',
      };
      const updatedStages = mergeCompletedStages(prev.completedStages, {
        [record.stageNumber]: normalizedRecord,
      });

      const alreadyRecordedInHistory = prev.quizHistory.some(
        (h) => h.questionId === `stage-${record.stageNumber}` && Date.now() - h.timestamp < 15000
      );

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
        quizHistory: alreadyRecordedInHistory ? prev.quizHistory : [newHistoryItem, ...prev.quizHistory],
        totalStudyMinutes: alreadyRecordedInHistory ? prev.totalStudyMinutes : prev.totalStudyMinutes + 3,
        streakDays: prev.streakDays < 1 ? 1 : prev.streakDays,
      };

      const updatedBadgeIds = checkBadgeUnlocks(updatedProg);
      return { ...updatedProg, unlockedBadgeIds: updatedBadgeIds };
    });
  };

  const handleAddTicket = (newTicket: SupportTicket) => {
    setTickets((prev) => [newTicket, ...prev]);
  };

  const handleAskMentorAboutChapter = (_chapterTitle: string, _sectionTitle: string) => {
    setActiveTab('support');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogStudyTime = (chapterId: string, seconds: number, _xpBonus: number) => {
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
    <div className="min-h-screen bg-[#F7F5F0] text-[#24243B] font-sans flex flex-col selection:bg-[#EAE4FF] selection:text-[#24243B]">
      {/* Offline Status Notice Banner */}
      {isOffline && (
        <div className="bg-[#FFF0C8] border-b border-[#E5A33D]/40 text-[#24243B] text-xs font-bold py-2 px-4 text-center flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5 text-[#C98A27]" />
          <span>حالت آفلاین فعال است: تمامی سرفصل‌ها، متون کتابچه و مراحل کوئیز بدون نیاز به اینترنت در دسترس هستند.</span>
        </div>
      )}

      {/* 5-Destination Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          if (tab === 'learning') {
            setLearningSubMode('stages_100');
          } else if (tab === 'profile') {
            setUserPanelSubView('overview');
          } else if (tab === 'quiz') {
            setQuizTargetChapter(null);
            setQuizSubMode('entrance_exam');
            setExamAttemptIdToReview(null);
          }
          setActiveTab(tab);
        }}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenSourceCode={() => setIsSourceCodeOpen(true)}
        onOpenPomodoro={() => setIsPomodoroOpen(true)}
        onOpenTrafficAnalytics={() => setIsTrafficModalOpen(true)}
        streakDays={progress.streakDays}
        unlockedBadgeCount={unlockedBadgeCount}
        onlineCount={onlineCount}
        isOffline={isOffline}
        isSyncingCloud={isSyncingCloud}
      />

      {/* Main Body View */}
      <div className="flex-1 max-w-6xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 pt-4 sm:pt-7 pb-24 lg:pb-12">
        <OfflineSafeErrorBoundary>
          {activeTab === 'dashboard' && (
            <StageExecutionProvider
              progress={progress}
              onCompleteStage={handleCompleteStage}
            >
              <DashboardView
                sections={psychologySections}
                progress={progress}
                currentChapter={currentChapter}
                onSelectChapter={handleSelectChapter}
                onStartQuiz={handleStartQuiz}
                onOpenNotes={() => handleOpenUserPanel('notes')}
                onOpenBadges={() => handleOpenUserPanel('badges')}
                onOpenLearning={handleOpenLearning}
                onOpenMentor={() => setActiveTab('support')}
                onOpenUserPanel={() => handleOpenUserPanel('overview')}
                onCompleteStage={handleCompleteStage}
              />
            </StageExecutionProvider>
          )}

          {activeTab === 'learning' && (
            <StageExecutionProvider
              progress={progress}
              onCompleteStage={handleCompleteStage}
            >
              <LearningView
                sections={psychologySections}
                currentChapter={currentChapter}
                progress={progress}
                initialSubMode={learningSubMode}
                onSubModeChange={setLearningSubMode}
                onSelectChapter={(chap) => setCurrentChapter(chap)}
                onStartQuiz={handleStartQuiz}
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
              onOpenBadges={() => handleOpenUserPanel('badges')}
              initialExamMode={quizSubMode}
              initialAttemptIdToReview={examAttemptIdToReview}
              onExamSubmitted={(_xpEarned, attempt) => {
                setProgress((prev) => {
                  const studyMins = Math.max(1, Math.round((attempt?.timeSpentSeconds || 60) / 60));
                  const updatedProg: UserProgress = {
                    ...prev,
                    totalStudyMinutes: prev.totalStudyMinutes + studyMins,
                    streakDays: prev.streakDays < 1 ? 1 : prev.streakDays,
                  };
                  const updatedBadgeIds = checkBadgeUnlocks(updatedProg);
                  return { ...updatedProg, unlockedBadgeIds: updatedBadgeIds };
                });
              }}
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

          {activeTab === 'profile' && (
            <UserPanelView
              sections={psychologySections}
              progress={progress}
              initialSubView={userPanelSubView}
              onSubViewChange={setUserPanelSubView}
              onSelectChapter={handleSelectChapter}
              onStartQuiz={handleStartQuiz}
              onOpenExamSimulator={handleOpenExamSimulator}
              onSaveNote={handleSaveNote}
              onOpenSearch={() => setIsSearchOpen(true)}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenPomodoro={() => setIsPomodoroOpen(true)}
              onOpenReportModal={() => setIsReportModalOpen(true)}
              onOpenTrafficAnalytics={() => setIsTrafficModalOpen(true)}
              onOpenSourceCode={() => setIsSourceCodeOpen(true)}
              onNavigateToLearning={() => handleOpenLearning('stages_100')}
              onlineCount={onlineCount}
              isOffline={isOffline}
              isSyncingCloud={isSyncingCloud}
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
              onOpenBadges={() => handleOpenUserPanel('badges')}
              onOpenReportModal={() => setIsReportModalOpen(true)}
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
        </OfflineSafeErrorBoundary>
      </div>

      {/* Badge Unlock Celebration Modal */}
      <BadgeUnlockModal
        badge={newlyUnlockedBadge}
        onClose={() => setNewlyUnlockedBadge(null)}
        onViewAllBadges={() => {
          setNewlyUnlockedBadge(null);
          handleOpenUserPanel('badges');
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

      {/* Official Academic Transcript & Report Export Modal */}
      <ReportExportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        progress={progress}
        sections={psychologySections}
      />

      {/* Production Google Sign-In & User Account Modals (Phase 5A) */}
      <GoogleSignInModal
        isOpen={isGoogleSignInModalOpen}
        onClose={() => setIsGoogleSignInModalOpen(false)}
      />
      <UserAccountModal />
      <GuestMergeModal />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
