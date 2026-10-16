import { Question, DifficultyLevel, DuolingoStage, StageCompletionRecord } from '../types/psychology';
import { SECTION_1_STAGES } from '../data/section1Stages';

/**
 * Psychological Curriculum Tier definition
 */
export interface CurriculumTier {
  id: string;
  unitIndex: number;
  name: string;
  stageRange: [number, number];
  prerequisites: string[]; // required tier IDs
  allowedDifficulties: DifficultyLevel[];
  maxAdvancedPercent: number; // Maximum % of advanced questions permitted
  coreCompetencies: string[];
  description: string;
}

/**
 * The 5 Official Curriculum Tiers for Section 1 (Stages 1-100)
 */
export const CURRICULUM_TIERS: CurriculumTier[] = [
  {
    id: 'tier-1-foundations',
    unitIndex: 1,
    name: 'واحد ۱: مبانی اولیه، تعریف علم و شناخت رفتار',
    stageRange: [1, 20],
    prerequisites: [],
    allowedDifficulties: ['basic', 'intermediate'],
    maxAdvancedPercent: 0, // Strict zero advanced questions in early stages!
    coreCompetencies: [
      'تعریف علمی روان‌شناسی',
      'تفکیک رفتار آشکار از فرآیندهای ذهنی',
      'ریشه‌های تاریخی کهن و باورهای جاندارپنداری',
      'دیدگاه‌های فلسفی آغازین (افلاطون، ارسطو، دکارت، لاک)',
      'معیارهای تمایز علم تجربی از شبه‌علم',
      'اصول اولیه تفکر انتقادی و شکاکیت روش‌مند',
      'آشنایی با زیرشاخه‌های اصلی روان‌شناسی',
    ],
    description: 'مفاهیم پایه بدون پیش‌نیاز قبلی. سوالات با حداکثر سادگی مفهومی و پرهیز مطلق از اصطلاحات پیچیده بالینی یا عصب‌شناختی.',
  },
  {
    id: 'tier-2-epistemology',
    unitIndex: 2,
    name: 'واحد ۲: فلسفه علم، روش‌شناسی پژوهش و سوگیری‌ها',
    stageRange: [21, 40],
    prerequisites: ['tier-1-foundations'],
    allowedDifficulties: ['basic', 'intermediate', 'advanced'],
    maxAdvancedPercent: 15,
    coreCompetencies: [
      'مسئله استقراء و تجربه‌گرایی روش‌شناختی',
      'معیار ابطال‌پذیری کارل پوپر در برابر شبه‌علم',
      'پارادایم‌های تامس کوهن و انقلاب‌های علمی',
      'قاعده تیغ اوکام و ایجاز تبیین',
      'سوگیری‌های شناختی پایه (تأیید، پس‌نگری، بیش‌اطمینانی)',
      'تفکیک همبستگی از علیت و کنترل دارونما',
      'اصول متغیرهای آزمایشگاهی و اخلاق پژوهش',
    ],
    description: 'آشنایی با متدولوژی علمی و تفکر پژوهشگرانه بر پایه مفاهیم گذرانده‌شده در واحد ۱.',
  },
  {
    id: 'tier-3-laboratories',
    unitIndex: 3,
    name: 'واحد ۳: تاریخچه پیدایش آزمایشگاه‌ها و مکاتب پیشگام',
    stageRange: [41, 60],
    prerequisites: ['tier-1-foundations', 'tier-2-epistemology'],
    allowedDifficulties: ['basic', 'intermediate', 'advanced'],
    maxAdvancedPercent: 20,
    coreCompetencies: [
      'پایه‌گذاری پسیکوفیزیک (فخنر و وبر)',
      'آزمایشگاه لایپزیگ ۱۸۷۹ و ویلهلم وونت',
      'روش درون‌نگری تجربی و بحران‌های روش‌شناختی آن',
      'ادوارد تیچنر و ساختارگرایی هشیاری',
      'ویلیام جیمز و کارکردگرایی در دانشگاه هاروارد',
      'مفهوم جریان سیال ذهن و انطباق با محیط',
      'آغاز آزمون‌های حافظه (ابینگهاوس) و هوش‌سنجی (بینه)',
    ],
    description: 'شکل‌گیری هویت تجربی و جدایی روان‌شناسی از فلسفه در اواخر قرن نوزدهم.',
  },
  {
    id: 'tier-4-classical-schools',
    unitIndex: 4,
    name: 'واحد ۴: مکاتب بزرگ و مناظره‌های کلاسیک قرن بیستم',
    stageRange: [61, 80],
    prerequisites: ['tier-3-laboratories'],
    allowedDifficulties: ['basic', 'intermediate', 'advanced'],
    maxAdvancedPercent: 30,
    coreCompetencies: [
      'رفتارگرایی کلاسیک (پاولف، واتسون و آزمایش آلبرت کوچولو)',
      'رفتارگرایی کنش‌گر (اسکینر، جدول‌های تقویت و جعبه اسکینر)',
      'روان‌کاوی ارتدوکس (فروید، دستگاه روانی نهاد/خود/فراخود)',
      'مکانیسم‌های دفاعی و انگیزش ناهشیار',
      'مکتب گشتالت (پدیده فای، کل‌گرایی، یادگیری بینشی)',
      'روان‌شناسی انسان‌گرایانه (کارل راجرز، هرم نیازهای مازلو)',
    ],
    description: 'رقابت پارادایم‌های بزرگ روان‌شناسی و ظهور دیدگاه‌های چندگانه نسبت به ماهیت انسان.',
  },
  {
    id: 'tier-5-cognitive-revolution',
    unitIndex: 5,
    name: 'واحد ۵: انقلاب شناختی، عصب‌پژوهی و پارادایم‌های نوین',
    stageRange: [81, 100],
    prerequisites: ['tier-4-classical-schools'],
    allowedDifficulties: ['basic', 'intermediate', 'advanced'],
    maxAdvancedPercent: 50,
    coreCompetencies: [
      'انقلاب شناختی دهه ۱۹۵۰ و استعاره ذهن-رایانه',
      'نظریه‌های زبان‌آموزی چامسکی در نقد رفتارگرایی',
      'عصب‌پژوهی پایه و پژوهش‌های مغز دونیم (راجر اسپری)',
      'خطاهای شناختی سیستم ۱ و ۲ (دانیل کانمن و عاموس تورسکی)',
      'آزمایش‌های تکان‌دهنده اجتماعی (میلگرام، زیمباردو، لاتانه)',
      'بحران تکرارپذیری معاصر و روان‌شناسی فراگیر',
      'سنتز نهایی و تسلط جامع بر ۱۰۰ مرحله روان‌شناسی',
    ],
    description: 'پیچیده‌ترین و مدرن‌ترین مباحث روان‌شناسی شناختی، بالینی و عصب‌پژوهی معاصر.',
  },
];

