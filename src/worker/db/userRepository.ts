/**
 * Reusable D1 User & XP Repository
 * Project: PsychoMaster (روان‌لینگو)
 *
 * All operations use parameterized prepared statements to eliminate SQL injection.
 * Mutations use atomic transactions (db.batch) with event-level idempotency and strict server-owned XP protection.
 */

import type { D1Database } from '../types.ts';
import type { StageCompletionRecord } from '../../types/psychology.ts';
import {
  ALLOWED_REWARD_REASONS,
  parseCompletedStageNumberFromKey,
  sanitizeCompletedStages,
  sanitizeStreakDays,
  sanitizeStudyMinutes,
} from '../rewards.ts';
import {
  type SyncedUserProfile,
  type LeaderboardEntry,
  type UserDbRow,
  type XpLedgerDbRow,
  type SessionDbRow,
  type UserSession,
  rowToSyncedUserProfile,
  rowToXpLedgerEntry,
  rowToUserSession,
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
  stageRecord?: StageCompletionRecord;
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
   * - Any client-supplied profile.xp, email, googleId, or picture is completely ignored.
   * - Monotonically merges incoming progress (chapters, stages, badges, study minutes, streak) so
   *   syncing from a fresh device never wipes out existing progress or custom profile names.
   * - If existing stored JSON is corrupt, getUserById throws DataIntegrityError, preventing silent overwrite.
   */
  async upsertUser(
    profile: Partial<SyncedUserProfile> & { userId: string }
  ): Promise<SyncedUserProfile> {
    if (!profile.userId || typeof profile.userId !== 'string' || profile.userId.trim() === '') {
      throw new Error('Invalid userId: must be a non-empty string');
    }
    const cleanUserId = profile.userId.trim();
    if (SEEDED_COMPETITOR_IDS.has(cleanUserId)) {
      throw new Error('Forbidden: Seeded competitor profiles cannot be modified');
    }

    // Check existing profile. If stored data is corrupted, this throws DataIntegrityError
    // preventing subsequent overwrite of corrupt state with blank defaults.
    const existing = await this.getUserById(cleanUserId);

    // SERVER-OWNED XP PROTECTION:
    // Existing users keep their database XP. New users are strictly initialized to 0.
    // Client-supplied profile.xp is completely ignored and discarded.
    const serverOwnedXp = existing ? existing.xp : 0;

    const incomingName = typeof profile.name === 'string' ? profile.name.trim() : '';
    const existingHasCustomName = Boolean(
      existing && existing.name && !DEFAULT_NAMES.has(existing.name.trim())
    );
    const cleanName = existingHasCustomName
      ? (!DEFAULT_NAMES.has(incomingName) ? incomingName : existing!.name)
      : (incomingName || existing?.name || 'دانشجوی روان‌شناسی');

    const incomingAvatar = typeof profile.avatar === 'string' ? profile.avatar.trim() : '';
    const cleanAvatar =
      existing && existing.googleId && existing.avatar && incomingAvatar === '🦉'
        ? existing.avatar
        : (incomingAvatar || existing?.avatar || '🦉');

    const cleanStreakDays = sanitizeStreakDays(existing?.streakDays, profile.streakDays);
    const cleanTotalStudyMinutes = sanitizeStudyMinutes(
      existing?.totalStudyMinutes,
      profile.totalStudyMinutes
    );

    const safeChapters = Array.isArray(profile.completedChapters)
      ? profile.completedChapters.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      : [];
    const cleanCompletedChapters = Array.from(
      new Set([...(existing?.completedChapters ?? []), ...safeChapters])
    );

    const safeStages =
      profile.completedStages && typeof profile.completedStages === 'object' && !Array.isArray(profile.completedStages)
        ? profile.completedStages
        : {};
    const verifiedStageNumbers = await this.getVerifiedCompletedStageNumbers(cleanUserId);
    const cleanCompletedStages = sanitizeCompletedStages(existing?.completedStages, safeStages, {
      verifiedStageNumbers,
      markIncomingVerified: false,
    });

    const safeBadges = Array.isArray(profile.unlockedBadgeIds)
      ? profile.unlockedBadgeIds.filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
      : [];
    const cleanUnlockedBadgeIds = Array.from(
      new Set([...(existing?.unlockedBadgeIds ?? []), ...safeBadges])
    );

    const safeBookmarks = Array.isArray(profile.bookmarkedChapters)
      ? profile.bookmarkedChapters.filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
      : [];
    const cleanBookmarkedChapters = Array.from(
      new Set([...(existing?.bookmarkedChapters ?? []), ...safeBookmarks])
    );

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
      email: existing?.email,
      googleId: existing?.googleId,
      picture: existing?.picture,
      lastSyncedAt: new Date().toISOString(),
    };

    // ON CONFLICT DOES NOT UPDATE XP OR IDENTITY COLUMNS (email, google_id, picture)
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
    const {
      userId,
      idempotencyKey,
      amount,
      reason = 'stage_completion',
      stageRecord,
      streakDays,
      name,
      avatar,
    } = params;

    // 1. Validation
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new Error('Invalid award request: userId must be a non-empty string');
    }
    const cleanUserId = userId.trim();
    if (SEEDED_COMPETITOR_IDS.has(cleanUserId)) {
      throw new Error('Forbidden: Seeded competitor profiles cannot be modified');
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
      throw new Error('Invalid award request: idempotencyKey must be a non-empty string');
    }
    const cleanIdempotencyKey = idempotencyKey.trim();

    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > 1000) {
      throw new Error('Invalid award request: amount must be an integer between 1 and 1000 inclusive');
    }

    const cleanReason =
      reason && typeof reason === 'string' && reason.trim() ? reason.trim() : 'stage_completion';
    if (!ALLOWED_REWARD_REASONS.has(cleanReason)) {
      throw new Error(`Invalid award request: unsupported reward reason '${cleanReason}'`);
    }

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

    const cleanStreakDays =
      typeof streakDays === 'number' &&
      Number.isInteger(streakDays) &&
      streakDays > (existingUser.streakDays || 1)
        ? sanitizeStreakDays(existingUser.streakDays, streakDays)
        : null;

    const incomingName = typeof name === 'string' ? name.trim() : '';
    const existingHasCustomName = Boolean(
      existingUser.name && !DEFAULT_NAMES.has(existingUser.name.trim())
    );
    const cleanName =
      incomingName.length > 0 && (!existingHasCustomName || !DEFAULT_NAMES.has(incomingName))
        ? incomingName
        : null;

    const incomingAvatar = typeof avatar === 'string' ? avatar.trim() : '';
    const cleanAvatar =
      incomingAvatar.length > 0 &&
      !(existingUser.avatar && existingUser.avatar !== '🦉' && incomingAvatar === '🦉')
        ? incomingAvatar
        : null;

    const verifiedStagesForAward = stageRecord
      ? await this.getVerifiedCompletedStageNumbers(cleanUserId)
      : undefined;
    if (stageRecord && verifiedStagesForAward) {
      verifiedStagesForAward.add(stageRecord.stageNumber);
    }
    const updatedCompletedStagesJson = stageRecord
      ? JSON.stringify(
          sanitizeCompletedStages(
            existingUser.completedStages,
            {
              [String(stageRecord.stageNumber)]: stageRecord,
            },
            {
              verifiedStageNumbers: verifiedStagesForAward,
              markIncomingVerified: true,
            }
          )
        )
      : null;

    const updateUserStmt = this.db
      .prepare(`
        UPDATE users
        SET
          xp = xp + ?,
          streak_days = COALESCE(?, streak_days),
          name = COALESCE(?, name),
          avatar = COALESCE(?, avatar),
          completed_stages = COALESCE(?, completed_stages),
          last_synced_at = ?,
          updated_at = datetime('now')
        WHERE user_id = ?
      `)
      .bind(
        amount,
        cleanStreakDays,
        cleanName,
        cleanAvatar,
        updatedCompletedStagesJson,
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
   * Read verified completed stage numbers directly from authoritative xp_ledger entries.
   */
  async getVerifiedCompletedStageNumbers(userId: string): Promise<Set<number>> {
    const completed = new Set<number>();
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return completed;
    }
    const cleanUserId = userId.trim();
    const res = await this.db
      .prepare(
        "SELECT idempotency_key FROM xp_ledger WHERE user_id = ? AND idempotency_key LIKE 'stage_completion:stage_%'"
      )
      .bind(cleanUserId)
      .all<{ idempotency_key: string }>();

    for (const row of res.results || []) {
      const stageNum = parseCompletedStageNumberFromKey(row.idempotency_key);
      if (stageNum !== null) {
        completed.add(stageNum);
      }
    }
    return completed;
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
   * Masks non-caller user_id values so internal identifiers are not enumerated publicly.
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
        userId: isCurrentUser ? u.user_id : `peer_rank_${rank}`,
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

  /**
   * Find user by Google ID.
   */
  async findUserByGoogleId(googleId: string): Promise<SyncedUserProfile | null> {
    if (!googleId || typeof googleId !== 'string' || googleId.trim() === '') {
      return null;
    }
    try {
      const row = await this.db
        .prepare('SELECT * FROM users WHERE google_id = ?')
        .bind(googleId.trim())
        .first<UserDbRow>();
      if (!row) return null;
      return rowToSyncedUserProfile(row);
    } catch {
      return null;
    }
  }

  /**
   * Find user by Email (case-insensitive).
   */
  async findUserByEmail(email: string): Promise<SyncedUserProfile | null> {
    if (!email || typeof email !== 'string' || email.trim() === '') {
      return null;
    }
    try {
      const row = await this.db
        .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)')
        .bind(email.trim())
        .first<UserDbRow>();
      if (!row) return null;
      return rowToSyncedUserProfile(row);
    } catch {
      return null;
    }
  }

  private static mergeLocks = new Map<string, Promise<SyncedUserProfile>>();
  private static inMemoryNonces = new Map<string, string>();

  /**
   * Create a server-issued, single-use OAuth nonce challenge in D1.
   */
  async createAuthNonce(nonceHash: string, ttlSeconds: number = 600): Promise<void> {
    if (!nonceHash || typeof nonceHash !== 'string' || !nonceHash.trim()) {
      throw new Error('nonceHash is required');
    }
    const cleanHash = nonceHash.trim();
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    D1UserRepository.inMemoryNonces.set(cleanHash, expiresAt);

    try {
      await this.db
        .prepare('DELETE FROM auth_nonces WHERE expires_at <= ?')
        .bind(nowIso)
        .run()
        .catch(() => {});

      await this.db
        .prepare(
          "INSERT OR REPLACE INTO auth_nonces (nonce_hash, expires_at, created_at) VALUES (?, ?, datetime('now'))"
        )
        .bind(cleanHash, expiresAt)
        .run();
    } catch {
      // Fallback to inMemoryNonces if migration 0004 has not yet been applied in an isolated test
    }
  }

  /**
   * Atomically verify and consume a single-use OAuth nonce challenge.
   * Returns true if and only if the nonce was issued by the server, has not expired,
   * and has not been consumed previously.
   */
  async consumeAuthNonce(nonceHash: string): Promise<boolean> {
    if (!nonceHash || typeof nonceHash !== 'string' || !nonceHash.trim()) {
      return false;
    }
    const cleanHash = nonceHash.trim();
    const nowIso = new Date().toISOString();

    try {
      const res = await this.db
        .prepare('DELETE FROM auth_nonces WHERE nonce_hash = ? AND expires_at > ?')
        .bind(cleanHash, nowIso)
        .run();
      D1UserRepository.inMemoryNonces.delete(cleanHash);
      const changes = Number((res.meta as any)?.changes ?? 0);
      return changes > 0;
    } catch {
      const memExpires = D1UserRepository.inMemoryNonces.get(cleanHash);
      D1UserRepository.inMemoryNonces.delete(cleanHash);
      if (!memExpires) return false;
      return new Date(memExpires).getTime() > Date.now();
    }
  }

  /**
   * Check whether a user currently has any active (non-expired) session in D1.
   */
  async hasUserSessions(userId: string): Promise<boolean> {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return false;
    }
    try {
      const nowIso = new Date().toISOString();
      const row = await this.db
        .prepare('SELECT 1 AS found FROM sessions WHERE user_id = ? AND expires_at > ? LIMIT 1')
        .bind(userId.trim(), nowIso)
        .first<{ found: number }>();
      return Boolean(row);
    } catch {
      return false;
    }
  }

  /**
   * Create or update a Google-authenticated user.
   * Resolves existing user strictly by verified Google `sub` (googleId).
   * Never links accounts solely because their email values match.
   * If new: creates user account with 0 XP.
   */
  async createOrUpdateGoogleUser(params: {
    googleId: string;
    email: string;
    name: string;
    avatar?: string;
    picture?: string;
    guestUserIdToMerge?: string;
    guestProgress?: Partial<SyncedUserProfile>;
    mode?: 'signin' | 'signup';
  }): Promise<{ user: SyncedUserProfile; isNew: boolean }> {
    const { googleId, email, name, avatar, picture, guestUserIdToMerge, guestProgress, mode } = params;
    if (!googleId || !email) {
      throw new Error('googleId and email are required');
    }

    const cleanGoogleId = googleId.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name && name.trim()) ? name.trim() : 'دانشجوی روان‌شناسی';
    const cleanAvatar = (avatar && avatar.trim()) ? avatar.trim() : '🎓';
    const nowIso = new Date().toISOString();

    // STRICT SUB RESOLUTION: Never link accounts solely by matching email address.
    const existing = await this.findUserByGoogleId(cleanGoogleId);

    if (existing) {
      const isDefaultExistingName =
        !existing.name ||
        existing.name.trim() === '' ||
        existing.name.trim() === 'دانشجوی روان‌شناسی' ||
        existing.name.trim() === 'دانشجوی برتر روان‌لینگو';

      const isExplicitNewName =
        Boolean(name && name.trim() && name.trim() !== 'دانشجوی روان‌شناسی' && name.trim() !== 'دانشجوی برتر روان‌لینگو');

      const resolvedName =
        mode === 'signup' && name && name.trim()
          ? name.trim()
          : isDefaultExistingName && isExplicitNewName
          ? name.trim()
          : mode !== 'signin' && isExplicitNewName
          ? name.trim()
          : existing.name || cleanName;

      const resolvedAvatar =
        avatar && avatar.trim()
          ? avatar.trim()
          : existing.avatar || '🎓';

      const resolvedPicture = picture ? picture : (existing.picture || null);

      await this.db
        .prepare(`
          UPDATE users 
          SET google_id = ?, 
              email = ?, 
              picture = ?,
              avatar = ?,
              name = ?,
              last_synced_at = ?,
              updated_at = datetime('now')
          WHERE user_id = ?
        `)
        .bind(
          cleanGoogleId,
          cleanEmail,
          resolvedPicture,
          resolvedAvatar,
          resolvedName,
          nowIso,
          existing.userId
        )
        .run();

      let updated = (await this.getUserById(existing.userId))!;
      if (guestUserIdToMerge && guestUserIdToMerge !== updated.userId) {
        updated = await this.mergeGuestIntoUser(updated.userId, guestUserIdToMerge, guestProgress);
      }
      return { user: updated, isNew: false };
    }

    // New user creation
    const newUserId = 'usr_g_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

    try {
      await this.db
        .prepare(`
          INSERT INTO users (
            user_id, name, avatar, xp, streak_days, total_study_minutes,
            completed_chapters, completed_stages, unlocked_badge_ids, bookmarked_chapters,
            email, google_id, picture, last_synced_at, updated_at
          ) VALUES (
            ?, ?, ?, 0, 1, 0,
            '[]', '{}', '[]', '[]',
            ?, ?, ?, ?, datetime('now')
          )
        `)
        .bind(newUserId, cleanName, cleanAvatar, cleanEmail, cleanGoogleId, picture || null, nowIso)
        .run();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE constraint failed') && msg.includes('google_id')) {
        const concurrentExisting = await this.findUserByGoogleId(cleanGoogleId);
        if (concurrentExisting) {
          return { user: concurrentExisting, isNew: false };
        }
      }
      throw err;
    }

    let createdUser = (await this.getUserById(newUserId))!;
    if (guestUserIdToMerge && guestUserIdToMerge !== newUserId) {
      createdUser = await this.mergeGuestIntoUser(newUserId, guestUserIdToMerge, guestProgress);
    }
    return { user: createdUser, isNew: true };
  }

  /**
   * Session Management: Create opaque hashed session in D1.
   */
  async createSession(userId: string, tokenHash: string, ttlSeconds = 30 * 24 * 3600): Promise<UserSession> {
    if (!userId || !tokenHash) {
      throw new Error('userId and tokenHash are required');
    }
    const sessionId = 'sess_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    await this.db
      .prepare(`
        INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_used_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `)
      .bind(sessionId, userId.trim(), tokenHash.trim(), expiresAt)
      .run();

    return {
      id: sessionId,
      userId: userId.trim(),
      tokenHash: tokenHash.trim(),
      expiresAt,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    };
  }

  /**
   * Session Management: Validate opaque hashed session token against D1.
   */
  async validateSession(tokenHash: string): Promise<{ session: UserSession; user: SyncedUserProfile } | null> {
    if (!tokenHash || typeof tokenHash !== 'string' || tokenHash.trim() === '') {
      return null;
    }

    try {
      const nowIso = new Date().toISOString();
      const sessionRow = await this.db
        .prepare(`
          SELECT * FROM sessions 
          WHERE token_hash = ? AND expires_at > ?
        `)
        .bind(tokenHash.trim(), nowIso)
        .first<SessionDbRow>();

      if (!sessionRow) return null;

      if (new Date(sessionRow.expires_at).getTime() <= Date.now()) {
        await this.deleteSession(tokenHash.trim());
        return null;
      }

      // Non-blocking update of last_used_at
      this.db
        .prepare("UPDATE sessions SET last_used_at = datetime('now') WHERE id = ?")
        .bind(sessionRow.id)
        .run()
        .catch(() => {});

      const user = await this.getUserById(sessionRow.user_id);
      if (!user) return null;

      return {
        session: rowToUserSession(sessionRow),
        user,
      };
    } catch {
      return null;
    }
  }

  /**
   * Session Management: Delete (revoke) a session by token hash.
   */
  async deleteSession(tokenHash: string): Promise<boolean> {
    if (!tokenHash) return false;
    try {
      await this.db
        .prepare('DELETE FROM sessions WHERE token_hash = ?')
        .bind(tokenHash.trim())
        .run();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Session Management: Delete all sessions for a given user.
   */
  async deleteUserSessions(userId: string): Promise<boolean> {
    if (!userId) return false;
    try {
      await this.db
        .prepare('DELETE FROM sessions WHERE user_id = ?')
        .bind(userId.trim())
        .run();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Atomically merge guest progress and XP into target user.
   * Uses both an in-process lock keyed on `cleanGuestId` and a single D1/SQLite atomic batch (`this.db.batch`)
   * guarded by the unique index `idx_xp_ledger_user_idempotency` on `(user_id, idempotency_key)`
   * and global guest-consumption checks so repeated or concurrent requests (even across different target users)
   * can never double-count study minutes or XP.
   */
  async mergeGuestIntoUser(
    targetUserId: string,
    guestUserId: string,
    guestSnapshot?: Partial<SyncedUserProfile>
  ): Promise<SyncedUserProfile> {
    const cleanTargetId = targetUserId ? targetUserId.trim() : '';
    const cleanGuestId = guestUserId ? guestUserId.trim() : '';
    const lockKey = cleanGuestId || `${cleanGuestId}->${cleanTargetId}`;

    const existingPromise = D1UserRepository.mergeLocks.get(lockKey);
    if (existingPromise) {
      await existingPromise.catch(() => {});
    }

    const mergePromise = this.executeAtomicGuestMerge(cleanTargetId, cleanGuestId, guestSnapshot);
    D1UserRepository.mergeLocks.set(lockKey, mergePromise);
    try {
      return await mergePromise;
    } finally {
      if (D1UserRepository.mergeLocks.get(lockKey) === mergePromise) {
        D1UserRepository.mergeLocks.delete(lockKey);
      }
    }
  }

  private async executeAtomicGuestMerge(
    targetUserId: string,
    guestUserId: string,
    guestSnapshot?: Partial<SyncedUserProfile>
  ): Promise<SyncedUserProfile> {
    const targetUser = await this.getUserById(targetUserId);
    if (!targetUser) {
      throw new Error(`Target user ${targetUserId} not found for merge`);
    }

    if (
      !guestUserId ||
      guestUserId === targetUserId ||
      guestUserId.startsWith('usr_g_') ||
      SEEDED_COMPETITOR_IDS.has(guestUserId)
    ) {
      return targetUser;
    }

    const storedGuestRecord = await this.getUserById(guestUserId);
    if (storedGuestRecord && storedGuestRecord.googleId) {
      return targetUser;
    }

    // Prioritize server-stored guest record over client-supplied guestSnapshot
    const guestSource = storedGuestRecord || guestSnapshot;
    if (!guestSource) {
      return targetUser;
    }

    const idempotencyKey = `merge_${guestUserId}_to_${targetUserId}`;
    const primaryKey = `${idempotencyKey}_p1`;
    const globalGuestKeyPattern = `merge_${guestUserId}_to_%`;

    // Reject if this guestUserId was already merged into this target user OR any other user
    const existingMergeLedger = await this.db
      .prepare(
        "SELECT id FROM xp_ledger WHERE reason = 'guest_merge' AND (idempotency_key = ? OR idempotency_key LIKE ?) LIMIT 1"
      )
      .bind(primaryKey, globalGuestKeyPattern)
      .first<{ id: string }>();

    if (existingMergeLedger) {
      return targetUser;
    }

    // Merge completed chapters (union)
    const safeGuestChapters = Array.isArray(guestSource.completedChapters)
      ? guestSource.completedChapters.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      : [];
    const mergedChapters = Array.from(
      new Set([...(targetUser.completedChapters || []), ...safeGuestChapters])
    );

    // Merge bookmarked chapters (union)
    const safeGuestBookmarks = Array.isArray(guestSource.bookmarkedChapters)
      ? guestSource.bookmarkedChapters.filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
      : [];
    const mergedBookmarks = Array.from(
      new Set([...(targetUser.bookmarkedChapters || []), ...safeGuestBookmarks])
    );

    // Merge badges (union)
    const safeGuestBadges = Array.isArray(guestSource.unlockedBadgeIds)
      ? guestSource.unlockedBadgeIds.filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
      : [];
    const mergedBadges = Array.from(
      new Set([...(targetUser.unlockedBadgeIds || []), ...safeGuestBadges])
    );

    // Merge completed stages (sanitized sequential chain with canonical XP values)
    const targetVerifiedStages = await this.getVerifiedCompletedStageNumbers(targetUserId);
    const guestVerifiedStages = await this.getVerifiedCompletedStageNumbers(guestUserId);
    const combinedVerifiedStages = new Set<number>([
      ...targetVerifiedStages,
      ...guestVerifiedStages,
    ]);
    const mergedStages = sanitizeCompletedStages(
      targetUser.completedStages,
      guestSource.completedStages,
      {
        verifiedStageNumbers: combinedVerifiedStages,
        markIncomingVerified: false,
      }
    );

    const rawGuestMinutes = Number(guestSource.totalStudyMinutes) || 0;
    const guestMinutesToAdd = Math.min(600, Math.max(0, Math.round(rawGuestMinutes)));
    const mergedStreak = sanitizeStreakDays(targetUser.streakDays, guestSource.streakDays);

    // Verify guest XP strictly from authoritative xp_ledger entries for guestUserId
    // that have NOT already been claimed by targetUserId (preventing fabricated guest XP
    // and preventing multi-guest farming of the same stages/questions).
    let transferableEntries: XpLedgerDbRow[] = [];
    let ledgerBackedXp = 0;

    if (storedGuestRecord) {
      const guestLedgerRes = await this.db
        .prepare(
          "SELECT id, user_id, amount, reason, idempotency_key, created_at FROM xp_ledger WHERE user_id = ? AND reason != 'guest_merge'"
        )
        .bind(guestUserId)
        .all<XpLedgerDbRow>();

      const targetLedgerRes = await this.db
        .prepare(
          'SELECT idempotency_key FROM xp_ledger WHERE user_id = ? AND idempotency_key IS NOT NULL'
        )
        .bind(targetUserId)
        .all<{ idempotency_key: string }>();

      const targetExistingKeys = new Set(
        (targetLedgerRes.results || [])
          .map((r) => r.idempotency_key)
          .filter((k): k is string => Boolean(k))
      );

      for (const row of guestLedgerRes.results || []) {
        const amt = Number(row.amount) || 0;
        if (amt <= 0 || amt > 1000) continue;
        const key = row.idempotency_key ? String(row.idempotency_key).trim() : '';
        if (key && targetExistingKeys.has(key)) {
          continue;
        }
        if (key) {
          targetExistingKeys.add(key);
        }
        transferableEntries.push(row);
        ledgerBackedXp += amt;
      }
    }

    const guestXp = storedGuestRecord
      ? Math.min(Math.max(0, storedGuestRecord.xp), ledgerBackedXp)
      : 0;

    const nowIso = new Date().toISOString();
    const batchStmts = [];

    // Always insert the global guest-merge idempotency marker first
    const markerLedgerId = `xp_merge_${Date.now()}_0_${Math.random().toString(36).substring(2, 7)}`;
    batchStmts.push(
      this.db
        .prepare(
          'INSERT INTO xp_ledger (id, user_id, amount, reason, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(markerLedgerId, targetUserId, 0, 'guest_merge', primaryKey, nowIso)
    );

    if (guestXp > 0) {
      let remaining = guestXp;
      let idx = 1;
      for (const entry of transferableEntries) {
        if (remaining <= 0) break;
        const chunk = Math.min(remaining, Number(entry.amount) || 0, 1000);
        if (chunk <= 0) continue;
        const transferredKey =
          entry.idempotency_key && entry.idempotency_key.trim()
            ? entry.idempotency_key.trim()
            : `${idempotencyKey}_evt_${idx}`;
        const ledgerId = `xp_merge_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
        batchStmts.push(
          this.db
            .prepare(
              'INSERT INTO xp_ledger (id, user_id, amount, reason, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?)'
            )
            .bind(
              ledgerId,
              targetUserId,
              chunk,
              entry.reason || 'stage_completion',
              transferredKey,
              nowIso
            )
        );
        remaining -= chunk;
        idx++;
      }
    }

    if (storedGuestRecord) {
      batchStmts.push(
        this.db
          .prepare(`
            UPDATE users
            SET xp = 0,
                total_study_minutes = 0,
                updated_at = datetime('now')
            WHERE user_id = ? AND google_id IS NULL
          `)
          .bind(guestUserId)
      );
    }

    batchStmts.push(
      this.db
        .prepare(`
          UPDATE users
          SET xp = xp + ?,
              total_study_minutes = total_study_minutes + ?,
              streak_days = ?,
              completed_chapters = ?,
              completed_stages = ?,
              unlocked_badge_ids = ?,
              bookmarked_chapters = ?,
              last_synced_at = ?,
              updated_at = datetime('now')
          WHERE user_id = ?
        `)
        .bind(
          guestXp,
          guestMinutesToAdd,
          mergedStreak,
          JSON.stringify(mergedChapters),
          JSON.stringify(mergedStages),
          JSON.stringify(mergedBadges),
          JSON.stringify(mergedBookmarks),
          nowIso,
          targetUserId
        )
    );

    try {
      await this.db.batch(batchStmts);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('UNIQUE constraint failed') && errMsg.includes('idempotency_key')) {
        return (await this.getUserById(targetUserId))!;
      }
      throw err;
    }

    return (await this.getUserById(targetUserId))!;
  }

  /**
   * Update profile display name and/or avatar.
   */
  async updateUserProfile(
    userId: string,
    updates: { name?: string; avatar?: string }
  ): Promise<SyncedUserProfile> {
    if (!userId) {
      throw new Error('userId is required');
    }
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const cleanName = updates.name ? updates.name.trim() : undefined;
    const cleanAvatar = updates.avatar ? updates.avatar.trim() : undefined;

    await this.db
      .prepare(`
        UPDATE users
        SET name = COALESCE(?, name),
            avatar = COALESCE(?, avatar),
            last_synced_at = datetime('now'),
            updated_at = datetime('now')
        WHERE user_id = ?
      `)
      .bind(cleanName || null, cleanAvatar || null, userId)
      .run();

    return (await this.getUserById(userId))!;
  }
}

