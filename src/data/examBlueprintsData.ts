/**
 * Public Entrance Exam Blueprints Metadata and Pure Konkoor Scoring Engine
 * Project: PsychoMaster (روان‌لینگو) - Phase 10B.2 Security Hardening
 *
 * SECURITY INVARIANT:
 * - This module contains ONLY public blueprint metadata (`DEFAULT_EXAM_BLUEPRINTS`,
 *   `CHAPTER_TITLES_MAP`) and pure scoring math (`calculateExamScoreAndBreakdown`).
 * - It MUST NOT import or export any exam questions, `correctIndex` answer keys,
 *   or answer explanations.
 */

import type {
  ExamBlueprint,
  ExamBlueprintSection,
  ExamSectionBreakdown,
} from '../worker/db/schema.ts';

export const CHAPTER_TITLES_MAP: Record<string, string> = {
  'ch-1': 'فصل ۱: روان‌شناسی چیست؟ تاریخچه، تعریف و قلمرو',
  'ch-2': 'فصل ۲: فلسفه علم و مبانی معرفت‌شناسی',
  'ch-3': 'فصل ۳: مکاتب بزرگ روان‌شناسی',
  'ch-4': 'فصل ۴: اخلاق، روش‌های پژوهش و آمار در روان‌شناسی',
  'ch-5': 'فصل ۵: نورون، سیناپس و پتانسیل عمل',
  'ch-6': 'فصل ۶: ساختار مغز، لوب‌ها و سیستم لیمبیک',
  'ch-7': 'فصل ۷: روان‌داروشناسی و انتقال‌دهنده‌های عصبی',
  'ch-8': 'فصل ۸: احساس، ادراک و توجه',
  'ch-9': 'فصل ۹: هوشیاری، مراحل خواب و رؤیا',
  'ch-10': 'فصل ۱۰: اصول یادگیری و شرطی‌سازی',
  'ch-11': 'فصل ۱۱: حافظه و زبان',
  'ch-12': 'فصل ۱۲: تفکر، تصمیم‌گیری و سنجش هوش',
  'ch-13': 'فصل ۱۳: انگیزش، هیجان، استرس و تاب‌آوری',
  'ch-14': 'فصل ۱۴: رشد زیستی، عصبی و دوره‌های زندگی',
  'ch-15': 'فصل ۱۵: رشد شناختی، اخلاقی و دلبستگی',
  'ch-16': 'فصل ۱۶: نظریه‌ها و آزمون‌های شخصیت',
  'ch-17': 'فصل ۱۷: روان‌شناسی اجتماعی و فرهنگی',
  'ch-18': 'فصل ۱۸: آسیب‌شناسی روانی، اضطراب، خلقی و اسکیزوفرنی (DSM-5-TR)',
  'ch-19': 'فصل ۱۹: اختلالات شخصیت، عصب‌تحولی و اعتیاد',
  'ch-20': 'فصل ۲۰: مکاتب روان‌درمانی و مداخلات بالینی',
  'ch-21': 'فصل ۲۱: روان‌شناسی سلامت، صنعتی-سازمانی و قانونی',
  'ch-22': 'فصل ۲۲: روان‌شناسی مثبت، علوم اعصاب شناختی و مرزهای نوین',
};