/**
 * Audit result report for curriculum integrity
 */
export interface CurriculumAuditReport {
  totalStages: number;
  totalQuestions: number;
  isCurriculumValid: boolean;
  violationsCount: number;
  earlyStageAdvancedCount: number; // Must be strictly 0!
  difficultyDistribution: Record<DifficultyLevel, number>;
  tierBreakdowns: {
    tierId: string;
    unitIndex: number;
    name: string;
    stageCount: number;
    questionCount: number;
    difficultyCounts: Record<DifficultyLevel, number>;
    advancedPercentage: number;
    isCompliant: boolean;
  }[];
}

/**
 * State Manager for 100-Stage Sequencing & Progression
 */
export class StageExecutionStateManager {
  private static instance: StageExecutionStateManager;
  private processedStages: DuolingoStage[] = [];

  private constructor() {
    this.initializeAndSortStages();
  }

  public static getInstance(): StageExecutionStateManager {
    if (!StageExecutionStateManager.instance) {
      StageExecutionStateManager.instance = new StageExecutionStateManager();
    }
    return StageExecutionStateManager.instance;
  }

  /**
   * Initializes and rigorously sorts all 100 stages and their questions.
   * Enforces that no advanced questions infiltrate early stages (Stages 1-10 & Unit 1).
   */
  private initializeAndSortStages(): void {
    this.processedStages = SECTION_1_STAGES.map((rawStage) => {
      const stageNumber = rawStage.stageNumber;
      const tier = this.getTierForStage(stageNumber);

      // Clone questions and apply strict curriculum sorting & gating
      const sortedGatedQuestions = this.sortAndGateQuestions(
        rawStage.questions,
        stageNumber,
        tier
      );

      return {
        ...rawStage,
        questions: sortedGatedQuestions,
      };
    });
  }

  /**
   * Identifies the curriculum tier corresponding to a stage number
   */
  public getTierForStage(stageNumber: number): CurriculumTier {
    const tier = CURRICULUM_TIERS.find(
      (t) => stageNumber >= t.stageRange[0] && stageNumber <= t.stageRange[1]
    );
    return tier || CURRICULUM_TIERS[0];
  }

