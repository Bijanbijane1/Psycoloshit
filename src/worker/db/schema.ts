/**
 * D1 Database Schema Types and Data Transformation Mappings
 * Project: PsychoMaster (روان‌لینگو)
 *
 * Provides strongly-typed SQLite row models and conversion helpers between
 * Cloudflare D1 snake_case columns and application domain models (camelCase).
 * Enforces strict data-integrity validation for serialized JSON columns.
 */

export class DataIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataIntegrityError';
  }
}

export interface SyncedUserProfile {
  userId: string;
  name: string;
  avatar: string;
  xp: number;
  streakDays: number;
  totalStudyMinutes: number;
  completedChapters: string[];
  completedStages: Record<string, unknown>;
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

export interface BankQuestion {
  id: string;
  chapterId: string;
  chapterTitle: string;
  difficulty: 'easy' | 'medium' | 'hard';
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  source: 'academic-curated' | 'ai-generated';
  timesAnswered?: number;
}

export interface XpLedgerEntry {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  idempotencyKey?: string | null;
  createdAt: string;
}

/**
 * Raw D1 SQLite Table Row Schemas
 */
export interface UserDbRow {
  user_id: string;
  name: string;
  avatar: string;
  xp: number;
  streak_days: number;
  total_study_minutes: number;
  completed_chapters: string; // JSON
  completed_stages: string;   // JSON
  unlocked_badge_ids: string; // JSON
  bookmarked_chapters: string;// JSON
  last_synced_at: string;
  created_at?: string;
  updated_at?: string;
}

export interface XpLedgerDbRow {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  idempotency_key?: string | null;
  created_at: string;
}

export interface QuestionDbRow {
  id: string;
  chapter_id: string;
  chapter_title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  question: string;
  options: string;           // JSON
  correct_index: number;
  explanation: string;
  source: 'academic-curated' | 'ai-generated';
  times_answered: number;
  created_at?: string;
}

/**
 * Strict parser for persisted string arrays (e.g. completed_chapters, unlocked_badge_ids).
 * Throws DataIntegrityError on malformed JSON or invalid structural shape.
 */
export function parsePersistedStringArray(raw: unknown, fieldName: string): string[] {
  if (raw === null || raw === undefined || raw === '') {
    return [];
  }
  if (typeof raw !== 'string') {
    throw new DataIntegrityError(`Corrupted data: ${fieldName} must be a serialized string`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DataIntegrityError(`Corrupted data: ${fieldName} contains malformed JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new DataIntegrityError(`Corrupted data: ${fieldName} is not an array`);
  }
  if (!parsed.every((item) => typeof item === 'string')) {
    throw new DataIntegrityError(`Corrupted data: ${fieldName} contains non-string elements`);
  }
  return parsed;
}

/**
 * Strict parser for persisted object records (e.g. completed_stages).
 * Throws DataIntegrityError on malformed JSON or invalid structural shape.
 */
export function parsePersistedObjectRecord(raw: unknown, fieldName: string): Record<string, unknown> {
  if (raw === null || raw === undefined || raw === '') {
    return {};
  }
  if (typeof raw !== 'string') {
    throw new DataIntegrityError(`Corrupted data: ${fieldName} must be a serialized string`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DataIntegrityError(`Corrupted data: ${fieldName} contains malformed JSON`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DataIntegrityError(`Corrupted data: ${fieldName} is not a valid object map`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Strict parser for question options array.
 */
export function parsePersistedOptions(raw: unknown): string[] {
  if (typeof raw !== 'string') {
    throw new DataIntegrityError('Corrupted data: question options must be a serialized string');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DataIntegrityError('Corrupted data: question options contains malformed JSON');
  }
  if (!Array.isArray(parsed) || parsed.length !== 4) {
    throw new DataIntegrityError('Corrupted data: question options must contain exactly 4 options');
  }
  if (!parsed.every((item) => typeof item === 'string' && item.trim().length > 0)) {
    throw new DataIntegrityError('Corrupted data: all question options must be non-empty strings');
  }
  return parsed;
}

/**
 * Map raw D1 UserDbRow into application domain model SyncedUserProfile
 * Throws DataIntegrityError if any persisted field is corrupted.
 */
export function rowToSyncedUserProfile(row: UserDbRow): SyncedUserProfile {
  return {
    userId: row.user_id,
    name: row.name || 'دانشجوی روان‌شناسی',
    avatar: row.avatar || '🦉',
    xp: Number(row.xp) || 0,
    streakDays: Number(row.streak_days) || 1,
    totalStudyMinutes: Number(row.total_study_minutes) || 0,
    completedChapters: parsePersistedStringArray(row.completed_chapters, 'completed_chapters'),
    completedStages: parsePersistedObjectRecord(row.completed_stages, 'completed_stages'),
    unlockedBadgeIds: parsePersistedStringArray(row.unlocked_badge_ids, 'unlocked_badge_ids'),
    bookmarkedChapters: parsePersistedStringArray(row.bookmarked_chapters, 'bookmarked_chapters'),
    lastSyncedAt: row.last_synced_at || new Date().toISOString(),
  };
}

/**
 * Map raw D1 QuestionDbRow into application domain model BankQuestion
 * Throws DataIntegrityError if options JSON is corrupted.
 */
export function rowToBankQuestion(row: QuestionDbRow): BankQuestion {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    chapterTitle: row.chapter_title,
    difficulty: row.difficulty,
    question: row.question,
    options: parsePersistedOptions(row.options),
    correctIndex: Number(row.correct_index) || 0,
    explanation: row.explanation,
    source: row.source,
    timesAnswered: Number(row.times_answered) || 0,
  };
}

/**
 * Map raw D1 XpLedgerDbRow into domain model XpLedgerEntry
 */
export function rowToXpLedgerEntry(row: XpLedgerDbRow): XpLedgerEntry {
  return {
    id: row.id,
    userId: row.user_id,
    amount: Number(row.amount) || 0,
    reason: row.reason,
    idempotencyKey: row.idempotency_key ?? null,
    createdAt: row.created_at,
  };
}