export const DEFAULT_EXAM_BLUEPRINTS: ExamBlueprint[] = [
  {
    id: 'bp_comprehensive_arshad',
    slug: 'comprehensive-arshad-psychology',
    title: 'آزمون جامع شبیه‌ساز کنکور ارشد روان‌شناسی',
    description:
      'شبیه‌سازی کامل دفترچه‌های کنکور کارشناسی ارشد روان‌شناسی (عمومی، بالینی و تربیتی) با ضرایب استاندارد دروس و نمره منفی یک‌سوم.',
    examType: 'comprehensive',
    durationMinutes: 25,
    totalQuestions: 20,
    negativeMarking: true,
    negativeWeight: 0.3333,
    isPublished: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    sections: [
      {
        id: 'sec_general_cognitive',
        title: 'دفترچه ۱: روان‌شناسی عمومی، یادگیری و شناخت',
        questionCount: 4,
        weight: 2,
        chapterIds: ['ch-1', 'ch-3', 'ch-8', 'ch-9', 'ch-10', 'ch-11', 'ch-12', 'ch-13'],
        difficultyMix: { easy: 1, medium: 2, hard: 1 },
      },
      {
        id: 'sec_clinical_abnormal',
        title: 'دفترچه ۲: آسیب‌شناسی روانی (DSM-5-TR) و روان‌درمانی',
        questionCount: 5,
        weight: 3,
        chapterIds: ['ch-18', 'ch-19', 'ch-20', 'ch-16'],
        difficultyMix: { easy: 1, medium: 2, hard: 2 },
      },
      {
        id: 'sec_developmental_social',
        title: 'دفترچه ۳: روان‌شناسی رشد، تحولی و اجتماعی',
        questionCount: 4,
        weight: 2,
        chapterIds: ['ch-14', 'ch-15', 'ch-17', 'ch-21'],
        difficultyMix: { easy: 1, medium: 2, hard: 1 },
      },
      {
        id: 'sec_neuro_bio',
        title: 'دفترچه ۴: فیزیولوژیک، علوم اعصاب و داروشناسی',
        questionCount: 4,
        weight: 2,
        chapterIds: ['ch-5', 'ch-6', 'ch-7', 'ch-22'],
        difficultyMix: { easy: 1, medium: 2, hard: 1 },
      },
      {
        id: 'sec_research_stats',
        title: 'دفترچه ۵: روش تحقیق، آمار، روان‌سنجی و فلسفه علم',
        questionCount: 3,
        weight: 2,
        chapterIds: ['ch-2', 'ch-4'],
        difficultyMix: { easy: 1, medium: 1, hard: 1 },
      },
    ],
  },
  {
    id: 'bp_diagnostic_placement',
    slug: 'diagnostic-psychology-placement',
    title: 'آزمون تعیین سطح و عیب‌یابی پایه روان‌شناسی',
    description:
      'ارزیابی تشخیصی بدون نمره منفی برای سنجش سطح تسلط فعلی شما در ۵ قطب اصلی روان‌شناسی و شناسایی فصول نیازمند مرور.',
    examType: 'diagnostic',
    durationMinutes: 15,
    totalQuestions: 10,
    negativeMarking: false,
    negativeWeight: 0,
    isPublished: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    sections: [
      {
        id: 'sec_diag_foundations',
        title: 'مبانی، تاریخچه و روش‌شناسی علم روان‌شناسی',
        questionCount: 2,
        weight: 1,
        chapterIds: ['ch-1', 'ch-2', 'ch-3', 'ch-4'],
      },
      {
        id: 'sec_diag_biocog',
        title: 'مغز، اعصاب، ادراک و فرآیندهای شناختی',
        questionCount: 3,
        weight: 1,
        chapterIds: ['ch-5', 'ch-6', 'ch-7', 'ch-8', 'ch-9', 'ch-10', 'ch-11', 'ch-12'],
      },
      {
        id: 'sec_diag_dev_pers',
        title: 'روان‌شناسی رشد، انگیزش و نظریه‌های شخصیت',
        questionCount: 2,
        weight: 1,
        chapterIds: ['ch-13', 'ch-14', 'ch-15', 'ch-16', 'ch-17'],
      },
      {
        id: 'sec_diag_clinical',
        title: 'آسیب‌شناسی روانی و مداخلات بالینی',
        questionCount: 3,
        weight: 1,
        chapterIds: ['ch-18', 'ch-19', 'ch-20', 'ch-21', 'ch-22'],
      },
    ],
  },
  {
    id: 'bp_subject_clinical_dsm',
    slug: 'subject-clinical-psychopathology-dsm5',
    title: 'آزمون مبحثی بالینی، آسیب‌شناسی (DSM-5-TR) و شخصیت',
    description:
      'ویژه داوطلبان گرایش روان‌شناسی بالینی و عمومی؛ تمرکز بر تشخیص افتراقی اختلالات، مکاتب شخصیت و پروتکل‌های روان‌درمانی.',
    examType: 'subject',
    durationMinutes: 15,
    totalQuestions: 12,
    negativeMarking: true,
    negativeWeight: 0.3333,
    isPublished: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    sections: [
      {
        id: 'sec_clin_dsm',
        title: 'تشخیص افتراقی و معیارهای DSM-5-TR',
        questionCount: 5,
        weight: 3,
        chapterIds: ['ch-18', 'ch-19'],
      },
      {
        id: 'sec_clin_personality',
        title: 'نظریه‌های شخصیت و سنجش بالینی',
        questionCount: 4,
        weight: 2,
        chapterIds: ['ch-16', 'ch-13'],
      },
      {
        id: 'sec_clin_therapy',
        title: 'مکاتب روان‌درمانی و روان‌شناسی سلامت',
        questionCount: 3,
        weight: 2,
        chapterIds: ['ch-20', 'ch-21'],
      },
    ],
  },
  {
    id: 'bp_subject_neuro_cognitive',
    slug: 'subject-neuropsychology-cognitive-research',
    title: 'آزمون مبحثی علوم اعصاب، شناخت، رشد و روش تحقیق',
    description:
      'سنجش عمیق مباحث فیزیولوژیک، نوروترنسمیترها، شرطی‌سازی، حافظه، تحول شناختی پیاژه/ویگوتسکی و طرح‌های پژوهشی.',
    examType: 'subject',
    durationMinutes: 15,
    totalQuestions: 12,
    negativeMarking: true,
    negativeWeight: 0.3333,
    isPublished: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    sections: [
      {
        id: 'sec_neuro_physio',
        title: 'نوروپسیکولوژی و روان‌داروشناسی',
        questionCount: 4,
        weight: 2,
        chapterIds: ['ch-5', 'ch-6', 'ch-7', 'ch-22'],
      },
      {
        id: 'sec_cog_learning',
        title: 'یادگیری، حافظه، ادراک و رشد شناختی',
        questionCount: 5,
        weight: 2,
        chapterIds: ['ch-8', 'ch-9', 'ch-10', 'ch-11', 'ch-12', 'ch-14', 'ch-15'],
      },
      {
        id: 'sec_method_epist',
        title: 'روش‌شناسی پژوهش، آمار و معرفت‌شناسی',
        questionCount: 3,
        weight: 2,
        chapterIds: ['ch-1', 'ch-2', 'ch-3', 'ch-4'],
      },
    ],
  },
  {
    id: 'bp_timed_speed_drill',
    slug: 'timed-konkoor-speed-drill',
    title: 'آزمون سرعتی مدیریت زمان و نکات پرتکرار کنکور',
    description:
      '۱۰ تست کلیدی و پرتکرار کنکوری در زمان فشرده ۸ دقیقه‌ای با نمره منفی یک‌سوم برای تمرین تکنیک ضربدر و منها و کنترل زمان.',
    examType: 'timed_drill',
    durationMinutes: 8,
    totalQuestions: 10,
    negativeMarking: true,
    negativeWeight: 0.3333,
    isPublished: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    sections: [
      {
        id: 'sec_speed_core',
        title: 'دفترچه سرعتی: مبانی، بالینی، شناخت و فیزیولوژیک',
        questionCount: 10,
        weight: 1,
        chapterIds: [
          'ch-1',
          'ch-2',
          'ch-4',
          'ch-5',
          'ch-6',
          'ch-7',
          'ch-8',
          'ch-10',
          'ch-11',
          'ch-15',
          'ch-16',
          'ch-18',
          'ch-19',
          'ch-20',
        ],
      },
    ],
  },
];

