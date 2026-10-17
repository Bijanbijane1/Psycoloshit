/**
 * Client-side Authentication Service for Verified Google Identity Services (GIS) & HttpOnly Sessions
 * Project: PsychoMaster (روان‌لینگو) - Phase 5C Security Hardening
 *
 * Security invariants:
 * - Never sends or accepts unverified { googleId, email, name, avatar } as proof of identity.
 * - Requires a cryptographically signed Google ID token (`credential`) for login.
 * - Never stores raw session tokens in localStorage or sessionStorage; relies on HttpOnly cookies (`credentials: 'include'`).
 */

import { SyncedUserProfile } from '../worker/db/schema';

const CACHED_USER_KEY = 'psychomaster_cached_auth_user';
const LEGACY_SESSION_TOKEN_KEY = 'psychomaster_session_token';

export interface GoogleLoginPayload {
  credential: string;
  expectedNonce?: string;
}

export interface AuthResponse {
  ok: boolean;
  user?: SyncedUserProfile;
  isNew?: boolean;
  code?: string;
  error?: string;
}

export interface AuthNonceResponse {
  ok: boolean;
  nonce?: string;
  clientIdConfigured?: boolean;
}

export class AuthService {
  private static instance: AuthService;

  private constructor() {
    this.purgeLegacyStoredTokens();
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private purgeLegacyStoredTokens(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(LEGACY_SESSION_TOKEN_KEY);
      sessionStorage.removeItem(LEGACY_SESSION_TOKEN_KEY);
    } catch {}
  }

  public clearCachedAuthState(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(LEGACY_SESSION_TOKEN_KEY);
      sessionStorage.removeItem(LEGACY_SESSION_TOKEN_KEY);
      localStorage.removeItem(CACHED_USER_KEY);
    } catch {}
  }

  public getCachedUser(): SyncedUserProfile | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(CACHED_USER_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SyncedUserProfile;
    } catch {
      return null;
    }
  }

  public setCachedUser(user: SyncedUserProfile | null): void {
    if (typeof window === 'undefined') return;
    try {
      if (user) {
        localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(CACHED_USER_KEY);
      }
    } catch {}
  }

  /**
   * Request a server-issued nonce bound to an HttpOnly cookie prior to GIS login
   */
  public async fetchAuthNonce(): Promise<AuthNonceResponse> {
    try {
      const res = await fetch('/api/auth/nonce', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Cache-Control': 'no-store' },
      });
      if (!res.ok) return { ok: false };
      return (await res.json()) as AuthNonceResponse;
    } catch {
      return { ok: false };
    }
  }

  /**
   * Authenticate with Google using a signed GIS ID token (`credential`)
   */
  public async loginWithGoogle(payload: GoogleLoginPayload): Promise<AuthResponse> {
    if (!payload || typeof payload.credential !== 'string' || !payload.credential.trim()) {
      return {
        ok: false,
        error: 'توکن رسمی احراز هویت گوگل (credential) الزامی است.',
      };
    }

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credential: payload.credential.trim(),
          expectedNonce: payload.expectedNonce,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        return {
          ok: false,
          code: data.code,
          error: data.error || 'خطا در تایید هویت با سرور.',
        };
      }

      if (data.user) {
        this.setCachedUser(data.user);
      }

      return {
        ok: true,
        user: data.user,
        isNew: data.isNew,
      };
    } catch (err) {
      console.error('Login request failed:', err);
      return {
        ok: false,
        error: 'خطای شبکه در ارتباط با سرور احراز هویت.',
      };
    }
  }

  /**
   * Validate existing HttpOnly session cookie against the server
   */
  public async getCurrentUser(): Promise<SyncedUserProfile | null> {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-store',
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          this.clearCachedAuthState();
        }
        return null;
      }

      const data = await res.json();
      if (data.user) {
        this.setCachedUser(data.user);
        return data.user;
      }
      return null;
    } catch (err) {
      console.warn('Failed to fetch current user session:', err);
      return null;
    }
  }

  /**
   * Deliberately merge guest progress and XP into the authenticated user account
   */
  public async mergeGuestProgress(
    guestUserId: string,
    guestProgress?: any
  ): Promise<SyncedUserProfile | null> {
    try {
      const res = await fetch('/api/auth/merge', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ guestUserId, guestProgress }),
      });

      if (!res.ok) return null;
      const data = await res.json();
      if (data.user) {
        this.setCachedUser(data.user);
      }
      return data.user || null;
    } catch (err) {
      console.error('Merge request failed:', err);
      return null;
    }
  }

  /**
   * Update profile display name and/or avatar on server
   */
  public async updateProfile(updates: { name?: string; avatar?: string }): Promise<SyncedUserProfile | null> {
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!res.ok) return null;
      const data = await res.json();
      if (data.user) {
        this.setCachedUser(data.user);
      }
      return data.user || null;
    } catch (err) {
      console.error('Update profile failed:', err);
      return null;
    }
  }

  /**
   * Terminate active session on server and purge local cached user state
   */
  public async logout(): Promise<boolean> {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {});
    } finally {
      this.clearCachedAuthState();
    }
    return true;
  }
}

export const authService = AuthService.getInstance();
