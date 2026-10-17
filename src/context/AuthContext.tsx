/**
 * React Authentication Context for Verified Google Sign-In & HttpOnly User Sessions
 * Project: PsychoMaster (روان‌لینگو) - Phase 5C Security Hardening
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { SyncedUserProfile } from '../worker/db/schema';
import { authService, GoogleLoginPayload, AuthResponse } from '../services/authService';
import { getOrCreateUserId, setUserId, setUserDisplayName, setUserAvatar } from '../utils/cloudSync';
import { loadUserProgress, saveUserProgress, getDefaultUserProgress } from '../utils/storage';

interface PendingMergeData {
  guestUserId: string;
  guestProgress: any;
  user: SyncedUserProfile;
}

interface AuthContextType {
  currentUser: SyncedUserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithGoogle: (payload: GoogleLoginPayload) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  updateUserProfile: (name: string, avatar: string) => Promise<boolean>;
  refreshCurrentUser: () => Promise<SyncedUserProfile | null>;
  mergeGuestProgress: (guestProgress?: any) => Promise<boolean>;
  skipMerge: () => void;
  isAccountModalOpen: boolean;
  setIsAccountModalOpen: (open: boolean) => void;
  isMergeModalOpen: boolean;
  setIsMergeModalOpen: (open: boolean) => void;
  pendingMergeData: PendingMergeData | null;
  openGoogleSignInModal: (mode?: 'signin' | 'signup') => void;
  isGoogleSignInModalOpen: boolean;
  setIsGoogleSignInModalOpen: (open: boolean) => void;
  authModalMode: 'signin' | 'signup';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<SyncedUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState<boolean>(false);
  const [isGoogleSignInModalOpen, setIsGoogleSignInModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');
  const [pendingMergeData, setPendingMergeData] = useState<PendingMergeData | null>(null);

  const applyAuthenticatedUser = useCallback((user: SyncedUserProfile) => {
    setUserId(user.userId);
    setUserDisplayName(user.name);
    setUserAvatar(user.avatar || '🎓');
    setCurrentUser(user);
    authService.setCachedUser(user);
  }, []);

  // Initialize session on mount via HttpOnly session cookie
  useEffect(() => {
    let isMounted = true;
    const initSession = async () => {
      try {
        const user = await authService.getCurrentUser();
        if (isMounted && user) {
          applyAuthenticatedUser(user);
        }
      } catch (err) {
        console.error('Session init error:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initSession();
    return () => {
      isMounted = false;
    };
  }, [applyAuthenticatedUser]);

  // Listen for real-time cloud sync updates so currentUser stays 100% up-to-date
  useEffect(() => {
    const handleUserSynced = (e: Event) => {
      const customEvent = e as CustomEvent<SyncedUserProfile>;
      const syncedProfile = customEvent.detail;
      if (!syncedProfile) return;
      setCurrentUser((prev) => {
        if (!prev || prev.userId !== syncedProfile.userId) return prev;
        const merged: SyncedUserProfile = {
          ...prev,
          ...syncedProfile,
          email: syncedProfile.email || prev.email,
          googleId: syncedProfile.googleId || prev.googleId,
          picture: syncedProfile.picture || prev.picture,
        };
        authService.setCachedUser(merged);
        return merged;
      });
    };

    window.addEventListener('psychomaster:user-synced', handleUserSynced);
    return () => {
      window.removeEventListener('psychomaster:user-synced', handleUserSynced);
    };
  }, []);

  const refreshCurrentUser = useCallback(async (): Promise<SyncedUserProfile | null> => {
    const user = await authService.getCurrentUser();
    if (user) {
      applyAuthenticatedUser(user);
      return user;
    }
    return null;
  }, [applyAuthenticatedUser]);

  const openGoogleSignInModal = useCallback((mode: 'signin' | 'signup' = 'signin') => {
    setAuthModalMode(mode);
    setIsGoogleSignInModalOpen(true);
  }, []);

  const loginWithGoogle = useCallback(
    async (payload: GoogleLoginPayload): Promise<AuthResponse> => {
      setIsLoading(true);
      try {
        const previousLocalUserId = getOrCreateUserId();
        const wasGuest = !currentUser && !previousLocalUserId.startsWith('usr_g_');
        const previousGuestProgress = wasGuest ? loadUserProgress(previousLocalUserId) : null;

        const res = await authService.loginWithGoogle(payload);

        if (res.ok && res.user) {
          applyAuthenticatedUser(res.user);

          // Preserve guest progress until a deliberate, verified merge operation runs
          const hasGuestProgressToMerge =
            wasGuest &&
            previousGuestProgress &&
            ((previousGuestProgress.totalStudyMinutes || 0) > 0 ||
              (previousGuestProgress.completedChapters?.length || 0) > 1 ||
              Object.keys(previousGuestProgress.completedStages || {}).length > 0);

          if (hasGuestProgressToMerge && previousLocalUserId !== res.user.userId) {
            setPendingMergeData({
              guestUserId: previousLocalUserId,
              guestProgress: previousGuestProgress,
              user: res.user,
            });
            setIsMergeModalOpen(true);
          }
        }
        return res;
      } finally {
        setIsLoading(false);
      }
    },
    [currentUser, applyAuthenticatedUser]
  );

  const mergeGuestProgress = useCallback(
    async (customGuestProgress?: any): Promise<boolean> => {
      if (!currentUser) return false;
      const guestUserId = pendingMergeData?.guestUserId || getOrCreateUserId();
      const rawProgress = customGuestProgress || pendingMergeData?.guestProgress;

      setIsLoading(true);
      try {
        const updated = await authService.mergeGuestProgress(guestUserId, rawProgress);
        if (updated) {
          applyAuthenticatedUser(updated);
          setIsMergeModalOpen(false);
          setPendingMergeData(null);
          return true;
        }
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [currentUser, pendingMergeData, applyAuthenticatedUser]
  );

  const skipMerge = useCallback(() => {
    setIsMergeModalOpen(false);
    setPendingMergeData(null);
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await authService.logout();
      setCurrentUser(null);
      setIsAccountModalOpen(false);
      const freshGuestId = 'usr_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      setUserId(freshGuestId);
      setUserDisplayName('دانشجوی روان‌شناسی');
      setUserAvatar('🦉');
      saveUserProgress(getDefaultUserProgress());
      window.dispatchEvent(new CustomEvent('psychomaster:user-logged-out'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateUserProfile = useCallback(
    async (name: string, avatar: string): Promise<boolean> => {
      if (!currentUser) return false;
      setIsLoading(true);
      try {
        const updated = await authService.updateProfile({ name, avatar });
        if (updated) {
          applyAuthenticatedUser(updated);
          return true;
        }
        return false;
      } catch (err) {
        console.error('Failed to update profile:', err);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [currentUser, applyAuthenticatedUser]
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
        isLoading,
        loginWithGoogle,
        logout,
        updateUserProfile,
        refreshCurrentUser,
        mergeGuestProgress,
        skipMerge,
        isAccountModalOpen,
        setIsAccountModalOpen,
        isMergeModalOpen,
        setIsMergeModalOpen,
        pendingMergeData,
        openGoogleSignInModal,
        isGoogleSignInModalOpen,
        setIsGoogleSignInModalOpen,
        authModalMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