export interface ScoreCalculationInput {
  blueprint: Pick<ExamBlueprint, 'negativeMarking' | 'negativeWeight' | 'sections'> & {
    totalQuestions?: number;
  };
  questions: Array<{
    id: string;
    sectionId: string;
    chapterId: string;
    correctIndex: number;
  }>;
  answersByQuestionId: Map<
    string,
    {
      selectedIndex: number | null;
      isFlagged?: boolean;
      timeSpentSeconds?: number;
    }
  >;
  totalQuestionsDenominator?: number;
}

export interface ScoreCalculationResult {
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  rawScorePercent: number;
  weightedScorePercent: number;
  sectionBreakdown: ExamSectionBreakdown[];
  perQuestionCorrectness: Map<string, boolean | null>;
  xpToAward: number;
}

/**
 * Pure deterministic Konkoor exam scoring calculator.
 * Formula:
 *   RawPercent = ((C - w * W) / N) * 100
 *   where w = 1/3 when negativeMarking is true and negativeWeight is ~0.3333, or 0 when negativeMarking is false.
 *
 * XP Eligibility Policy (Phase 10B.2):
 *   - Submissions with zero correct answers (C === 0) or non-positive raw score (rawScorePercent <= 0)
 *     receive 0 XP.
 *   - Qualifying submissions (C > 0 && rawScorePercent > 0) receive:
 *     clamp(10 + 10 * C + (rawScorePercent >= 60 ? 25 : 0), 10, 250).
 */
