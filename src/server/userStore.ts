import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import type { StageCompletionRecord } from '../types/psychology.ts';
import {
  ALLOWED_REWARD_REASONS,
  parseCompletedStageNumberFromKey,
  sanitizeCompletedStages,
  sanitizeStreakDays,
  sanitizeStudyMinutes,
} from '../worker/rewards.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const USERS_FILE = path.resolve(DATA_DIR, 'users_store.json');
const SESSIONS_FILE = path.resolve(DATA_DIR, 'sessions_store.json');
const SQLITE_FILE = path.resolve(DATA_DIR, 'psychomaster.sqlite');

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
  email?: string;
  googleId?: string;
  picture?: string;
}

export interface UserSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
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

interface PersistedSessionsStore {
  sessions: Record<string, UserSession>;
  mergedKeys: string[];
}

export const SEEDED_COMPETITOR_IDS = new Set([
  'u_sara_kiani',
  'u_amir_nazari',
  'u_maryam_shayesteh',
  'u_alireza_rad',
  'u_parisa_mohammadi',
  'u_kian_arjmand',
]);

const DEFAULT_NAMES = new Set([
  '',
  'دانشجوی روان‌شناسی',
  'دانشجوی برتر روان‌لینگو',
]);

export class UserSyncManager {
  private users: Map<string, SyncedUserProfile> = new Map();
  private sessions: Map<string, UserSession> = new Map();
  private authNonces: Map<string, string> = new Map();
  private mergedKeys: Set<string> = new Set();
  private sqliteDb: DatabaseSync | null = null;
  private inMemoryOnly: boolean;

  constructor(options?: { inMemoryOnly?: boolean }) {
    this.inMemoryOnly = Boolean(options?.inMemoryOnly);
    this.initSqliteDatabase();
    this.ensureDataLoaded();
  }

