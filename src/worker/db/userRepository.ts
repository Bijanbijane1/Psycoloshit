/**
 * Reusable D1 User & XP Repository
 * Project: PsychoMaster (روان‌لینگو)
 *
 * All operations use parameterized prepared statements to eliminate SQL injection.
 * Mutations use atomic transactions (db.batch) with event-level idempotency and strict server-owned XP protection.
 */

import type { D1Database } from '../types.ts';
import {
  type SyncedUserProfile,
  type LeaderboardEntry,
  type UserDbRow,
  type XpLedgerDbRow,
  rowToSyncedUserProfile,
  rowToXpLedgerEntry,
  type XpLedgerEntry,
} from './schema.ts';

export interface LeaderboardResult {
  leagueName: string;
  countdownDaysRemaining: number;
  currentUserRank: number;
  leaderboard: LeaderboardEntry[];
}

export interface AwardXpParams {
  userId: string;
  idempotencyKey: string;
  amount: number;
  reason?: string;
  streakDays?: number;
  name?: string;
  avatar?: string;
}

export interface AwardXpResult {
  applied: boolean;
  alreadyProcessed: boolean;
  updatedXp: number;
  profile: SyncedUserProfile;
  ledgerId: string;
}

export class D1UserRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Retrieve a user profile by ID.
   * Throws DataIntegrityError if stored JSON is corrupt.
   */
  async getUserById(userId: string): Promise<SyncedUserProfile | null> {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      return null;
    }

    const row = await this.db
      .prepare('SELECT * FROM users WHERE user_id = ?')
      .bind(userId.trim())
      .first<UserDbRow>();

    if (!row) return null;
    return rowToSyncedUserProfile(row);
  }

  /**
   * Upsert a user profile safely:
   * - XP is strictly server-owned: existing XP is always preserved; new user XP is initialized to 0.
   * - Any client-supplied profile.xp is completely ignored.
   * - Merges incoming data and writes via parameterized statement.
   * - If existing stored JSON is corrupt, getUserById throws DataIntegrityError, preventing silent overwrite.
   */
  async upsertUser(
    profile: Partial<SyncedUserProfile> & { userId: string }
  ): Promise<SyncedUserProfile> {
    if (!profile.userId || typeof profile.userId !== 'string' || profile.userId.trim() === '') {
      throw new Error('Invalid userId: must be a non-empty string');
    }
    const cleanUserId = profile.userId.trim();

    // Check existing profile. If stored data is corrupted, this throws DataIntegrityError
    // preventing subsequent overwrite of corrupt state with blank defaults.
    const existing = await this.getUserById(cleanUserId);

    // SERVER-OWNED XP PROTECTION:
    // Existing users keep their database XP. New users are strictly initialized to 0.
    // Client-supplied profile.xp is completely ignored and discarded.
    const serverOwnedXp = existing ? existing.xp : 0;

    const cleanName = (typeof profile.name === 'string' && profile.name.trim().length > 0)
      ? profile.name.trim()
      : (existing?.name ?? 'دانشجوی روان‌شناسی');

    const cleanAvatar = (typeof profile.avatar === 'string' && profile.avatar.trim().length > 0)
      ? profile.avatar.trim()
      : (existing?.avatar ?? '🦉');

    const cleanStreakDays = (typeof profile.streakDays === 'number' && Number.isInteger(profile.streakDays) && profile.streakDays >= 0)
      ? profile.streakDays
      : (existing?.streakDays ?? 1);

    const cleanTotalStudyMinutes = (typeof profile.totalStudyMinutes === 'number' && Number.isInteger(profile.totalStudyMinutes) && profile.totalStudyMinutes >= 0)
      ? profile.totalStudyMinutes
      : (existing?.totalStudyMinutes ?? 0);

    const cleanCompletedChapters = Array.isArray(profile.completedChapters)
      ? profile.completedChapters.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      : (existing?.completedChapters ?? []);

    const cleanCompletedStages = (profile.completedStages && typeof profile.completedStages === 'object' && !Array.isArray(profile.completedStages))
      ? profile.completedStages
      : (existing?.completedStages ?? {});

    const cleanUnlockedBadgeIds = Array.isArray(profile.unlockedBadgeIds)
      ? profile.unlockedBadgeIds.filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
      : (existing?.unlockedBadgeIds ?? []);

    const cleanBookmarkedChapters = Array.isArray(profile.bookmarkedChapters)
      ? profile.bookmarkedChapters.filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
      : (existing?.bookmarkedChapters ?? []);

    const merged: SyncedUserProfile = {
      userId: cleanUserId,
      name: cleanName,
      avatar: cleanAvatar,
      xp: serverOwnedXp,
      streakDays: cleanStreakDays,
      totalStudyMinutes: cleanTotalStudyMinutes,
      completedChapters: cleanCompletedChapters,
      completedStages: cleanCompletedStages,
      unlockedBadgeIds: cleanUnlockedBadgeIds,
      bookmarkedChapters: cleanBookmarkedChapters,
      lastSyncedAt: new Date().toISOString(),
    };

    // ON CONFLICT DOES NOT UPDATE XP: XP cannot be modified via profile upsert
    const query = `
      INSERT INTO users (
        user_id,
        name,
        avatar,
        xp,
        streak_days,
        total_study_minutes,
        completed_chapters,
        completed_stages,
        unlocked_badge_ids,
        bookmarked_chapters,
        last_synced_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        name = excluded.name,
        avatar = excluded.avatar,
        streak_days = excluded.streak_days,
        total_study_minutes = excluded.total_study_minutes,
        completed_chapters = excluded.completed_chapters,
        completed_stages = excluded.completed_stages,
        unlocked_badge_ids = excluded.unlocked_badge_ids,
        bookmarked_chapters = excluded.bookmarked_chapters,
        last_synced_at = excluded.last_synced_at,
        updated_at = datetime('now')
    `;

    await this.db
      .prepare(query)
      .bind(
        merged.userId,
        merged.name,
        merged.avatar,
        serverOwnedXp,
        merged.streakDays,
        merged.totalStudyMinutes,
        JSON.stringify(merged.completedChapters),
        JSON.stringify(merged.completedStages),
        JSON.stringify(merged.unlockedBadgeIds),
        JSON.stringify(merged.bookmarkedChapters),
        merged.lastSyncedAt
      )
      .run();

    return merged;
  }

  /**
   * Award XP with Event-Level Idempotency:
   * 1. Validates all inputs: user ID, idempotency key, reason, and amount (integer 1-1000).
   * 2. REJECTS XP awards for unknown users: User must exist in the database; does NOT auto-create user.
   * 3. Checks if the idempotency key was already recorded for this user. If so, returns
   *    deterministic result with alreadyProcessed: true without incrementing XP.
   * 4. Atomically inserts ledger entry with idempotency_key and increments user XP via db.batch().
   * 5. Enforces DB-level uniqueness constraint to handle concurrent racing retries safely.
   */
  async awardXp(params: AwardXpParams): Promise<AwardXpResult> {
    const { userId, idempotencyKey, amount, reason = 'stage_completion', streakDays, name, avatar } = params;

    // 1. Validation
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new Error('Invalid award request: userId must be a non-empty string');
    }
    const cleanUserId = userId.trim();

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
      throw new Error('Invalid award request: idempotencyKey must be a non-empty string');
    }
    const cleanIdempotencyKey = idempotencyKey.trim();

    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > 1000) {
      throw new Error('Invalid award request: amount must be an integer between 1 and 1000 inclusive');
    }

    const cleanReason = (reason && typeof reason === 'string' && reason.trim()) ? reason.trim() : 'stage_completion';

    // 2. Reject XP awards for unknown users (never auto-create user on XP award)
    const existingUser = await this.getUserById(cleanUserId);
    if (!existingUser) {
      throw new Error(`Cannot award XP: user '${cleanUserId}' not found`);
    }

    // 3. Check if this idempotency key was already processed for this user
    const existingLedger = await this.db
      .prepare('SELECT id, amount FROM xp_ledger WHERE user_id = ? AND idempotency_key = ?')
      .bind(cleanUserId, cleanIdempotencyKey)
      .first<XpLedgerDbRow>();

    if (existingLedger) {
      return {
        applied: false,
        alreadyProcessed: true,
        updatedXp: existingUser.xp,
        profile: existingUser,
        ledgerId: existingLedger.id,
      };
    }

    const ledgerId = `xp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const nowIso = new Date().toISOString();

    const insertLedgerStmt = this.db
      .prepare(
        'INSERT INTO xp_ledger (id, user_id, amount, reason, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(ledgerId, cleanUserId, amount, cleanReason, cleanIdempotencyKey, nowIso);

    const cleanStreakDays = (typeof streakDays === 'number' && Number.isInteger(streakDays) && streakDays >= 0)
      ? streakDays
      : null;
    const cleanName = (typeof name === 'string' && name.trim().length > 0)
      ? name.trim()
      : null;
    const cleanAvatar = (typeof avatar === 'string' && avatar.trim().length > 0)
      ? avatar.trim()
      : null;

    const updateUserStmt = this.db
      .prepare(`
        UPDATE users
        SET
          xp = xp + ?,
          streak_days = COALESCE(?, streak_days),
          name = COALESCE(?, name),
          avatar = COALESCE(?, avatar),
          last_synced_at = ?,
          updated_at = datetime('now')
        WHERE user_id = ?
      `)
      .bind(
        amount,
        cleanStreakDays,
        cleanName,
        cleanAvatar,
        nowIso,
        cleanUserId
      );

    // 4. Atomic batch execution
    try {
      await this.db.batch([insertLedgerStmt, updateUserStmt]);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Handle concurrent race where another identical idempotencyKey slipped through simultaneously
      if (errMsg.includes('UNIQUE constraint failed') && errMsg.includes('idempotency_key')) {
        const recheckLedger = await this.db
          .prepare('SELECT id FROM xp_ledger WHERE user_id = ? AND idempotency_key = ?')
          .bind(cleanUserId, cleanIdempotencyKey)
          .first<XpLedgerDbRow>();

        const recheckProfile = await this.getUserById(cleanUserId);
        if (recheckProfile && recheckLedger) {
          return {
            applied: false,
            alreadyProcessed: true,
            updatedXp: recheckProfile.xp,
            profile: recheckProfile,
            ledgerId: recheckLedger.id,
          };
        }
      }
      throw err;
    }

    const updatedProfile = await this.getUserById(cleanUserId);
    if (!updatedProfile) {
      throw new Error(`Failed to reload user profile for ${cleanUserId} after awarding XP`);
    }

    return {
      applied: true,
      alreadyProcessed: false,
      updatedXp: updatedProfile.xp,
      profile: updatedProfile,
      ledgerId,
    };
  }

  /**
   * Read recent XP ledger transactions for a user
   */
  async getUserXpLedger(userId: string, limit: number = 20): Promise<XpLedgerEntry[]> {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') return [];
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));

    const result = await this.db
      .prepare('SELECT * FROM xp_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .bind(userId.trim(), safeLimit)
      .all<XpLedgerDbRow>();

    const rows = result.results || [];
    return rows.map(rowToXpLedgerEntry);
  }

  /**
   * Get leaderboard rankings calculated directly from D1:
   * Sorts users descending by XP, assigns competitive tiers,
   * calculates currentUser rank and days remaining until Friday league reset.
   */
  async getLeaderboard(
    currentUserId?: string,
    limit: number = 15
  ): Promise<LeaderboardResult> {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 15, 100));
    const cleanCurrentUserId = (currentUserId && typeof currentUserId === 'string' && currentUserId.trim())
      ? currentUserId.trim()
      : undefined;

    const result = await this.db
      .prepare(`
        SELECT user_id, name, avatar, xp, streak_days, last_synced_at
        FROM users
        ORDER BY xp DESC, last_synced_at ASC, user_id ASC
        LIMIT ?
      `)
      .bind(safeLimit)
      .all<UserDbRow>();

    const rows = result.results || [];

    let currentUserRank = -1;
    const leaderboard: LeaderboardEntry[] = rows.map((u, index) => {
      const rank = index + 1;
      const isCurrentUser = Boolean(cleanCurrentUserId && u.user_id === cleanCurrentUserId);
      if (isCurrentUser) {
        currentUserRank = rank;
      }

      let tier: LeaderboardEntry['tier'] = 'participant';
      if (rank === 1) tier = 'diamond';
      else if (rank === 2) tier = 'gold';
      else if (rank === 3) tier = 'silver';
      else if (rank <= 6) tier = 'bronze';

      return {
        rank,
        userId: u.user_id,
        name: isCurrentUser ? `${u.name} (شما)` : u.name,
        avatar: u.avatar || '🦉',
        xp: Number(u.xp) || 0,
        streakDays: Number(u.streak_days) || 1,
        tier,
        isCurrentUser,
      };
    });

    // If current user is not in top limit, check if user exists and calculate their actual rank
    if (cleanCurrentUserId && currentUserRank === -1) {
      const userRecord = await this.db
        .prepare('SELECT xp FROM users WHERE user_id = ?')
        .bind(cleanCurrentUserId)
        .first<{ xp: number }>();

      if (userRecord) {
        const rankResult = await this.db
          .prepare('SELECT COUNT(*) + 1 AS rank FROM users WHERE xp > ?')
          .bind(Number(userRecord.xp) || 0)
          .first<{ rank: number }>();

        if (rankResult && typeof rankResult.rank === 'number') {
          currentUserRank = rankResult.rank;
        }
      }
    }

    // Days remaining until weekly reset (Friday midnight)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 is Sunday, 5 is Friday
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;

    return {
      leagueName: 'لیگ الماس (Diamond League)',
      countdownDaysRemaining: daysUntilFriday,
      currentUserRank: currentUserRank > 0 ? currentUserRank : -1,
      leaderboard,
    };
  }
}
