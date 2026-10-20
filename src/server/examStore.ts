import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import type { D1Database } from '../worker/types.ts';
import { D1ExamRepository } from '../worker/db/examRepository.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const EXAM_SQLITE_FILE = path.resolve(DATA_DIR, 'psychomaster_exams.sqlite');

function createSqliteD1Adapter(db: DatabaseSync): D1Database {
  return {
    prepare(query: string) {
      let boundValues: any[] = [];
      return {
        bind(...values: unknown[]) {
          boundValues = values as any[];
          return this;
        },
        async first<T = unknown>(colName?: string): Promise<T | null> {
          const stmt = db.prepare(query);
          const row = stmt.get(...boundValues);
          if (!row) return null;
          if (colName) return (row as Record<string, unknown>)[colName] as T;
          return row as T;
        },
        async run<T = unknown>() {
          const stmt = db.prepare(query);
          const result = stmt.run(...boundValues);
          return { success: true, meta: result as unknown as Record<string, unknown> };
        },
        async all<T = unknown>() {
          const stmt = db.prepare(query);
          const rows = stmt.all(...boundValues);
          return { success: true, results: rows as T[] };
        },
        async raw<T = unknown>() {
          const stmt = db.prepare(query);
          return stmt.all(...boundValues) as T[];
        },
      };
    },
    async batch<T = unknown>(statements: any[]) {
      db.exec('BEGIN TRANSACTION');
      try {
        const results = [];
        for (const s of statements) {
          results.push(await s.run());
        }
        db.exec('COMMIT');
        return results;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    async exec(query: string) {
      db.exec(query);
      return { success: true };
    },
    async dump() {
      return new ArrayBuffer(0);
    },
  };
}

export class ExpressExamStore {
  private sqlite: DatabaseSync;
  public d1: D1Database;
  public repo: D1ExamRepository;

  constructor(customPath?: string) {
    const isTest = process.env.NODE_ENV === 'test';
    const dbPath = customPath || process.env.EXAM_SQLITE_PATH || (isTest ? ':memory:' : EXAM_SQLITE_FILE);
    if (dbPath !== ':memory:') {
      const targetDir = path.dirname(dbPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
    }
    this.sqlite = new DatabaseSync(dbPath);
    this.initBaseTables();
    this.d1 = createSqliteD1Adapter(this.sqlite);
    this.repo = new D1ExamRepository(this.d1);
  }

  public close(): void {
    try {
      this.sqlite.close();
    } catch {
      // Ignore if already closed
    }
  }

  private initBaseTables() {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL DEFAULT 'دانشجوی روان‌شناسی',
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

      CREATE TABLE IF NOT EXISTS xp_ledger (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        reason TEXT NOT NULL DEFAULT 'stage_completion',
        idempotency_key TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_ledger_user_idempotency
        ON xp_ledger(user_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL;

      CREATE TABLE IF NOT EXISTS question_bank (
        id TEXT PRIMARY KEY NOT NULL,
        chapter_id TEXT NOT NULL,
        chapter_title TEXT NOT NULL,
        difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
        question TEXT NOT NULL,
        options TEXT NOT NULL,
        correct_index INTEGER NOT NULL,
        explanation TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'academic-curated' CHECK (source IN ('academic-curated', 'ai-generated')),
        times_answered INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  public ensureUserMirror(user: {
    userId: string;
    name?: string;
    avatar?: string;
    xp?: number;
  }) {
    if (!user?.userId) return;
    this.sqlite
      .prepare(
        `INSERT INTO users (user_id, name, avatar, xp)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           name = excluded.name,
           avatar = excluded.avatar,
           xp = MAX(users.xp, excluded.xp)`
      )
      .run(
        user.userId,
        user.name || 'دانشجوی روان‌شناسی',
        user.avatar || '🦉',
        user.xp || 0
      );
  }
}

export const expressExamStore = new ExpressExamStore();
