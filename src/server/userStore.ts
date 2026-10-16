import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
const USERS_FILE = path.resolve(DATA_DIR, 'users_store.json');

export interface SyncedUserProfile {
  userId: string;
  name: string;
  avatar: string;
  xp: number;
  streakDays: number;
  totalStudyMinutes: number;
  completedChapters: string[];
  completedStages: Record<string, any>;
  unlockedBadgeIds: string[];
  bookmarkedChapters: string[];
  lastSyncedAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  avatar: string;
  xp: number;
  streakDays: number;
  tier: 'diamond' | 'gold' | 'silver' | 'bronze' | 'participant';
  isCurrentUser: boolean;
}

class UserSyncManager {
  private users: Map<string, SyncedUserProfile> = new Map();
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureDataLoaded();
  }

  private ensureDataLoaded() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(USERS_FILE)) {
        const raw = fs.readFileSync(USERS_FILE, 'utf-8');
        const parsed: Record<string, SyncedUserProfile> = JSON.parse(raw);
        for (const [id, profile] of Object.entries(parsed)) {
          this.users.set(id, profile);
        }
      } else {
        this.seedInitialCompetitors();
        this.saveImmediately();
      }
    } catch (err) {
      console.error('Error loading users store:', err);
      this.seedInitialCompetitors();
    }
  }

  private seedInitialCompetitors() {
    const peers: SyncedUserProfile[] = [
      {
        userId: 'u_sara_kiani',
        name: 'دکتر سارا کیانی (بالینی)',
        avatar: '👩‍⚕️',
        xp: 1420,
        streakDays: 14,
        totalStudyMinutes: 280,
        completedChapters: ['psy_01', 'psy_02', 'psy_03'],
        completedStages: {},
        unlockedBadgeIds: ['b1', 'b2'],
        bookmarkedChapters: [],
        lastSyncedAt: new Date().toISOString(),
      },
      {
        userId: 'u_amir_nazari',
        name: 'امیرمحمد نظری (ارشد شناختی)',
        avatar: '👨‍🎓',
        xp: 1190,
        streakDays: 9,
        totalStudyMinutes: 210,
        completedChapters: ['psy_01', 'psy_04'],
        completedStages: {},
        unlockedBadgeIds: ['b1'],
        bookmarkedChapters: [],
        lastSyncedAt: new Date().toISOString(),
      },
      {
        userId: 'u_maryam_shayesteh',
        name: 'مریم شایسته (روان‌درمانگر)',
        avatar: '👩‍🏫',
        xp: 940,
        streakDays: 7,
        totalStudyMinutes: 185,
        completedChapters: ['psy_01'],
        completedStages: {},
        unlockedBadgeIds: ['b1'],
        bookmarkedChapters: [],
        lastSyncedAt: new Date().toISOString(),
      },
      {
        userId: 'u_alireza_rad',
        name: 'علیرضا راد (پژوهشگر نورو)',
        avatar: '👨‍🔬',
        xp: 820,
        streakDays: 6,
        totalStudyMinutes: 160,
        completedChapters: ['psy_02'],
        completedStages: {},
        unlockedBadgeIds: ['b1'],
        bookmarkedChapters: [],
        lastSyncedAt: new Date().toISOString(),
      },
      {
        userId: 'u_parisa_mohammadi',
        name: 'پریسا محمدی (دانشجوی دکتری)',
        avatar: '👩‍💻',
        xp: 690,
        streakDays: 5,
        totalStudyMinutes: 140,
        completedChapters: ['psy_01'],
        completedStages: {},
        unlockedBadgeIds: [],
        bookmarkedChapters: [],
        lastSyncedAt: new Date().toISOString(),
      },
      {
        userId: 'u_kian_arjmand',
        name: 'کیان ارجمند',
        avatar: '🧑‍🎨',
        xp: 540,
        streakDays: 4,
        totalStudyMinutes: 110,
        completedChapters: ['psy_03'],
        completedStages: {},
        unlockedBadgeIds: [],
        bookmarkedChapters: [],
        lastSyncedAt: new Date().toISOString(),
      },
    ];

    for (const p of peers) {
      this.users.set(p.userId, p);
    }
  }

  private scheduleSave() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveImmediately();
      this.saveTimeout = null;
    }, 2000);
  }

  private saveImmediately() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const obj: Record<string, SyncedUserProfile> = {};
      for (const [id, profile] of this.users.entries()) {
        obj[id] = profile;
      }
      fs.writeFileSync(USERS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save users store to file:', err);
    }
  }

  public syncUser(profile: Partial<SyncedUserProfile> & { userId: string }): SyncedUserProfile {
    const existing = this.users.get(profile.userId) || {
      userId: profile.userId,
      name: profile.name || 'دانشجوی روان‌شناسی',
      avatar: profile.avatar || '🦉',
      xp: 0,
      streakDays: 1,
      totalStudyMinutes: 0,
      completedChapters: [],
      completedStages: {},
      unlockedBadgeIds: [],
      bookmarkedChapters: [],
      lastSyncedAt: new Date().toISOString(),
    };

    const updated: SyncedUserProfile = {
      ...existing,
      ...profile,
      lastSyncedAt: new Date().toISOString(),
    };

    this.users.set(profile.userId, updated);
    this.scheduleSave();
    return updated;
  }

  public getUser(userId: string): SyncedUserProfile | null {
    return this.users.get(userId) || null;
  }

  public getLeaderboard(currentUserId?: string): {
    leagueName: string;
    countdownDaysRemaining: number;
    currentUserRank: number;
    leaderboard: LeaderboardEntry[];
  } {
    const allUsers = Array.from(this.users.values());

    // Sort descending by XP
    allUsers.sort((a, b) => (b.xp || 0) - (a.xp || 0));

    let userRank = -1;
    const leaderboard: LeaderboardEntry[] = allUsers.map((u, index) => {
      const rank = index + 1;
      const isCurrentUser = Boolean(currentUserId && u.userId === currentUserId);
      if (isCurrentUser) {
        userRank = rank;
      }

      let tier: LeaderboardEntry['tier'] = 'participant';
      if (rank === 1) tier = 'diamond';
      else if (rank === 2) tier = 'gold';
      else if (rank === 3) tier = 'silver';
      else if (rank <= 6) tier = 'bronze';

      return {
        rank,
        userId: u.userId,
        name: isCurrentUser ? `${u.name} (شما)` : u.name,
        avatar: u.avatar || '🦉',
        xp: u.xp || 0,
        streakDays: u.streakDays || 1,
        tier,
        isCurrentUser,
      };
    });

    // Calculate days remaining until weekly league reset (Friday midnight)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 is Sunday, 5 is Friday
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;

    return {
      leagueName: 'لیگ الماس (Diamond League)',
      countdownDaysRemaining: daysUntilFriday,
      currentUserRank: userRank > 0 ? userRank : 3,
      leaderboard: leaderboard.slice(0, 15),
    };
  }
}

export const userSyncManager = new UserSyncManager();
