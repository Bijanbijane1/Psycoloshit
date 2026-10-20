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

  /**
   * Ensure default academic curated questions are seeded in question_bank.
   */
  async ensureSeeded(): Promise<void> {
    const existingSeed = await this.db
      .prepare("SELECT id FROM question_bank WHERE id = 'qb_1'")
      .first<{ id: string }>();
    if (existingSeed?.id) return;

    const defaults: Array<Omit<BankQuestion, 'source'> & { source: 'academic-curated' }> = [
      {
        id: 'qb_1',
        chapterId: 's1_c1',
        chapterTitle: 'فصل ۱: تاریخچه و مکاتب روان‌شناسی',
        difficulty: 'easy',
        question: 'کدام مکتب روان‌شناسی بر تجزیه هوشیاری به عناصر پایه از طریق «درون‌نگری آزمایشگاهی» تأکید داشت؟',
        options: ['ساختارگرایی (Structuralism)', 'کارکردگرایی (Functionalism)', 'رفتارگرایی (Behaviorism)', 'روان‌پویشی (Psychodynamic)'],
        correctIndex: 0,
        explanation: 'ساختارگرایی به رهبری ویلهلم وونت و ادوارد تیچنر، هدف روان‌شناسی را تجزیه تجربه هوشیارانه به عناصر بنیادین حسی و عاطفی با روش درون‌نگری می‌دانست.',
        source: 'academic-curated',
        timesAnswered: 42,
      },
      {
        id: 'qb_2',
        chapterId: 's1_c1',
        chapterTitle: 'فصل ۱: تاریخچه و مکاتب روان‌شناسی',
        difficulty: 'medium',
        question: 'دیدگاه ویلیام جیمز در «کارکردگرایی» به شدت متأثر از نظریه کدام دانشمند بود؟',
        options: ['چارلز داروین (انتخاب طبیعی)', 'زیگموند فروید (ناخودآگاه)', 'ایوان پاولف (شرطی‌سازی)', 'ژان پیاژه (رشد شناختی)'],
        correctIndex: 0,
        explanation: 'ویلیام جیمز تحت تأثیر نظریه تکامل داروین، معتقد بود باید بررسی کنیم ذهن چگونه به سازگاری موجود زنده با محیط کمک می‌کند.',
        source: 'academic-curated',
        timesAnswered: 38,
      },
      {
        id: 'qb_3',
        chapterId: 's1_c2',
        chapterTitle: 'فصل ۲: مبانی زیستی رفتار و اعصاب',
        difficulty: 'medium',
        question: 'کدام انتقال‌دهنده عصبی (نوروترنسمیتر) نقش کلیدی در مدار پاداش مغز، انگیزش و بیماری پارکینسون ایفا می‌کند؟',
        options: ['دوپامین (Dopamine)', 'گابا (GABA)', 'استیل‌کولین (Acetylcholine)', 'اندورفین (Endorphin)'],
        correctIndex: 0,
        explanation: 'کاهش دوپامین در مسیر نیگرو-استریاتال عامل اصلی بیماری پارکینسون است و افزایش فعالیت آن در مسیر مزولیمبیک با پاداش و اسکیزوفرنی مرتبط است.',
        source: 'academic-curated',
        timesAnswered: 51,
      },
      {
        id: 'qb_4',
        chapterId: 's1_c2',
        chapterTitle: 'فصل ۲: مبانی زیستی رفتار و اعصاب',
        difficulty: 'hard',
        question: 'آسیب به «ناحیه ورنیکه» در نیمکره چپ مغز منجر به کدام اختلال زبانی می‌شود؟',
        options: ['آفازی دریافتی (گفتار روان اما بی‌معنا و اختلال در درک زبان)', 'آفازی بیانی (درک سالم اما گفتار بریده‌بریده و دشوار)', 'فلج کامل عضلات حنجره و زبان', 'فراموشی پیش‌گستر کامل اطلاعات دیداری'],
        correctIndex: 0,
        explanation: 'ناحیه ورنیکه در لوب گیجگاهی چپ مسئول درک زبان است؛ آسیب به آن باعث می‌شود بیمار جملاتی روان اما فاقد معنای منطقی تولید کند و متوجه کلام دیگران نشود.',
        source: 'academic-curated',
        timesAnswered: 29,
      },
      {
        id: 'qb_5',
        chapterId: 's1_c3',
        chapterTitle: 'فصل ۳: احساس، ادراک و توجه',
        difficulty: 'medium',
        question: 'بر اساس «قانون وبر (Weber’s Law)»، آستانه افتراقی (JND) برای تشخیص تغییر در یک محرک به چه عاملی بستگی دارد؟',
        options: ['نسبت ثابتی از شدت اولیه محرک', 'مقدار مطلق و ثابتی از انرژی فیزیکی', 'سطح هوشیاری و انگیزه آزمودنی در آزمایشگاه', 'تعداد گیرنده‌های حسی فعال در قشر بینایی'],
        correctIndex: 0,
        explanation: 'قانون وبر بیان می‌کند که کمترین تفاوت قابل تشخیص بین دو محرک (JND)، همواره کسری ثابت از شدت محرک استاندارد اولیه است.',
        source: 'academic-curated',
        timesAnswered: 34,
      },
      {
        id: 'qb_6',
        chapterId: 's2_c1',
        chapterTitle: 'فصل ۴: یادگیری و شرطی‌سازی',
        difficulty: 'easy',
        question: 'در آزمایش کلاسیک ایوان پاولف، «صدای زنگ» پس از چندین بار همراه شدن با غذا چه نامیده می‌شود؟',
        options: ['محرک شرطی (CS)', 'محرک غیرشرطی (UCS)', 'پاسخ غیرشرطی (UCR)', 'تقویت‌کننده منفی (Negative Reinforcer)'],
        correctIndex: 0,
        explanation: 'صدای زنگ در ابتدا محرک خنثی است، اما پس از جفت شدن مکرر با غذا (UCS)، به تنهایی باعث ترشح بزاق شده و به محرک شرطی (CS) تبدیل می‌شود.',
        source: 'academic-curated',
        timesAnswered: 65,
      },
      {
        id: 'qb_7',
        chapterId: 's3_c1',
        chapterTitle: 'فصل ۷: آسیب‌شناسی روانی و DSM-5',
        difficulty: 'hard',
        question: 'تفاوت کلیدی «اختلال شخصیت وسواسی-جبری (OCPD)» با «اختلال وسواس فکری-عملی (OCD)» در چیست؟',
        options: ['در OCPD ویژگی‌های کمال‌گرایی با منِ فرد هماهنگ (Ego-syntonic) است، اما در OCD افکار مزاحم ناهماهنگ با من (Ego-dystonic) هستند', 'در OCPD توهمات شنوایی شدید وجود دارد اما در OCD وجود ندارد', 'OCD یک اختلال شخصیت مادام‌العمر است اما OCPD صرفاً یک واکنش استرسی حاد است', 'بیماران OCD هرگز دچار اضطراب نمی‌شوند اما بیماران OCPD حملات پانیک مداوم دارند'],
        correctIndex: 0,
        explanation: 'افراد مبتلا به OCPD کمال‌گرایی و نظم افراطی خود را منطقی و درست می‌دانند (Ego-syntonic)، در حالی که بیماران OCD از افکار وسواسی خود رنج می‌برند و آن‌ها را مزاحم می‌دانند (Ego-dystonic).',
        source: 'academic-curated',
        timesAnswered: 47,
      },
    ];

    const nowIso = new Date().toISOString();
    for (const q of defaults) {
      await this.db
        .prepare(
          `INSERT OR IGNORE INTO question_bank (
            id, chapter_id, chapter_title, difficulty, question, options, correct_index, explanation, source, times_answered, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          q.id,
          q.chapterId,
          q.chapterTitle,
          q.difficulty,
          q.question,
          JSON.stringify(q.options),
          q.correctIndex,
          q.explanation,
          q.source,
          q.timesAnswered,
          nowIso
        )
        .run();
    }
  }
}
