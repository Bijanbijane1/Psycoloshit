import { SiteAnalyticsData } from '../types/analytics';

const VISITOR_ID_KEY = 'psychomaster_visitor_id';
const SESSION_ID_KEY = 'psychomaster_session_id';

// Generate or retrieve persistent visitor ID (persists across visits)
export function getOrCreateVisitorId(): string {
  if (typeof window === 'undefined') return 'server_id';
  try {
    let vid = localStorage.getItem(VISITOR_ID_KEY);
    if (!vid) {
      vid = 'v_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      localStorage.setItem(VISITOR_ID_KEY, vid);
    }
    return vid;
  } catch {
    return 'fallback_visitor';
  }
}

// Generate or retrieve session ID (per browser session/tab)
export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'server_session';
  try {
    let sid = sessionStorage.getItem(SESSION_ID_KEY);
    if (!sid) {
      sid = 's_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      sessionStorage.setItem(SESSION_ID_KEY, sid);
    }
    return sid;
  } catch {
    return 'fallback_session';
  }
}

// Client device detection
export function detectDevice(): 'mobile' | 'desktop' | 'tablet' {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  const width = window.innerWidth;

  if (/(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP))))/.test(ua)) {
    return 'tablet';
  }
  if (/mobile|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop/.test(ua) || (width < 768 && 'ontouchstart' in window)) {
    return 'mobile';
  }
  if (width < 1024 && 'ontouchstart' in window) {
    return 'tablet';
  }
  return 'desktop';
}

// Browser name detection
export function detectBrowser(): string {
  if (typeof window === 'undefined') return 'Unknown';
  const ua = navigator.userAgent;
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'Opera';
  if (/Chrome\//i.test(ua) && !/Edg/i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  return 'Other';
}

// Operating System detection
export function detectOS(): string {
  if (typeof window === 'undefined') return 'Unknown';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Other';
}

// Send tracking event to backend (paused when offline)
export async function trackSiteEvent(payload: {
  eventType: 'pageview' | 'quiz_start' | 'stage_pass' | 'badge_earned' | 'search' | 'note_saved';
  path: string;
  title: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  if (typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    const visitorId = getOrCreateVisitorId();
    const sessionId = getOrCreateSessionId();
    const device = detectDevice();
    const browser = detectBrowser();
    const os = detectOS();

    await fetch('/api/analytics/track', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorId,
        sessionId,
        device,
        browser,
        os,
        path: payload.path,
        title: payload.title,
        eventType: payload.eventType,
        metadata: payload.metadata || {},
        referrer: document.referrer || '',
      }),
      keepalive: true,
    });
  } catch {
    // Fail silently in offline or network issues
  }
}

// Send heartbeat ping to keep online session alive (paused when offline or hidden tab)
export async function sendHeartbeatPing(currentPath: string, pageTitle: string): Promise<number | null> {
  if (typeof window === 'undefined') return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return null;
  try {
    const visitorId = getOrCreateVisitorId();
    const sessionId = getOrCreateSessionId();
    const device = detectDevice();
    const browser = detectBrowser();
    const os = detectOS();

    const res = await fetch('/api/analytics/ping', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorId,
        sessionId,
        device,
        browser,
        os,
        path: currentPath,
        title: pageTitle,
      }),
      keepalive: true,
    });
    if (res.ok) {
      const data = await res.json();
      return data.onlineUsersCount ?? null;
    }
  } catch {
    // Silent
  }
  return null;
}

/**
 * Builds the `GET /api/analytics/stats` URL with strict tier separation:
 * - General dashboard/public views NEVER append `?detailed=true`.
 * - `?detailed=true` is only appended when explicitly requested with an authenticated session.
 */
export function buildAnalyticsStatsUrl(
  detailed: boolean = false,
  isAuthenticated: boolean = false
): string {
  if (detailed && isAuthenticated) {
    return '/api/analytics/stats?detailed=true';
  }
  return '/api/analytics/stats';
}

export interface SiteTrafficStatsResult {
  data: SiteAnalyticsData | null;
  status: number;
  adminAccessDenied?: boolean;
  notice?: string;
}

/**
 * Fetches site traffic analytics with explicit tier separation (`public` vs `detailed` admin view).
 * Handles 401/403 on `?detailed=true` gracefully with a polite Persian notice ("دسترسی محدود به مدیر سیستم")
 * and falls back to public summary stats.
 */
export async function fetchSiteTrafficStatsWithTier(options?: {
  detailed?: boolean;
  isAuthenticated?: boolean;
}): Promise<SiteTrafficStatsResult> {
  try {
    const wantDetailed = Boolean(options?.detailed);
    const isAuthenticated = Boolean(options?.isAuthenticated);

    if (wantDetailed && !isAuthenticated) {
      const publicData = await fetchSiteTrafficStats();
      return {
        data: publicData,
        status: 401,
        adminAccessDenied: true,
        notice: 'دسترسی محدود به مدیر سیستم',
      };
    }

    const url = buildAnalyticsStatsUrl(wantDetailed, isAuthenticated);
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });

    if (res.status === 401 || res.status === 403) {
      const publicData = wantDetailed ? await fetchSiteTrafficStats() : null;
      return {
        data: publicData,
        status: res.status,
        adminAccessDenied: true,
        notice: 'دسترسی محدود به مدیر سیستم',
      };
    }

    if (!res.ok) {
      return { data: null, status: res.status };
    }

    const data = (await res.json()) as SiteAnalyticsData;
    return { data, status: 200 };
  } catch {
    return { data: null, status: 0 };
  }
}

// Fetch complete aggregated traffic analytics (Public summary tier by default)
export async function fetchSiteTrafficStats(): Promise<SiteAnalyticsData | null> {
  try {
    const res = await fetch('/api/analytics/stats', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

