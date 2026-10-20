export interface ActiveOnlineUser {
  sessionId: string;
  visitorId: string;
  device: 'mobile' | 'desktop' | 'tablet';
  browser: string;
  os: string;
  currentPath: string;
  pageTitle: string;
  lastSeen: number;
  isCurrentUser: boolean;
  cityLabel?: string;
}

export interface DayTrafficStats {
  date: string;
  dayName: string;
  persianDate: string;
  visits: number;
  uniques: number;
}

export interface DeviceTrafficShare {
  device: string;
  label: string;
  count: number;
  percentage: number;
}

export interface BrowserTrafficShare {
  browser: string;
  label: string;
  count: number;
  percentage: number;
}

export interface PageTrafficStats {
  path: string;
  title: string;
  visits: number;
  percentage: number;
}

export interface LiveTrafficEvent {
  id: string;
  timestamp: string;
  timeAgo: string;
  type: 'pageview' | 'quiz_start' | 'stage_pass' | 'badge_earned' | 'search' | 'note_saved';
  title: string;
  path: string;
  device: 'mobile' | 'desktop' | 'tablet';
}

export interface SiteAnalyticsData {
  adminView?: boolean;
  isAdminView?: boolean;
  detailedAnalyticsRedacted?: boolean;
  retentionPolicyDays?: number;
  onlineUsersCount: number;
  onlineSessions: ActiveOnlineUser[];
  today: {
    visits: number;
    uniques: number;
    date: string;
    persianDate: string;
    hourlyDistribution: number[]; // 24 hours
  };
  yesterday: {
    visits: number;
    uniques: number;
    date: string;
    persianDate: string;
  };
  week: {
    totalVisits: number;
    totalUniques: number;
    days: DayTrafficStats[];
  };
  month: {
    totalVisits: number;
    totalUniques: number;
  };
  allTime: {
    totalVisits: number;
    totalUniques: number;
  };
  avgSessionDurationSeconds: number;
  bounceRatePercentage: number;
  deviceBreakdown: DeviceTrafficShare[];
  browserBreakdown: BrowserTrafficShare[];
  topPages: PageTrafficStats[];
  recentEvents: LiveTrafficEvent[];
  lastUpdated: string;
}
