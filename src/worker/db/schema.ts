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
  email?: string;
  googleId?: string;
  picture?: string;
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
  email?: string | null;
  google_id?: string | null;
  picture?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SessionDbRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  last_used_at: string;
}

export interface UserSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  lastUsedAt: string;
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
    email: row.email ?? undefined,
    googleId: row.google_id ?? undefined,
    picture: row.picture ?? undefined,
  };
}

export function rowToUserSession(row: SessionDbRow): UserSession {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
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

// ==============================================================
// Phase 10B: Entrance Exam Simulator Domain & Row Models
// ==============================================================

export type ExamType = 'diagnostic' | 'subject' | 'comprehensive' | 'timed_drill';
export type ExamAttemptStatus = 'in_progress' | 'submitted' | 'expired' | 'abandoned';

export interface ExamBlueprintSection {
  id: string;
  title: string;
  questionCount: number;
  weight: number;
  chapterIds: string[];
  difficultyMix?: {
    easy?: number;
    medium?: number;
    hard?: number;
  };
}

export interface ExamBlueprint {
  id: string;
  slug: string;
  title: string;
  description: string;
  examType: ExamType;
  durationMinutes: number;
  totalQuestions: number;
  negativeMarking: boolean;
  negativeWeight: number;
  sections: ExamBlueprintSection[];
  isPublished: boolean;
  createdAt: string;
}

export interface ExamBlueprintDbRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  exam_type: ExamType;
  duration_minutes: number;
  total_questions: number;
  negative_marking: number;
  negative_weight: number;
  sections_json: string;
  is_published: number;
  created_at: string;
}

export interface ExamSectionBreakdown {
  sectionId: string;
  sectionTitle: string;
  weight: number;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  rawScorePercent: number;
  chapterIds: string[];
}

export interface ExamAttemptDbRow {
  id: string;
  user_id: string;
  blueprint_id: string;
  status: ExamAttemptStatus;
  started_at: string;
  expires_at: string;
  submitted_at?: string | null;
  duration_seconds_used: number;
  question_ids_json: string;
  raw_score_percent?: number | null;
  weighted_score_percent?: number | null;
  correct_count: number;
  wrong_count: number;
  unanswered_count: number;
  section_breakdown_json: string;
  xp_awarded: number;
  idempotency_key?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExamAttemptAnswerDbRow {
  attempt_id: string;
  question_id: string;
  section_id: string;
  selected_index?: number | null;
  is_flagged: number;
  time_spent_seconds: number;
  is_correct?: number | null;
  revision?: number;
  updated_at: string;
}

export interface ExamAttemptAnswerRecord {
  attemptId: string;
  questionId: string;
  sectionId: string;
  selectedIndex: number | null;
  isFlagged: boolean;
  timeSpentSeconds: number;
  isCorrect: boolean | null;
  revision: number;
  updatedAt: string;
}

/**
 * Active exam question delivered while status === 'in_progress'.
 * Strictly omits `correctIndex` and `explanation` to prevent pre-submit answer leakage.
 */
export interface ExamAttemptQuestionPublic {
  id: string;
  questionNumber: number;
  sectionId: string;
  sectionTitle: string;
  chapterId: string;
  chapterTitle: string;
  difficulty: 'easy' | 'medium' | 'hard';
  question: string;
  options: string[];
}

/**
 * Post-submission review question delivered ONLY when status === 'submitted' | 'expired'.
 */
export interface ExamAttemptQuestionReview extends ExamAttemptQuestionPublic {
  correctIndex: number;
  explanation: string;
  selectedIndex: number | null;
  isCorrect: boolean | null;
  isFlagged: boolean;
  timeSpentSeconds: number;
}

export interface ExamAttemptRecord {
  id: string;
  userId: string;
  blueprintId: string;
  status: ExamAttemptStatus;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  durationSecondsUsed: number;
  questionIds: string[];
  rawScorePercent: number | null;
  weightedScorePercent: number | null;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  sectionBreakdown: ExamSectionBreakdown[];
  xpAwarded: number;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export function rowToExamBlueprint(row: ExamBlueprintDbRow): ExamBlueprint {
  let sections: ExamBlueprintSection[] = [];
  try {
    const parsed = JSON.parse(row.sections_json || '[]');
    if (Array.isArray(parsed)) {
      sections = parsed;
    }
  } catch {
    sections = [];
  }
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    examType: row.exam_type,
    durationMinutes: Number(row.duration_minutes) || 15,
    totalQuestions: Number(row.total_questions) || 10,
    negativeMarking: Boolean(row.negative_marking),
    negativeWeight: Number(row.negative_weight) || 0,
    sections,
    isPublished: Boolean(row.is_published),
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export function rowToExamAttemptRecord(row: ExamAttemptDbRow): ExamAttemptRecord {
  let questionIds: string[] = [];
  try {
    const parsed = JSON.parse(row.question_ids_json || '[]');
    if (Array.isArray(parsed)) {
      questionIds = parsed.map(String);
    }
  } catch {
    questionIds = [];
  }

  let sectionBreakdown: ExamSectionBreakdown[] = [];
  try {
    const parsed = JSON.parse(row.section_breakdown_json || '[]');
    if (Array.isArray(parsed)) {
      sectionBreakdown = parsed;
    }
  } catch {
    sectionBreakdown = [];
  }

  return {
    id: row.id,
    userId: row.user_id,
    blueprintId: row.blueprint_id,
    status: row.status,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    submittedAt: row.submitted_at ?? null,
    durationSecondsUsed: Number(row.duration_seconds_used) || 0,
    questionIds,
    rawScorePercent:
      row.raw_score_percent !== null && row.raw_score_percent !== undefined
        ? Number(row.raw_score_percent)
        : null,
    weightedScorePercent:
      row.weighted_score_percent !== null && row.weighted_score_percent !== undefined
        ? Number(row.weighted_score_percent)
        : null,
    correctCount: Number(row.correct_count) || 0,
    wrongCount: Number(row.wrong_count) || 0,
    unansweredCount: Number(row.unanswered_count) || 0,
    sectionBreakdown,
    xpAwarded: Number(row.xp_awarded) || 0,
    idempotencyKey: row.idempotency_key ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToExamAttemptAnswerRecord(row: ExamAttemptAnswerDbRow): ExamAttemptAnswerRecord {
  return {
    attemptId: row.attempt_id,
    questionId: row.question_id,
    sectionId: row.section_id || 'general',
    selectedIndex:
      row.selected_index !== null && row.selected_index !== undefined
        ? Number(row.selected_index)
        : null,
    isFlagged: Boolean(row.is_flagged),
    timeSpentSeconds: Number(row.time_spent_seconds) || 0,
    isCorrect:
      row.is_correct !== null && row.is_correct !== undefined
        ? Boolean(row.is_correct)
        : null,
    revision: Number(row.revision) || 0,
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

