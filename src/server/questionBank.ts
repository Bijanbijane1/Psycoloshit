import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
const QUESTIONS_FILE = path.resolve(DATA_DIR, 'question_bank.json');

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

class QuestionBankRepository {
  private questions: BankQuestion[] = [];

  constructor() {
    this.ensureLoaded();
  }

  private ensureLoaded() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(QUESTIONS_FILE)) {
        const raw = fs.readFileSync(QUESTIONS_FILE, 'utf-8');
        this.questions = JSON.parse(raw);
      } else {
        this.seedInitialQuestions();
        this.saveImmediately();
      }
    } catch (err) {
      console.error('Error loading question bank:', err);
      this.seedInitialQuestions();
    }
  }

  private seedInitialQuestions() {
    this.questions = [
      {
        id: 'qb_01',
        chapterId: 'psy_01',
        chapterTitle: 'کلیات و تاریخچه روان‌شناسی',
        difficulty: 'medium',
        question: 'کدام مکتب روان‌شناسی برای نخستین بار بر روش «درون‌نگری تجربی» برای تجزیه آگاهی به عناصر بنیادین تأکید کرد؟',
        options: ['ساختارگرایی (ویلهلم وونت)', 'کارکردگرایی (ویلیام جیمز)', 'رفتارگرایی (جان واتسون)', 'گشتالت (ماکس ورتهایمر)'],
        correctIndex: 0,
        explanation: 'ویلهلم وونت و ادوارد تیچنر با بنیان‌گذاری ساختارگرایی (Structuralism)، آگاهی را به عناصر حسی و ذهنی از طریق روش درون‌نگری هدایت‌شده تفکیک کردند.',
        source: 'academic-curated',
      },
      {
        id: 'qb_02',
        chapterId: 'psy_01',
        chapterTitle: 'کلیات و تاریخچه روان‌شناسی',
        difficulty: 'easy',
        question: '«پدر روان‌شناسی علمی» به دلیل تأسیس نخستین آزمایشگاه رسمی روان‌شناسی در لایپزیگ آلمان (۱۸۷۹) چه نام دارد؟',
        options: ['زیگموند فروید', 'ویلهلم وونت', 'بی. اف. اسکینر', 'ایوان پاولف'],
        correctIndex: 1,
        explanation: 'ویلهلم وونت در سال ۱۸۷۹ میلادی با راه‌اندازی آزمایشگاه دانشگاه لایپزیگ، روان‌شناسی را به عنوان رشته‌ای مستقل از فلسفه و فیزیولوژی معرفی نمود.',
        source: 'academic-curated',
      },
      {
        id: 'qb_03',
        chapterId: 'psy_02',
        chapterTitle: 'زیست‌شناسی رفتار و مغز',
        difficulty: 'hard',
        question: 'کاهش شدید کدام پیام‌رسان عصبی در عقده‌های قاعده‌ای و ماده سیاه (Substantia Nigra) عامل بیماری پارکینسون است؟',
        options: ['سروتونین', 'استیل‌کولین', 'دوپامین', 'گابا (GABA)'],
        correctIndex: 2,
        explanation: 'دوپامین نقشی کلیدی در کنترل حرکات ظریف ارادی دارد و تخریب نورون‌های دوپامینرژیک در سابستنشیا نیگرا موجب لرزش و کندی حرکت در پارکینسون می‌شود.',
        source: 'academic-curated',
      },
      {
        id: 'qb_04',
        chapterId: 'psy_02',
        chapterTitle: 'زیست‌شناسی رفتار و مغز',
        difficulty: 'medium',
        question: 'کدام ساختار دستگاه لیمبیک به عنوان ایستگاه اصلی تثبیت و انتقال خاطرات از کوتاه‌مدت به بلندمدت شناخته می‌شود؟',
        options: ['آمیگدال (بادامک)', 'هیپوکامپ', 'تالاموس', 'هیپوتالاموس'],
        correctIndex: 1,
        explanation: 'هیپوکامپ مسئول ادغام حافظه آشکار و فضایی است؛ در حالی که آمیگدال حافظه هیجانی به ویژه ترس را هدایت می‌کند.',
        source: 'academic-curated',
      },
      {
        id: 'qb_05',
        chapterId: 'psy_04',
        chapterTitle: 'یادگیری و شرطی‌سازی',
        difficulty: 'medium',
        question: 'در شرطی‌سازی کنشگر اسکینر، قطع صدای گوش‌خراش دزدگیر پس از بستن کمربند ایمنی چه نوع فرایندی محسوب می‌شود؟',
        options: ['تقویت مثبت', 'تقویت منفی', 'تنبیه مثبت', 'تنبیه منفی'],
        correctIndex: 1,
        explanation: 'تقویت منفی عبارت است از حذف یا کاستن یک محرک آزاردهنده به منظور افزایش احتمال تکرار رفتار مطلوب (بستن کمربند).',
        source: 'academic-curated',
      },
      {
        id: 'qb_06',
        chapterId: 'psy_04',
        chapterTitle: 'یادگیری و شرطی‌سازی',
        difficulty: 'hard',
        question: 'کدام برنامه تقویت در آزمایش‌های اسکینر بالاترین نرخ پاسخ‌دهی و بیشترین مقاومت در برابر خاموشی را ایجاد می‌کند؟',
        options: ['نسبتی ثابت (FR)', 'نسبتی متغیر (VR)', 'فاصله‌ای ثابت (FI)', 'فاصله‌ای متغیر (VI)'],
        correctIndex: 1,
        explanation: 'برنامه نسبتی متغیر (مانند دستگاه‌های قمار) به دلیل پیش‌بینی‌ناپذیر بودن زمان پاداش، پایدارترین پاسخ رفتاری را رقم می‌زند.',
        source: 'academic-curated',
      },
      {
        id: 'qb_07',
        chapterId: 'psy_08',
        chapterTitle: 'آسیب‌شناسی روانی (Psychopathology)',
        difficulty: 'medium',
        question: 'اصلی‌ترین تفاوت میان اختلال وسواسی-جبری (OCD) و اختلال شخصیت وسواسی-جبری (OCPD) چیست؟',
        options: [
          'OCD خودناهمخوان (Ego-dystonic) است در حالی که OCPD خودهمخوان (Ego-syntonic) است.',
          'OCD در زنان رخ نمی‌دهد اما OCPD در زنان شایع است.',
          'در OCPD شستشوی مداوم وجود دارد اما در OCD افکار وجود ندارد.',
          'هیچ تفاوتی ندارند و نام‌های هم‌معنی هستند.',
        ],
        correctIndex: 0,
        explanation: 'در OCD فرد از وسواس‌های خود رنج می‌برد و آن‌ها را غیرمنطقی می‌داند (Ego-dystonic)، در حالی که در OCPD فرد معیارهای خشک و کمال‌گرایانه خود را درست و اصولی تلقی می‌کند (Ego-syntonic).',
        source: 'academic-curated',
      },
    ];
  }

  private saveImmediately() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(this.questions, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save question bank:', err);
    }
  }

  public getQuestions(chapterId?: string, difficulty?: string, limit = 5): BankQuestion[] {
    let pool = this.questions;
    if (chapterId) {
      const filtered = pool.filter((q) => q.chapterId === chapterId);
      if (filtered.length > 0) pool = filtered;
    }
    if (difficulty) {
      const filtered = pool.filter((q) => q.difficulty === difficulty);
      if (filtered.length > 0) pool = filtered;
    }

    // Shuffle and pick
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, limit);
  }

  public addQuestion(question: Omit<BankQuestion, 'id'>): BankQuestion {
    const newQ: BankQuestion = {
      ...question,
      id: `qb_gen_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    this.questions.push(newQ);
    this.saveImmediately();
    return newQ;
  }

  public getTotalCount(): number {
    return this.questions.length;
  }
}

export const questionBankRepo = new QuestionBankRepository();