  private initSqliteDatabase() {
    try {
      if (this.inMemoryOnly) {
        this.sqliteDb = new DatabaseSync(':memory:');
      } else {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        this.sqliteDb = new DatabaseSync(SQLITE_FILE);
      }
      this.sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS users (
          user_id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          avatar TEXT NOT NULL DEFAULT '🦉',
          xp INTEGER NOT NULL DEFAULT 0,
          streak_days INTEGER NOT NULL DEFAULT 1,
          total_study_minutes INTEGER NOT NULL DEFAULT 0,
          completed_chapters TEXT NOT NULL DEFAULT '[]',
          completed_stages TEXT NOT NULL DEFAULT '{}',
          unlocked_badge_ids TEXT NOT NULL DEFAULT '[]',
          bookmarked_chapters TEXT NOT NULL DEFAULT '[]',
          email TEXT,
          google_id TEXT,
          picture TEXT,
          last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_used_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS auth_nonces (
          nonce_hash TEXT PRIMARY KEY NOT NULL,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS xp_ledger (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          amount INTEGER NOT NULL,
          reason TEXT NOT NULL DEFAULT 'stage_completion',
          idempotency_key TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id
          ON users(google_id)
          WHERE google_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions(token_hash);
        CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires ON auth_nonces(expires_at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_ledger_user_idempotency
          ON xp_ledger(user_id, idempotency_key)
          WHERE idempotency_key IS NOT NULL;
      `);
    } catch (err) {
      console.warn('SQLite file init fallback to JSON store:', err);
      this.sqliteDb = null;
    }
  }

  private ensureDataLoaded() {
    if (this.inMemoryOnly) {
      this.seedInitialCompetitors();
      return;
    }
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      // 1. Load from JSON files if present
      if (fs.existsSync(USERS_FILE)) {
        try {
          const raw = fs.readFileSync(USERS_FILE, 'utf-8');
          const parsed: Record<string, SyncedUserProfile> = JSON.parse(raw);
          for (const [id, profile] of Object.entries(parsed)) {
            if (profile && profile.userId) {
              this.users.set(id, profile);
            }
          }
        } catch (e) {
          console.error('Error parsing users_store.json:', e);
        }
      }

      if (fs.existsSync(SESSIONS_FILE)) {
        try {
          const rawSessions = fs.readFileSync(SESSIONS_FILE, 'utf-8');
          const parsedSessions: PersistedSessionsStore = JSON.parse(rawSessions);
          if (parsedSessions.sessions) {
            for (const [hash, sess] of Object.entries(parsedSessions.sessions)) {
              if (sess && new Date(sess.expiresAt).getTime() > Date.now()) {
                this.sessions.set(hash, sess);
              }
            }
          }
          if (Array.isArray(parsedSessions.mergedKeys)) {
            for (const k of parsedSessions.mergedKeys) {
              this.mergedKeys.add(k);
            }
          }
        } catch (e) {
          console.error('Error parsing sessions_store.json:', e);
        }
      }

      // 2. Also load from SQLite database to merge any rows stored in SQLite
      if (this.sqliteDb) {
        try {
          const rows = this.sqliteDb.prepare('SELECT * FROM users').all() as any[];
          for (const row of rows) {
            const profile: SyncedUserProfile = {
              userId: row.user_id,
              name: row.name || 'دانشجوی روان‌شناسی',
              avatar: row.avatar || '🦉',
              xp: Number(row.xp) || 0,
              streakDays: Number(row.streak_days) || 1,
              totalStudyMinutes: Number(row.total_study_minutes) || 0,
              completedChapters: this.safeParseArray(row.completed_chapters),
              completedStages: this.safeParseObject(row.completed_stages),
              unlockedBadgeIds: this.safeParseArray(row.unlocked_badge_ids),
              bookmarkedChapters: this.safeParseArray(row.bookmarked_chapters),
              lastSyncedAt: row.last_synced_at || new Date().toISOString(),
              email: row.email || undefined,
              googleId: row.google_id || undefined,
              picture: row.picture || undefined,
            };
            this.users.set(profile.userId, profile);
          }

          const sessionRows = this.sqliteDb.prepare('SELECT * FROM sessions').all() as any[];
          for (const sRow of sessionRows) {
            if (sRow.token_hash && new Date(sRow.expires_at).getTime() > Date.now()) {
              this.sessions.set(sRow.token_hash, {
                id: sRow.id,
                userId: sRow.user_id,
                tokenHash: sRow.token_hash,
                expiresAt: sRow.expires_at,
                createdAt: sRow.created_at,
              });
            }
          }

          const ledgerRows = this.sqliteDb
            .prepare('SELECT user_id, idempotency_key FROM xp_ledger WHERE idempotency_key IS NOT NULL')
            .all() as any[];
          for (const lRow of ledgerRows) {
            if (lRow.idempotency_key) {
              const rawKey = String(lRow.idempotency_key);
              this.mergedKeys.add(rawKey);
              if (lRow.user_id && !rawKey.startsWith(`${lRow.user_id}:`)) {
                this.mergedKeys.add(`${lRow.user_id}:${rawKey}`);
              }
            }
          }
        } catch (sqlErr) {
          console.warn('Error loading rows from SQLite:', sqlErr);
        }
      }

      // 3. Seed initial competitors if database is empty
      if (this.users.size === 0) {
        this.seedInitialCompetitors();
      }

      this.saveImmediately();
    } catch (err) {
      console.error('Error loading users store:', err);
      if (this.users.size === 0) {
        this.seedInitialCompetitors();
      }
    }
  }

  private safeParseArray(raw: unknown): string[] {
    if (!raw || typeof raw !== 'string') return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  private safeParseObject(raw: unknown): Record<string, any> {
    if (!raw || typeof raw !== 'string') return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
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
      this.persistUserToSqlite(p);
    }
  }

  private persistUserToSqlite(u: SyncedUserProfile) {
    if (!this.sqliteDb) return;
    try {
      this.sqliteDb
        .prepare(`
          INSERT INTO users (
            user_id, name, avatar, xp, streak_days, total_study_minutes,
            completed_chapters, completed_stages, unlocked_badge_ids, bookmarked_chapters,
            email, google_id, picture, last_synced_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET
            name = excluded.name,
            avatar = excluded.avatar,
            xp = excluded.xp,
            streak_days = excluded.streak_days,
            total_study_minutes = excluded.total_study_minutes,
            completed_chapters = excluded.completed_chapters,
            completed_stages = excluded.completed_stages,
            unlocked_badge_ids = excluded.unlocked_badge_ids,
            bookmarked_chapters = excluded.bookmarked_chapters,
            email = COALESCE(excluded.email, users.email),
            google_id = COALESCE(excluded.google_id, users.google_id),
            picture = COALESCE(excluded.picture, users.picture),
            last_synced_at = excluded.last_synced_at,
            updated_at = datetime('now')
        `)
        .run(
          u.userId,
          u.name || 'دانشجوی روان‌شناسی',
          u.avatar || '🦉',
          u.xp || 0,
          u.streakDays || 1,
          u.totalStudyMinutes || 0,
          JSON.stringify(u.completedChapters || []),
          JSON.stringify(u.completedStages || {}),
          JSON.stringify(u.unlockedBadgeIds || []),
          JSON.stringify(u.bookmarkedChapters || []),
          u.email || null,
          u.googleId || null,
          u.picture || null,
          u.lastSyncedAt || new Date().toISOString()
        );
    } catch (err) {
      console.warn('SQLite user upsert warning:', err);
    }
  }

  private saveImmediately() {
    if (this.inMemoryOnly) return;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const usersObj: Record<string, SyncedUserProfile> = {};
      for (const [id, profile] of this.users.entries()) {
        usersObj[id] = profile;
      }
      fs.writeFileSync(USERS_FILE, JSON.stringify(usersObj, null, 2), 'utf-8');

      const sessionsObj: Record<string, UserSession> = {};
      for (const [hash, sess] of this.sessions.entries()) {
        sessionsObj[hash] = sess;
      }
      const sessionsPayload: PersistedSessionsStore = {
        sessions: sessionsObj,
        mergedKeys: Array.from(this.mergedKeys),
      };
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessionsPayload, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save users/sessions store to file:', err);
    }
  }

  public checkDatabaseHealth(): {
    ok: boolean;
    engine: string;
  } {
    if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare('SELECT 1 AS connection_test').get();
        return {
          ok: true,
          engine: 'node-sqlite-local',
        };
      } catch {}
    }
    return {
      ok: true,
      engine: 'local-json-fallback',
    };
  }

  /**
   * Synchronize user profile & progress safely:
   * - SERVER-OWNED XP PROTECTION: Existing users keep their stored server XP; new users start at 0 XP.
   * - Client-supplied `profile.xp` is completely ignored and never trusted.
   * - Accepts only explicitly allowed profile and progress fields.
   */
  public syncUser(profile: Partial<SyncedUserProfile> & { userId: string }): SyncedUserProfile {
    if (!profile.userId || typeof profile.userId !== 'string' || !profile.userId.trim()) {
      throw new Error('Invalid userId: must be a non-empty string');
    }
    const cleanUserId = profile.userId.trim();
    if (SEEDED_COMPETITOR_IDS.has(cleanUserId)) {
      throw new Error('Forbidden: Seeded competitor profiles cannot be modified');
    }
    const existing = this.users.get(cleanUserId);

    const incomingName = typeof profile.name === 'string' ? profile.name.trim() : '';
    const existingHasCustomName =
      existing && existing.name && !DEFAULT_NAMES.has(existing.name.trim());

    const resolvedName = existingHasCustomName
      ? (!DEFAULT_NAMES.has(incomingName) ? incomingName : existing.name)
      : (incomingName || existing?.name || 'دانشجوی روان‌شناسی');

    const incomingAvatar = typeof profile.avatar === 'string' ? profile.avatar.trim() : '';
    const resolvedAvatar =
      existing && existing.googleId && existing.avatar && incomingAvatar === '🦉'
        ? existing.avatar
        : (incomingAvatar || existing?.avatar || '🦉');

    const safeChapters = Array.isArray(profile.completedChapters)
      ? profile.completedChapters.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      : [];
    const safeBookmarks = Array.isArray(profile.bookmarkedChapters)
      ? profile.bookmarkedChapters.filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
      : [];
    const safeBadges = Array.isArray(profile.unlockedBadgeIds)
      ? profile.unlockedBadgeIds.filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
      : [];
    const safeStages =
      profile.completedStages && typeof profile.completedStages === 'object' && !Array.isArray(profile.completedStages)
        ? profile.completedStages
        : {};

    const mergedChapters = Array.from(
      new Set([...(existing?.completedChapters || []), ...safeChapters])
    );
    const mergedBookmarks = Array.from(
      new Set([...(existing?.bookmarkedChapters || []), ...safeBookmarks])
    );
    const mergedBadges = Array.from(
      new Set([...(existing?.unlockedBadgeIds || []), ...safeBadges])
    );
    const mergedStages = sanitizeCompletedStages(existing?.completedStages, safeStages);

    const resolvedMinutes = sanitizeStudyMinutes(
      existing?.totalStudyMinutes,
      profile.totalStudyMinutes
    );
    const resolvedStreak = sanitizeStreakDays(existing?.streakDays, profile.streakDays);

    // STRICT SERVER-OWNED XP: Never accept client-reported XP or inflate XP during profile sync.
    const serverOwnedXp = existing ? existing.xp : 0;

    const updated: SyncedUserProfile = {
      userId: cleanUserId,
      name: resolvedName,
      avatar: resolvedAvatar,
      xp: serverOwnedXp,
      streakDays: resolvedStreak,
      totalStudyMinutes: resolvedMinutes,
      completedChapters: mergedChapters,
      completedStages: mergedStages,
      unlockedBadgeIds: mergedBadges,
      bookmarkedChapters: mergedBookmarks,
      email: existing?.email,
      googleId: existing?.googleId,
      picture: existing?.picture,
      lastSyncedAt: new Date().toISOString(),
    };

    this.users.set(cleanUserId, updated);
    this.persistUserToSqlite(updated);
    this.saveImmediately();
    return updated;
  }

  public awardXp(params: {
    userId: string;
    xpEarned: number;
    reason?: string;
    stageRecord?: StageCompletionRecord;
    streakDays?: number;
    name?: string;
    avatar?: string;
    idempotencyKey: string;
  }): SyncedUserProfile {
    if (!params.userId || typeof params.userId !== 'string' || !params.userId.trim()) {
      throw new Error('Invalid award request: userId must be a non-empty string');
    }
    const cleanUserId = params.userId.trim();
    if (SEEDED_COMPETITOR_IDS.has(cleanUserId)) {
      throw new Error('Forbidden: Seeded competitor profiles cannot be modified');
    }

    const cleanKey = typeof params.idempotencyKey === 'string' ? params.idempotencyKey.trim() : '';
    if (!cleanKey) {
      throw new Error('Invalid award request: idempotencyKey must be a non-empty string');
    }

    const amount = Number(params.xpEarned);
    if (!Number.isInteger(amount) || amount < 1 || amount > 1000) {
      throw new Error('Invalid award request: amount must be an integer between 1 and 1000 inclusive');
    }

    const cleanReason =
      params.reason && typeof params.reason === 'string' && params.reason.trim()
        ? params.reason.trim()
        : 'stage_completion';
    if (!ALLOWED_REWARD_REASONS.has(cleanReason)) {
      throw new Error(`Invalid award request: unsupported reward reason '${cleanReason}'`);
    }

    const existing = this.users.get(cleanUserId);
    if (!existing) {
      throw new Error(`Cannot award XP: user '${cleanUserId}' not found`);
    }

    const scopedKey = `${cleanUserId}:${cleanKey}`;
    if (this.mergedKeys.has(scopedKey)) {
      return existing;
    }

    if (this.sqliteDb) {
      try {
        const dupRow = this.sqliteDb
          .prepare(
            'SELECT id FROM xp_ledger WHERE user_id = ? AND (idempotency_key = ? OR idempotency_key = ?) LIMIT 1'
          )
          .get(cleanUserId, cleanKey, scopedKey);
        if (dupRow) {
          this.mergedKeys.add(scopedKey);
          return existing;
        }

        const ledgerId = `xp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const res = this.sqliteDb
          .prepare(
            'INSERT OR IGNORE INTO xp_ledger (id, user_id, amount, reason, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(ledgerId, cleanUserId, amount, cleanReason, cleanKey, new Date().toISOString());
        if (Number(res.changes) === 0) {
          this.mergedKeys.add(scopedKey);
          return existing;
        }
      } catch {}
    }

    this.mergedKeys.add(scopedKey);

    existing.xp = (existing.xp || 0) + amount;
    if (params.streakDays && params.streakDays > existing.streakDays) {
      existing.streakDays = sanitizeStreakDays(existing.streakDays, params.streakDays);
    }
    if (params.name && !DEFAULT_NAMES.has(params.name.trim())) {
      existing.name = params.name.trim();
    }
    if (params.avatar && params.avatar.trim() && params.avatar.trim() !== '🦉') {
      existing.avatar = params.avatar.trim();
    }
    if (params.stageRecord) {
      existing.completedStages = sanitizeCompletedStages(existing.completedStages, {
        [String(params.stageRecord.stageNumber)]: params.stageRecord,
      });
    }
    existing.lastSyncedAt = new Date().toISOString();

    this.users.set(cleanUserId, existing);
    this.persistUserToSqlite(existing);
    this.saveImmediately();
    return existing;
  }

  public getVerifiedCompletedStageNumbers(userId: string): Set<number> {
    const completed = new Set<number>();
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return completed;
    }
    const cleanUserId = userId.trim();
    const prefix = `${cleanUserId}:`;

    for (const k of this.mergedKeys) {
      if (k.startsWith(prefix)) {
        const rawKey = k.slice(prefix.length);
        const stageNum = parseCompletedStageNumberFromKey(rawKey);
        if (stageNum !== null) {
          completed.add(stageNum);
        }
      }
    }

    if (this.sqliteDb) {
      try {
        const rows = this.sqliteDb
          .prepare(
            "SELECT idempotency_key FROM xp_ledger WHERE user_id = ? AND (idempotency_key LIKE 'stage_completion:stage_%' OR idempotency_key LIKE ?)"
          )
          .all(cleanUserId, `${cleanUserId}:stage_completion:stage_%`) as any[];
        for (const r of rows) {
          const raw = String(r.idempotency_key || '');
          const clean = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
          const stageNum = parseCompletedStageNumberFromKey(clean);
          if (stageNum !== null) {
            completed.add(stageNum);
          }
        }
      } catch {}
    }

    return completed;
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
        userId: isCurrentUser ? u.userId : `peer_rank_${rank}`,
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
      currentUserRank: userRank > 0 ? userRank : -1,
      leaderboard: leaderboard.slice(0, 15),
    };
  }

  public findUserByGoogleId(googleId: string): SyncedUserProfile | null {
    if (!googleId) return null;
    const clean = googleId.trim();
    for (const u of this.users.values()) {
      if (u.googleId === clean) return u;
    }
    return null;
  }

  public findUserByEmail(email: string): SyncedUserProfile | null {
    if (!email) return null;
    const lower = email.toLowerCase().trim();
    for (const u of this.users.values()) {
      if (u.email && u.email.toLowerCase().trim() === lower) return u;
    }
    return null;
  }

  public createAuthNonce(nonceHash: string, ttlSeconds: number = 600): void {
    if (!nonceHash || typeof nonceHash !== 'string' || !nonceHash.trim()) {
      throw new Error('nonceHash is required');
    }
    const cleanHash = nonceHash.trim();
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    for (const [k, exp] of this.authNonces.entries()) {
      if (new Date(exp).getTime() <= Date.now()) {
        this.authNonces.delete(k);
      }
    }
    this.authNonces.set(cleanHash, expiresAt);

    if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare('DELETE FROM auth_nonces WHERE expires_at <= ?').run(nowIso);
        this.sqliteDb
          .prepare(
            "INSERT OR REPLACE INTO auth_nonces (nonce_hash, expires_at, created_at) VALUES (?, ?, datetime('now'))"
          )
          .run(cleanHash, expiresAt);
      } catch {}
    }
  }

  public consumeAuthNonce(nonceHash: string): boolean {
    if (!nonceHash || typeof nonceHash !== 'string' || !nonceHash.trim()) {
      return false;
    }
    const cleanHash = nonceHash.trim();
    const nowIso = new Date().toISOString();

    const memExpires = this.authNonces.get(cleanHash);
    this.authNonces.delete(cleanHash);

    if (this.sqliteDb) {
      try {
        const res = this.sqliteDb
          .prepare('DELETE FROM auth_nonces WHERE nonce_hash = ? AND expires_at > ?')
          .run(cleanHash, nowIso);
        if (Number(res.changes) > 0) {
          return true;
        }
        return false;
      } catch {}
    }

    if (!memExpires) return false;
    return new Date(memExpires).getTime() > Date.now();
  }

  public hasUserSessions(userId: string): boolean {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return false;
    }
    const cleanId = userId.trim();
    const nowMs = Date.now();
    for (const sess of this.sessions.values()) {
      if (sess.userId === cleanId && new Date(sess.expiresAt).getTime() > nowMs) {
        return true;
      }
    }
    return false;
  }

