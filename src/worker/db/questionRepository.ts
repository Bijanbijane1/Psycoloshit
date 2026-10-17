/**
 * Reusable D1 Question Bank Repository
 * Project: PsychoMaster (روان‌لینگو)
 *
 * Implements question bank operations using parameter-bound queries and strict runtime validation.
 */

import type { D1Database } from '../types.ts';
import {
  type BankQuestion,
  type QuestionDbRow,
  rowToBankQuestion,
} from './schema.ts';

export interface GetQuestionsOptions {
  chapterId?: string;
  difficulty?: 'easy' | 'medium' | 'hard' | string;
  limit?: number;
}

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
const VALID_SOURCES = ['academic-curated', 'ai-generated'] as const;

export class D1QuestionRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Fetch questions with optional chapterId/difficulty filtering,
   * randomized order, and parameter-bound, clamped limit.
   */
  async getQuestions(options: GetQuestionsOptions = {}): Promise<BankQuestion[]> {
    const { chapterId, difficulty, limit = 5 } = options;
    const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 50));

    let query = 'SELECT * FROM question_bank';
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (chapterId && typeof chapterId === 'string' && chapterId.trim()) {
      conditions.push('chapter_id = ?');
      bindings.push(chapterId.trim());
    }

    if (difficulty && typeof difficulty === 'string' && difficulty.trim()) {
      conditions.push('difficulty = ?');
      bindings.push(difficulty.trim());
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY RANDOM() LIMIT ?';
    bindings.push(safeLimit);

    const stmt = this.db.prepare(query);
    const bound = stmt.bind(...bindings);
    const result = await bound.all<QuestionDbRow>();

    const rows = result.results || [];
    return rows.map(rowToBankQuestion);
  }

  /**
   * Add a new question to the bank (academic curated or AI-generated)
   * Validates all required fields, options array bounds, and correctIndex before execution.
   */
  async addQuestion(
    question: Omit<BankQuestion, 'id' | 'source'> & {
      id?: string;
      source?: 'academic-curated' | 'ai-generated';
    }
  ): Promise<BankQuestion> {
    // 1. Chapter and text validations
    if (!question.chapterId || typeof question.chapterId !== 'string' || question.chapterId.trim() === '') {
      throw new Error('Invalid question: chapterId must be a non-empty string');
    }
    if (!question.chapterTitle || typeof question.chapterTitle !== 'string' || question.chapterTitle.trim() === '') {
      throw new Error('Invalid question: chapterTitle must be a non-empty string');
    }
    if (!question.question || typeof question.question !== 'string' || question.question.trim() === '') {
      throw new Error('Invalid question: question text must be a non-empty string');
    }
    if (!question.explanation || typeof question.explanation !== 'string' || question.explanation.trim() === '') {
      throw new Error('Invalid question: explanation must be a non-empty string');
    }

    // 2. Difficulty validation
    if (!VALID_DIFFICULTIES.includes(question.difficulty as any)) {
      throw new Error(`Invalid question: difficulty must be one of: ${VALID_DIFFICULTIES.join(', ')}`);
    }

    // 3. Source validation
    const source = question.source || 'academic-curated';
    if (!VALID_SOURCES.includes(source as any)) {
      throw new Error(`Invalid question: source must be one of: ${VALID_SOURCES.join(', ')}`);
    }

    // 4. Options validation (Strict Four-Option Question Contract)
    if (!Array.isArray(question.options) || question.options.length !== 4) {
      throw new Error('Invalid question: options must be an array of exactly 4 elements');
    }
    for (let i = 0; i < question.options.length; i++) {
      const opt = question.options[i];
      if (typeof opt !== 'string' || opt.trim() === '') {
        throw new Error(`Invalid question: option at index ${i} must be a non-empty string`);
      }
    }

    // 5. Correct index validation (0, 1, 2, or 3)
    if (
      typeof question.correctIndex !== 'number' ||
      !Number.isInteger(question.correctIndex) ||
      question.correctIndex < 0 ||
      question.correctIndex > 3
    ) {
      throw new Error(
        `Invalid question: correctIndex must be an integer between 0 and 3 (received ${question.correctIndex})`
      );
    }

    // 6. timesAnswered validation
    const timesAnswered = question.timesAnswered ?? 0;
    if (typeof timesAnswered !== 'number' || !Number.isInteger(timesAnswered) || timesAnswered < 0) {
      throw new Error('Invalid question: timesAnswered must be a non-negative integer');
    }

    const id = question.id && typeof question.id === 'string' && question.id.trim()
      ? question.id.trim()
      : `qb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();

    const query = `
      INSERT INTO question_bank (
        id,
        chapter_id,
        chapter_title,
        difficulty,
        question,
        options,
        correct_index,
        explanation,
        source,
        times_answered,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db
      .prepare(query)
      .bind(
        id,
        question.chapterId.trim(),
        question.chapterTitle.trim(),
        question.difficulty,
        question.question.trim(),
        JSON.stringify(question.options.map((o) => o.trim())),
        question.correctIndex,
        question.explanation.trim(),
        source,
        timesAnswered,
        nowIso
      )
      .run();

    return {
      id,
      chapterId: question.chapterId.trim(),
      chapterTitle: question.chapterTitle.trim(),
      difficulty: question.difficulty,
      question: question.question.trim(),
      options: question.options.map((o) => o.trim()),
      correctIndex: question.correctIndex,
      explanation: question.explanation.trim(),
      source,
      timesAnswered,
    };
  }

  /**
   * Increment answered counter for a question
   */
  async recordAnswered(questionId: string): Promise<boolean> {
    if (!questionId || typeof questionId !== 'string' || questionId.trim() === '') return false;
    const res = await this.db
      .prepare('UPDATE question_bank SET times_answered = times_answered + 1 WHERE id = ?')
      .bind(questionId.trim())
      .run();

    return (res.meta && typeof res.meta.changes === 'number') ? res.meta.changes > 0 : true;
  }

  /**
   * Return total count of questions stored in D1
   */
  async getTotalCount(): Promise<number> {
    const result = await this.db
      .prepare('SELECT COUNT(*) AS total FROM question_bank')
      .first<{ total: number }>();

    return result?.total ? Number(result.total) : 0;
  }
}