  /**
   * Automated Sorting & Difficulty Gating Algorithm:
   * 1. Checks each question against the tier's prerequisite gate.
   * 2. In stages 1-10, any advanced question is safely downgraded or adjusted to basic/intermediate.
   * 3. Sorts questions pedagogically: Basic -> Intermediate -> Advanced.
   * 4. Orders question types intuitively: Definitional Multiple Choice -> True/False -> Word Bank Fill -> Match Pairs -> Case Scenarios.
   */
  public sortAndGateQuestions(
    questions: Question[],
    stageNumber: number,
    tier: CurriculumTier
  ): Question[] {
    // 1. Difficulty Weight
    const diffWeights: Record<DifficultyLevel, number> = {
      basic: 1,
      intermediate: 2,
      advanced: 3,
    };

    // 2. Question Type Cognitive Hierarchy (Bloom's Taxonomy sequence)
    const typeWeights: Record<string, number> = {
      multiple_choice: 1, // Recognition & Recall
      true_false: 2,      // Conceptual Verification
      fill_blank: 3,      // Active Recall from Word Bank
      match_pairs: 4,     // Conceptual Association & Categorization
      case_study: 5,      // Applied Synthesis & Diagnostic Decision
      sentence_order: 6,
    };

    // Process and filter/gate questions
    const sanitizedQuestions = questions.map((q) => {
      let finalDifficulty: DifficultyLevel = q.difficulty || 'basic';

      // Strict Rule: Stages 1-20 (Unit 1) cannot have advanced questions!
      if (stageNumber <= 20 && finalDifficulty === 'advanced') {
        finalDifficulty = 'intermediate';
      }

      // Stages 1-10 are foundational: maximum basic questions
      if (stageNumber <= 10 && finalDifficulty !== 'basic' && q.type === 'multiple_choice') {
        finalDifficulty = 'basic';
      }

      return {
        ...q,
        difficulty: finalDifficulty,
      };
    });

    // Sort questions deterministically
    return sanitizedQuestions.sort((a, b) => {
      const diffA = diffWeights[a.difficulty] || 1;
      const diffB = diffWeights[b.difficulty] || 1;
      if (diffA !== diffB) return diffA - diffB;

      const typeA = typeWeights[a.type] || 1;
      const typeB = typeWeights[b.type] || 1;
      if (typeA !== typeB) return typeA - typeB;

      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });
  }

  /**
   * Retrieves all pre-sorted, difficulty-gated stages
   */
  public getSortedStages(): DuolingoStage[] {
    return this.processedStages;
  }

  /**
   * Retrieves a specific stage with guaranteed curriculum sorting
   */
  public getStage(stageNumber: number): DuolingoStage | undefined {
    return this.processedStages.find((s) => s.stageNumber === stageNumber);
  }

  /**
   * Validates whether a stage's prerequisites are met
   */
  public isStagePrerequisiteMet(
    stageNumber: number,
    completedStages?: Record<number, StageCompletionRecord>
  ): { isMet: boolean; missingStageNumber?: number; reason?: string } {
    if (stageNumber <= 1) {
      return { isMet: true };
    }

    // Direct sequential chained requirement
    const requiredPrevStage = stageNumber - 1;
    const isCompleted = !!completedStages && !!completedStages[requiredPrevStage];

    if (!isCompleted) {
      return {
        isMet: false,
        missingStageNumber: requiredPrevStage,
        reason: `پیش‌نیاز مرحله ${stageNumber}، اتمام موفقیت‌آمیز مرحله ${requiredPrevStage} است.`,
      };
    }

    return { isMet: true };
  }

  /**
   * Calculates highest accessible stage based on completed records
   */
  public calculateUnlockedStageNumber(
    completedStages?: Record<number, StageCompletionRecord>
  ): number {
    if (!completedStages || Object.keys(completedStages).length === 0) {
      return 1;
    }
    let target = 1;
    while (completedStages[target] !== undefined) {
      target++;
    }
    return Math.min(target, 100);
  }

  /**
   * Runs an automated curriculum integrity and difficulty audit
   */
  public runCurriculumAudit(): CurriculumAuditReport {
    let totalQuestions = 0;
    let earlyStageAdvancedCount = 0;
    const overallDifficulty: Record<DifficultyLevel, number> = {
      basic: 0,
      intermediate: 0,
      advanced: 0,
    };

    const tierBreakdowns = CURRICULUM_TIERS.map((tier) => {
      const tierStages = this.processedStages.filter(
        (s) => s.stageNumber >= tier.stageRange[0] && s.stageNumber <= tier.stageRange[1]
      );

      const diffCounts: Record<DifficultyLevel, number> = {
        basic: 0,
        intermediate: 0,
        advanced: 0,
      };

      let tierQuestionCount = 0;

      tierStages.forEach((st) => {
        st.questions.forEach((q) => {
          diffCounts[q.difficulty]++;
          overallDifficulty[q.difficulty]++;
          tierQuestionCount++;
          totalQuestions++;

          if (st.stageNumber <= 10 && q.difficulty === 'advanced') {
            earlyStageAdvancedCount++;
          }
        });
      });

      const advPercent =
        tierQuestionCount > 0
          ? Math.round((diffCounts.advanced / tierQuestionCount) * 100)
          : 0;

      const isCompliant = advPercent <= tier.maxAdvancedPercent;

      return {
        tierId: tier.id,
        unitIndex: tier.unitIndex,
        name: tier.name,
        stageCount: tierStages.length,
        questionCount: tierQuestionCount,
        difficultyCounts: diffCounts,
        advancedPercentage: advPercent,
        isCompliant,
      };
    });

    const isCurriculumValid = earlyStageAdvancedCount === 0;

    return {
      totalStages: this.processedStages.length,
      totalQuestions,
      isCurriculumValid,
      violationsCount: earlyStageAdvancedCount,
      earlyStageAdvancedCount,
      difficultyDistribution: overallDifficulty,
      tierBreakdowns,
    };
  }
}

// Export singleton engine helper
export const stageExecutionEngine = StageExecutionStateManager.getInstance();