  public deleteUserSessions(userId: string): boolean {
    if (!userId) return false;
    const cleanId = userId.trim();
    let deletedAny = false;
    for (const [hash, sess] of this.sessions.entries()) {
      if (sess.userId === cleanId) {
        this.sessions.delete(hash);
        deletedAny = true;
      }
    }
    if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare('DELETE FROM sessions WHERE user_id = ?').run(cleanId);
      } catch {}
    }
    if (deletedAny) {
      this.saveImmediately();
    }
    return deletedAny;
  }

  /**
   * Create or update a Google-authenticated user.
   * Resolves existing user strictly by verified Google `sub` (googleId).
   * Never links accounts solely because their email values match.
   */
  public createOrUpdateGoogleUser(params: {
    googleId: string;
    email: string;
    name?: string;
    avatar?: string;
    picture?: string;
    guestUserIdToMerge?: string;
    guestProgress?: Partial<SyncedUserProfile>;
    mode?: 'signin' | 'signup';
  }): { user: SyncedUserProfile; isNew: boolean } {
    const { googleId, email, name, avatar, picture, guestUserIdToMerge, guestProgress, mode } = params;
    const cleanGoogleId = googleId.trim();
    const cleanEmail = email.toLowerCase().trim();
    const incomingName = name ? name.trim() : '';

    // STRICT SUB RESOLUTION: Never link accounts solely by email.
    let existing = this.findUserByGoogleId(cleanGoogleId);

    if (existing) {
      existing.googleId = cleanGoogleId;
      existing.email = cleanEmail;
      if (picture) {
        existing.picture = picture;
      }

      const isExistingDefaultName = !existing.name || DEFAULT_NAMES.has(existing.name.trim());
      const isIncomingCustomName = Boolean(incomingName && !DEFAULT_NAMES.has(incomingName));

      if (mode === 'signup' && incomingName) {
        existing.name = incomingName;
      } else if (isExistingDefaultName && isIncomingCustomName) {
        existing.name = incomingName;
      } else if (mode !== 'signin' && isIncomingCustomName) {
        existing.name = incomingName;
      } else if (!existing.name) {
        existing.name = incomingName || 'دانشجوی روان‌شناسی';
      }

      if (avatar && avatar.trim()) {
        existing.avatar = avatar.trim();
      } else if (!existing.avatar) {
        existing.avatar = '🎓';
      }

      existing.lastSyncedAt = new Date().toISOString();
      this.users.set(existing.userId, existing);
      this.persistUserToSqlite(existing);

      if (guestUserIdToMerge && guestUserIdToMerge !== existing.userId) {
        existing = this.mergeGuestIntoUser(existing.userId, guestUserIdToMerge, guestProgress);
      } else {
        this.saveImmediately();
      }
      return { user: existing, isNew: false };
    }

    const newUserId = 'usr_g_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    const newUser: SyncedUserProfile = {
      userId: newUserId,
      name: incomingName || 'دانشجوی روان‌شناسی',
      avatar: avatar && avatar.trim() ? avatar.trim() : '🎓',
      xp: 0,
      streakDays: 1,
      totalStudyMinutes: 0,
      completedChapters: [],
      completedStages: {},
      unlockedBadgeIds: [],
      bookmarkedChapters: [],
      email: cleanEmail,
      googleId: cleanGoogleId,
      picture: picture || undefined,
      lastSyncedAt: new Date().toISOString(),
    };

    this.users.set(newUserId, newUser);
    this.persistUserToSqlite(newUser);

    let finalUser = newUser;
    if (guestUserIdToMerge && guestUserIdToMerge !== newUserId) {
      finalUser = this.mergeGuestIntoUser(newUserId, guestUserIdToMerge, guestProgress);
    } else {
      this.saveImmediately();
    }

    return { user: finalUser, isNew: true };
  }

  public createSession(userId: string, tokenHash: string, ttlSeconds = 30 * 24 * 3600): UserSession {
    const sessionId = 'sess_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    const session: UserSession = {
      id: sessionId,
      userId,
      tokenHash,
      expiresAt,
      createdAt: nowIso,
    };

    this.sessions.set(tokenHash, session);

    if (this.sqliteDb) {
      try {
        this.sqliteDb
          .prepare(
            'INSERT OR REPLACE INTO sessions (id, user_id, token_hash, expires_at, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(sessionId, userId, tokenHash, expiresAt, nowIso, nowIso);
      } catch (err) {
        console.warn('SQLite session insert warning:', err);
      }
    }

    this.saveImmediately();
    return session;
  }

  public validateSession(tokenHash: string): { session: UserSession; user: SyncedUserProfile } | null {
    if (!tokenHash) return null;
    const cleanHash = tokenHash.trim();
    const session = this.sessions.get(cleanHash);
    if (!session) return null;

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      this.deleteSession(cleanHash);
      return null;
    }

    const user = this.users.get(session.userId);
    if (!user) return null;

    return { session, user };
  }

  public deleteSession(tokenHash: string): boolean {
    if (!tokenHash) return false;
    const cleanHash = tokenHash.trim();
    const deleted = this.sessions.delete(cleanHash);
    if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare('DELETE FROM sessions WHERE token_hash = ?').run(cleanHash);
      } catch {}
    }
    this.saveImmediately();
    return deleted;
  }

  public mergeGuestIntoUser(
    targetUserId: string,
    guestUserId: string,
    guestProgress?: Partial<SyncedUserProfile>
  ): SyncedUserProfile {
    const targetUser = this.users.get(targetUserId);
    if (!targetUser) throw new Error('Target user not found for merge');

    if (
      !guestUserId ||
      guestUserId === targetUserId ||
      guestUserId.startsWith('usr_g_') ||
      SEEDED_COMPETITOR_IDS.has(guestUserId)
    ) {
      return targetUser;
    }

    const storedGuest = this.users.get(guestUserId);
    if (storedGuest && storedGuest.googleId) {
      return targetUser;
    }

    // Prioritize server-stored guest record over client-supplied guestProgress
    const guestSource = storedGuest || guestProgress;
    if (!guestSource) return targetUser;

    const mergeKey = `merge_${guestUserId}_to_${targetUserId}`;
    const globalGuestMergeKey = `merged_guest_${guestUserId}`;
    if (this.mergedKeys.has(mergeKey) || this.mergedKeys.has(globalGuestMergeKey)) {
      return targetUser;
    }

    const rawGuestMinutes = Number(guestSource.totalStudyMinutes) || 0;
    const guestMinutesToAdd = Math.min(600, Math.max(0, Math.round(rawGuestMinutes)));

    // Verify guest XP strictly from authoritative xp_ledger entries for guestUserId
    // that have NOT already been claimed by targetUserId.
    let ledgerBackedXp = 0;
    const transferableEntries: Array<{ amount: number; reason: string; idempotencyKey: string }> = [];

    if (this.sqliteDb) {
      try {
        const existingGuestMerge = this.sqliteDb
          .prepare(
            "SELECT id FROM xp_ledger WHERE reason = 'guest_merge' AND (idempotency_key = ? OR idempotency_key LIKE ?) LIMIT 1"
          )
          .get(mergeKey, `merge_${guestUserId}_to_%`);
        if (existingGuestMerge) {
          this.mergedKeys.add(mergeKey);
          this.mergedKeys.add(globalGuestMergeKey);
          return targetUser;
        }

        if (storedGuest) {
          const guestLedgerRows = this.sqliteDb
            .prepare(
              "SELECT amount, reason, idempotency_key FROM xp_ledger WHERE user_id = ? AND reason != 'guest_merge'"
            )
            .all(guestUserId) as any[];

          const targetLedgerRows = this.sqliteDb
            .prepare(
              'SELECT idempotency_key FROM xp_ledger WHERE user_id = ? AND idempotency_key IS NOT NULL'
            )
            .all(targetUserId) as any[];

          const targetExistingKeys = new Set<string>();
          for (const tr of targetLedgerRows) {
            if (tr.idempotency_key) {
              const raw = String(tr.idempotency_key);
              const clean = raw.startsWith(`${targetUserId}:`)
                ? raw.slice(`${targetUserId}:`.length)
                : raw;
              targetExistingKeys.add(clean);
            }
          }

          for (const gr of guestLedgerRows) {
            const amt = Number(gr.amount) || 0;
            if (amt <= 0 || amt > 1000) continue;
            const rawKey = gr.idempotency_key ? String(gr.idempotency_key).trim() : '';
            const cleanKey = rawKey.startsWith(`${guestUserId}:`)
              ? rawKey.slice(`${guestUserId}:`.length)
              : rawKey;
            if (cleanKey && targetExistingKeys.has(cleanKey)) {
              continue;
            }
            if (cleanKey) {
              targetExistingKeys.add(cleanKey);
            }
            transferableEntries.push({
              amount: amt,
              reason: String(gr.reason || 'stage_completion'),
              idempotencyKey: cleanKey || `${mergeKey}_evt_${transferableEntries.length + 1}`,
            });
            ledgerBackedXp += amt;
          }
        }
      } catch {}
    }

    const guestXp = storedGuest ? Math.min(Math.max(0, storedGuest.xp), ledgerBackedXp) : 0;
    const nowIso = new Date().toISOString();

    if (this.sqliteDb) {
      try {
        const ledgerId = `xp_merge_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const insertRes = this.sqliteDb
          .prepare(
            'INSERT OR IGNORE INTO xp_ledger (id, user_id, amount, reason, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(ledgerId, targetUserId, 0, 'guest_merge', mergeKey, nowIso);
        if (Number(insertRes.changes) === 0) {
          this.mergedKeys.add(mergeKey);
          this.mergedKeys.add(globalGuestMergeKey);
          return targetUser;
        }

        let remaining = guestXp;
        let idx = 1;
        for (const entry of transferableEntries) {
          if (remaining <= 0) break;
          const chunk = Math.min(remaining, entry.amount, 1000);
          if (chunk <= 0) continue;
          const entryId = `xp_merge_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
          this.sqliteDb
            .prepare(
              'INSERT OR IGNORE INTO xp_ledger (id, user_id, amount, reason, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?)'
            )
            .run(entryId, targetUserId, chunk, entry.reason, entry.idempotencyKey, nowIso);
          this.mergedKeys.add(`${targetUserId}:${entry.idempotencyKey}`);
          remaining -= chunk;
          idx++;
        }
      } catch {}
    }

    this.mergedKeys.add(mergeKey);
    this.mergedKeys.add(globalGuestMergeKey);

    const safeGuestChapters = Array.isArray(guestSource.completedChapters)
      ? guestSource.completedChapters.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      : [];
    const safeGuestBookmarks = Array.isArray(guestSource.bookmarkedChapters)
      ? guestSource.bookmarkedChapters.filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
      : [];
    const safeGuestBadges = Array.isArray(guestSource.unlockedBadgeIds)
      ? guestSource.unlockedBadgeIds.filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
      : [];

    const mergedChapters = Array.from(
      new Set([...(targetUser.completedChapters || []), ...safeGuestChapters])
    );
    const mergedBookmarks = Array.from(
      new Set([...(targetUser.bookmarkedChapters || []), ...safeGuestBookmarks])
    );
    const mergedBadges = Array.from(
      new Set([...(targetUser.unlockedBadgeIds || []), ...safeGuestBadges])
    );
    const mergedStages = sanitizeCompletedStages(
      targetUser.completedStages,
      guestSource.completedStages
    );

    targetUser.completedChapters = mergedChapters;
    targetUser.bookmarkedChapters = mergedBookmarks;
    targetUser.unlockedBadgeIds = mergedBadges;
    targetUser.completedStages = mergedStages;
    targetUser.streakDays = sanitizeStreakDays(targetUser.streakDays, guestSource.streakDays);
    targetUser.totalStudyMinutes = (targetUser.totalStudyMinutes || 0) + guestMinutesToAdd;
    targetUser.xp = (targetUser.xp || 0) + guestXp;
    targetUser.lastSyncedAt = nowIso;

    // Remove temporary unauthenticated guest entry from leaderboard if it was stored separately
    if (!guestUserId.startsWith('usr_g_') && this.users.has(guestUserId)) {
      this.users.delete(guestUserId);
      if (this.sqliteDb) {
        try {
          this.sqliteDb.prepare('DELETE FROM users WHERE user_id = ?').run(guestUserId);
        } catch {}
      }
    }

    this.users.set(targetUserId, targetUser);
    this.persistUserToSqlite(targetUser);
    this.saveImmediately();
    return targetUser;
  }

  public updateProfile(
    userId: string,
    updates: { name?: string; avatar?: string }
  ): SyncedUserProfile {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');

    if (updates.name && updates.name.trim()) {
      user.name = updates.name.trim();
    }
    if (updates.avatar && updates.avatar.trim()) {
      user.avatar = updates.avatar.trim();
    }
    user.lastSyncedAt = new Date().toISOString();
    this.users.set(userId, user);
    this.persistUserToSqlite(user);
    this.saveImmediately();
    return user;
  }
}

export const userSyncManager = new UserSyncManager();