export function calculateExamScoreAndBreakdown(
  input: ScoreCalculationInput
): ScoreCalculationResult {
  const { blueprint, questions, answersByQuestionId, totalQuestionsDenominator } = input;

  // Use explicit denominator if provided (e.g. from attempt.questionIds.length),
  // falling back to questions.length.
  const totalQuestions = Math.max(
    1,
    Number(totalQuestionsDenominator) || questions.length
  );

  // Use exact 1/3 when negativeWeight is configured as 0.3333 / 0.33 so 3 correct, 3 wrong, 4 blank = 20%
  const rawWeight = Number(blueprint.negativeWeight) || 0;
  const effectiveWeight = blueprint.negativeMarking
    ? Math.abs(rawWeight - 1 / 3) < 0.01
      ? 1 / 3
      : rawWeight
    : 0;

  let correctCount = 0;
  let wrongCount = 0;
  let answeredCount = 0;
  const perQuestionCorrectness = new Map<string, boolean | null>();

  for (const q of questions) {
    const ans = answersByQuestionId.get(q.id);
    const sel =
      ans && typeof ans.selectedIndex === 'number' && Number.isInteger(ans.selectedIndex)
        ? ans.selectedIndex
        : null;

    if (sel === null || sel < 0 || sel > 3) {
      perQuestionCorrectness.set(q.id, null);
    } else if (sel === q.correctIndex) {
      correctCount += 1;
      answeredCount += 1;
      perQuestionCorrectness.set(q.id, true);
    } else {
      wrongCount += 1;
      answeredCount += 1;
      perQuestionCorrectness.set(q.id, false);
    }
  }

  const unansweredCount = Math.max(0, totalQuestions - answeredCount);
  const rawPoints = correctCount - effectiveWeight * wrongCount;
  const rawScorePercent =
    totalQuestions > 0 ? Math.round(((rawPoints / totalQuestions) * 100) * 100) / 100 : 0;

  // Calculate per-section breakdown
  const sectionDefs: ExamBlueprintSection[] =
    blueprint.sections && blueprint.sections.length > 0
      ? blueprint.sections
      : [
          {
            id: 'general',
            title: 'دفترچه عمومی آزمون',
            questionCount: totalQuestions,
            weight: 1,
            chapterIds: [],
          },
        ];

  const sectionBreakdown: ExamSectionBreakdown[] = [];
  let weightedSum = 0;
  let totalWeights = 0;

  for (const sec of sectionDefs) {
    const secQuestions = questions.filter((q) => q.sectionId === sec.id);
    const secExpected = Number(sec.questionCount) || 0;
    const secTotal = Math.max(1, secExpected > 0 ? secExpected : secQuestions.length);

    let secCorrect = 0;
    let secWrong = 0;
    let secAnswered = 0;

    for (const q of secQuestions) {
      const state = perQuestionCorrectness.get(q.id);
      if (state === true) {
        secCorrect += 1;
        secAnswered += 1;
      } else if (state === false) {
        secWrong += 1;
        secAnswered += 1;
      }
    }

    const secUnanswered = Math.max(0, secTotal - secAnswered);
    const secNet = secCorrect - effectiveWeight * secWrong;
    const secPercent = Math.round(((secNet / secTotal) * 100) * 100) / 100;
    const secWeight = Math.max(1, Number(sec.weight) || 1);

    sectionBreakdown.push({
      sectionId: sec.id,
      sectionTitle: sec.title,
      weight: secWeight,
      totalQuestions: secTotal,
      correctCount: secCorrect,
      wrongCount: secWrong,
      unansweredCount: secUnanswered,
      rawScorePercent: secPercent,
      chapterIds: sec.chapterIds || [],
    });

    weightedSum += secPercent * secWeight;
    totalWeights += secWeight;
  }

  const weightedScorePercent =
    totalWeights > 0 ? Math.round((weightedSum / totalWeights) * 100) / 100 : rawScorePercent;

  // Server-owned XP calculation (Phase 10B.2 anti-farming rule):
  // Blank attempts, 0 correct answers, or non-positive raw scores (<= 0%) earn 0 XP.
  const xpToAward =
    correctCount > 0 && rawScorePercent > 0
      ? Math.max(
          10,
          Math.min(250, Math.round(10 + correctCount * 10 + (rawScorePercent >= 60 ? 25 : 0)))
        )
      : 0;

  return {
    totalQuestions,
    correctCount,
    wrongCount,
    unansweredCount,
    rawScorePercent,
    weightedScorePercent,
    sectionBreakdown,
    perQuestionCorrectness,
    xpToAward,
  };
}
