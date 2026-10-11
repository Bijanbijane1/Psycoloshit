import { Question } from '../types/psychology';

// Interface for blueprint input from section1Stages
export interface BlueprintForBuilder {
  title: string;
  englishTitle: string;
  chapterId: string;
  unitIndex: number;
  unitTitle: string;
  description: string;
  keyTakeaway: string;
  type: 'normal' | 'checkpoint' | 'chest' | 'boss';
  xpReward: number;
  q1: any;
  q2: any;
}

/**
 * Builds 10 to 12 high-impact, diverse pedagogical questions for each stage
 * Mixing: Multiple Choice, True/False, Word Bank Fill-in-the-Blank, Matching Pairs, and Case Studies.
 */
export function generateStageQuestions(stageNumber: number, bp: BlueprintForBuilder): Question[] {
  // Base questions from blueprint
  const questions: Question[] = [];

  // Q1: Core Stage Multiple Choice
  questions.push({
    id: `s1-stage-${stageNumber}-q1`,
    type: bp.q1.type || 'multiple_choice',
    title: bp.q1.title,
    text: bp.q1.text,
    options: bp.q1.options,
    correctAnswer: bp.q1.correctAnswer,
    explanation: bp.q1.explanation,
    matchPairs: bp.q1.matchPairs,
    blankContext: bp.q1.blankContext,
    isTrue: bp.q1.isTrue,
    difficulty: 'basic',
    points: 10,
  });

  // Q2: Secondary Stage Question
  questions.push({
    id: `s1-stage-${stageNumber}-q2`,
    type: bp.q2.type || 'multiple_choice',
    title: bp.q2.title,
    text: bp.q2.text,
    options: bp.q2.options,
    correctAnswer: bp.q2.correctAnswer,
    explanation: bp.q2.explanation,
    matchPairs: bp.q2.matchPairs,
    blankContext: bp.q2.blankContext,
    isTrue: bp.q2.isTrue,
    difficulty: 'basic',
    points: 10,
  });

  // Add stage-specific custom 8 to 10 questions for deep curriculum coverage
  const extraQuestions = getEnrichedQuestionsForStage(stageNumber, bp);
  questions.push(...extraQuestions);

  // PEDAGOGICAL SORTING: Always place simpler, foundational questions first,
  // followed by intermediate matching/concepts, and finally advanced clinical scenarios/synthesis.
  const diffOrder: Record<string, number> = {
    basic: 1,
    intermediate: 2,
    advanced: 3,
  };

  return questions.sort((a, b) => {
    const orderA = diffOrder[a.difficulty || 'basic'] || 1;
    const orderB = diffOrder[b.difficulty || 'basic'] || 1;
    return orderA - orderB;
  });
}

/**
 * Detailed question generator for Stages 1 to 100 with all question styles
 */
function getEnrichedQuestionsForStage(stageNumber: number, bp: BlueprintForBuilder): Question[] {
  const pId = `s1-stage-${stageNumber}`;

  // =========================================================================
  // STAGES 1 TO 10: FOCAL INTENSIVE PACKAGE (10-12 Questions per Stage)
  // =========================================================================
  if (stageNumber === 1) {
    // Stage 1: Scientific Definition of Psychology
    return [
      {
        id: `${pId}-q3`,
        type: 'true_false',
        title: 'درست یا غلط: تفکیک علم تجربی از فلسفه',
        text: 'روان‌شناسی مدرن ادعاها درباره رفتار را صرفاً از طریق تعمق نظری و بدون آزمون تجربی اثبات می‌کند.',
        correctAnswer: false,
        isTrue: false,
        explanation: 'نادرست است! روان‌شناسی علمی بر پایه‌ی مشاهده کنترل‌شده، گردآوری داده‌های عینی و متدولوژی تجربی استوار است نه صرفاً قیاس فلسفی.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q4`,
        type: 'fill_blank',
        title: 'تکمیل گزاره: ستون‌های روان‌شناسی',
        text: 'روان‌شناسی به عنوان یک علم، مطالعه پیوسته رفتار آشکار و فرآیندهای ______ انسان است.',
        correctAnswer: 'ذهنی',
        options: ['ذهنی', 'ماورایی', 'تصادفی', 'زیست‌شیمیایی محض'],
        blankContext: {
          before: 'روان‌شناسی به عنوان یک علم، مطالعه پیوسته رفتار آشکار و فرآیندهای ',
          after: ' انسان است.',
        },
        explanation: 'دو بال روان‌شناسی عبارت‌اند از رفتار بیرونی (Behavior) و فرآیندهای درونی ذهنی (Mental Processes).',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q5`,
        type: 'match_pairs',
        title: 'تطبیق جفت‌ها: ارکان تعریف روان‌شناسی',
        text: 'هر اصطلاح را به تعریف دقیق آن وصل کن:',
        matchPairs: [
          { id: 'p1', left: 'رفتار آشکار', right: 'کنش‌های قابل مشاهده و سنجش مستقیم' },
          { id: 'p2', left: 'فرآیندهای ذهنی', right: 'تجارب درونی مانند حافظه، تفکر و رویا' },
          { id: 'p3', left: 'روش علمی', right: 'مشاهده منظم، فرضیه‌سازی و ابطال‌پذیری' },
          { id: 'p4', left: 'روان‌پزشکی', right: 'تخصص پزشکی متمرکز بر دارودرمانی' },
        ],
        correctAnswer: 'matched_all',
        explanation: 'این چهار مؤلفه مرزهای دقیق روان‌شناسی را از سایر حوزه‌ها جدا می‌کنند.',
        difficulty: 'basic',
        points: 15,
      },
      {
        id: `${pId}-q6`,
        type: 'case_study',
        title: 'سناریوی تشخیصی: رفتار یا فرآیند ذهنی؟',
        text: 'در موقعیت زیر، کدام پدیده مستقیماً یک «رفتار آشکار» محسوب می‌شود؟',
        caseScenario: {
          clientProfile: 'دانش‌آموزی در جلسه امتحان ریاضی حضور دارد. او دچار اضطراب شدید است، در ذهن خود فرمول هندسه را مرور می‌کند، ضربان قلبش بالا رفته و ناگهان با مداد روی برگه ضربه می‌زند.',
          symptoms: ['مرور ذهنی فرمول', 'احساس اضطراب درونی', 'ضربه زدن با مداد روی برگه', 'فراموشی موقت'],
          diagnosticOptions: ['ضربه زدن با مداد روی برگه', 'مرور ذهنی فرمول', 'احساس اضطراب درونی', 'امیدواری به موفقیت'],
          therapeuticStep: 'تفکیک اعمال مشاهده‌پذیر بیرونی از تجارب شناختی-هیجانی درونی.',
        },
        options: ['ضربه زدن با مداد روی برگه', 'مرور ذهنی فرمول', 'احساس اضطراب درونی', 'امیدواری به موفقیت'],
        correctAnswer: 0,
        explanation: 'ضربه زدن با مداد یک کنش فیزیکی حرکتی آشکار است که هر ناظری می‌تواند آن را ثبت کند؛ در حالی که فرمول و اضطراب فرآیندهای درونی‌اند.',
        difficulty: 'intermediate',
        points: 15,
      },
      {
        id: `${pId}-q7`,
        type: 'multiple_choice',
        title: 'تفاوت بنیادین روان‌شناسی با روان‌پزشکی',
        text: 'تفاوت آکادمیک اصلی یک روان‌شناس بالینی با یک روان‌پزشک (Psychiatrist) در چیست؟',
        options: [
          'روان‌پزشک پزشک است و صلاحیت تجویز دارو دارد؛ روان‌شناس بر سنجش روانی و روان‌درمانی تمرکز دارد',
          'روان‌شناس فقط با کودکان کار می‌کند و روان‌پزشک با بزرگسالان',
          'روان‌پزشک نیازی به تحصیلات دانشگاهی ندارد',
          'هیچ تفاوتی میان این دو رشته وجود ندارد',
        ],
        correctAnswer: 0,
        explanation: 'روان‌پزشکان دوره پزشکی عمومی و رزیدنتی اعصاب و روان را می‌گذرانند و دارو تجویز می‌کنند؛ روان‌شناسان دوره تخصصی روان‌شناسی و روان‌درمانی را سپری می‌کنند.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q8`,
        type: 'true_false',
        title: 'درست یا غلط: تجارب ذهنی',
        text: 'از آنجا که افکار و هیجانات با چشم غیرمسلح دیده نمی‌شوند، روان‌شناسی علمی آن‌ها را کاملاً نادیده می‌گیرد.',
        correctAnswer: false,
        isTrue: false,
        explanation: 'نادرست است! روان‌شناسی با ابزارهای شناختی، زمان واکنش و شواهد تصویربرداری مغز فرآیندهای ذهنی را به طور علمی استنباط و مطالعه می‌کند.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q9`,
        type: 'fill_blank',
        title: 'تکمیل مفهوم: پیش‌بینی رفتار',
        text: 'اهداف چهارگانه روان‌شناسی علمی عبارت‌اند از: توصیف، تبیین، ______ و کنترل/تغییر رفتار.',
        correctAnswer: 'پیش‌بینی',
        options: ['پیش‌بینی', 'قضاوت اخلاقی', 'تلقین ذهنی', 'مجازات'],
        blankContext: {
          before: 'اهداف چهارگانه روان‌شناسی علمی عبارت‌اند از: توصیف، تبیین، ',
          after: ' و کنترل/تغییر رفتار.',
        },
        explanation: 'روان‌شناسی با شناخت الگوها در پی پیش‌بینی چگونگی عملکرد ارگانیسم در موقعیت‌های گوناگون است.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q10`,
        type: 'multiple_choice',
        title: 'تسلط بر تعریف روان‌شناسی',
        text: 'کدام عبارت توصیف جامع‌تری از ماهیت بین‌رشته‌ای روان‌شناسی ارائه می‌دهد؟',
        options: [
          'پیونددهنده علوم زیستی (عصب‌شناسی) با علوم اجتماعی (فرهنگ و تعاملات بین‌فردی)',
          'شاخه‌ای فرعی از ادبیات داستانی قرن نوزدهم',
          'مجموعه‌ای از نصایح اخلاقی بدون آزمون تجربی',
          'صرفاً مطالعه اختلالات روانی شدید و جنون',
        ],
        correctAnswer: 0,
        explanation: 'روان‌شناسی پلی است میان زیست‌شناسی مغز و علوم اجتماعی و فرهنگی رفتار انسان.',
        difficulty: 'intermediate',
        points: 15,
      },
    ];
  }

  if (stageNumber === 2) {
    // Stage 2: Behavior vs Mental Processes
    return [
      {
        id: `${pId}-q3`,
        type: 'true_false',
        title: 'درست یا غلط: سنجش غیرمستقیم فرآیندهای ذهنی',
        text: 'روان‌شناسان فرآیندهای ذهنی پنهان را از طریق سنجش خطاهای رفتاری و زمان واکنش استنباط می‌کنند.',
        correctAnswer: true,
        isTrue: true,
        explanation: 'کاملاً درست است! مثلاً زمان واکنش در آزمایش‌های شناختی نشان‌دهنده پیچیدگی پردازش مغزی است.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q4`,
        type: 'fill_blank',
        title: 'تکمیل گزاره: رفتار آشکار',
        text: 'خندیدن، صحبت کردن و ضربان کلیدهای کیبورد همگی نمونه‌هایی از رفتار ______ هستند.',
        correctAnswer: 'آشکار',
        options: ['آشکار', 'پنهان', 'تخیلی', 'فطری'],
        blankContext: {
          before: 'خندیدن، صحبت کردن و ضربان کلیدهای کیبورد همگی نمونه‌هایی از رفتار ',
          after: ' هستند.',
        },
        explanation: 'رفتار آشکار (Overt Behavior) مستقیماً با حواس و ابزارهای بیرونی قابل ثبت است.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q5`,
        type: 'match_pairs',
        title: 'تطبیق جفت‌ها: تفکیک رفتار و فرآیند ذهنی',
        text: 'هر پدیده را به طبقه روان‌شناختی مناسب متصل کن:',
        matchPairs: [
          { id: 'p1', left: 'حل معما در ذهن', right: 'فرآیند شناختی درونی' },
          { id: 'p2', left: 'فریاد زدن از ترس', right: 'رفتار حرکتی-صوتی آشکار' },
          { id: 'p3', left: 'مرور خاطره کودکی', right: 'بازیابی حافظه (فرآیند ذهنی)' },
          { id: 'p4', left: 'پلک زدن در برابر نور', right: 'بازتاب حرکتی فیزیولوژیک' },
        ],
        correctAnswer: 'matched_all',
        explanation: 'توانایی تفکیک رفتار از فرآیند ذهنی مهارت پایه پژوهش در روان‌شناسی است.',
        difficulty: 'basic',
        points: 15,
      },
      {
        id: `${pId}-q6`,
        type: 'case_study',
        title: 'سناریوی آزمایشگاهی: تصمیم‌گیری در خرید',
        text: 'در یک پژوهش بازاریابی عصبی، کدام شاخص به عنوان رفتار آشکار ثبت می‌شود؟',
        caseScenario: {
          clientProfile: 'مشتری در یک فروشگاه زنجیره‌ای روبروی قفسه غلات صبحانه ایستاده است. او بین دو برند تردید دارد، نگاهش بین دو جعبه حرکت می‌کند و نهایتاً جعبه سمت راست را برمی‌دارد و در سبد می‌گذارد.',
          symptoms: ['تردید درونی', 'ارزیابی ارزش غذایی در ذهن', 'برداشتن جعبه و قرار دادن در سبد', 'احساس رضایت خاطر'],
          diagnosticOptions: ['برداشتن جعبه و قرار دادن در سبد', 'تردید درونی', 'ارزیابی ارزش غذایی در ذهن', 'احساس رضایت خاطر'],
          therapeuticStep: 'ثبت متغیر وابسته حرکتی بدون تکیه بر حدس‌های ذهنی اثبات‌نشده.',
        },
        options: ['برداشتن جعبه و قرار دادن در سبد', 'تردید درونی', 'ارزیابی ارزش غذایی در ذهن', 'احساس رضایت خاطر'],
        correctAnswer: 0,
        explanation: 'برداشتن جعبه عملی فیزیکی و آشکار است که به طور مستقیم اندازه‌گیری و شمارش می‌شود.',
        difficulty: 'intermediate',
        points: 15,
      },
      {
        id: `${pId}-q7`,
        type: 'multiple_choice',
        title: 'چالش رفتارگرایی اولیه',
        text: 'چرا رفتارگرایان تندرو مانند واتسون در آغاز فرآیندهای ذهنی را از قلمرو علم خارج کردند؟',
        options: [
          'چون فرآیندهای ذهنی مستقیماً قابل مشاهده و سنجش با ابزارهای فیزیکی نبودند',
          'چون معتقد بودند انسان‌ها مغز ندارند',
          'چون حافظه و تفکر وجود خارجی ندارند',
          'چون روش‌های جراحی مغز پیشرفته بود',
        ],
        correctAnswer: 0,
        explanation: 'واتسون معتقد بود علم تجربی فقط باید بر آنچه با چشم دیده می‌شود و ثبت‌پذیر است (رفتار آشکار) تمرکز کند.',
        difficulty: 'intermediate',
        points: 10,
      },
      {
        id: `${pId}-q8`,
        type: 'true_false',
        title: 'درست یا غلط: انگیزه درونی',
        text: 'انگیزه درونی یک فرآیند روانی است که تنها از روی میزان تلاش و پشتکار رفتاری فرد استنباط می‌شود.',
        correctAnswer: true,
        isTrue: true,
        explanation: 'درست است! ما انگیزه را مستقیماً نمی‌بینیم، بلکه از رفتارهایی چون ساعات مطالعه و پیگیری کارها استنباط می‌کنیم.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q9`,
        type: 'fill_blank',
        title: 'تکمیل اصطلاح: استنباط علمی',
        text: 'روان‌شناسان شناختی برای پی بردن به فرآیندهای ذهنی، از متغیرهای رفتاری مانند ______ واکنش استفاده می‌کنند.',
        correctAnswer: 'زمان',
        options: ['زمان', 'رنگ', 'هزینه', 'فشار'],
        blankContext: {
          before: 'روان‌شناسان شناختی برای پی بردن به فرآیندهای ذهنی، از متغیرهای رفتاری مانند ',
          after: ' واکنش استفاده می‌کنند.',
        },
        explanation: 'زمان واکنش (Reaction Time) از دوران وونت تا امروز دقیق‌ترین مقیاس برای سنجش مراحل تفکر در ذهن است.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q10`,
        type: 'multiple_choice',
        title: 'جمع‌بندی تفاوت رفتار و فرآیند ذهنی',
        text: 'کدام پژوهشگر هر دو بعد رفتار آشکار و فرآیند ذهنی را به شکل معاصر در مدل‌های شناختی-رفتاری تلفیق کرد؟',
        options: [
          'روان‌شناسان شناختی-رفتاری معاصر (CBT)',
          'عرفای قرون وسطی',
          'طالع‌بینان ستاره‌شناس',
          'طرفداران هیپنوتیزم نمایشی',
        ],
        correctAnswer: 0,
        explanation: 'رویکرد شناختی-رفتاری نشان می‌دهد افکار (فرآیند ذهنی) و اعمال (رفتار) مدام بر یکدیگر اثر متقابل می‌گذارند.',
        difficulty: 'basic',
        points: 10,
      },
    ];
  }

  if (stageNumber === 3) {
    // Stage 3: Critical Thinking in Psychology
    return [
      {
        id: `${pId}-q3`,
        type: 'true_false',
        title: 'درست یا غلط: تفکر انتقادی و شکاکیت علمی',
        text: 'شکاکیت علمی در تفکر انتقادی به معنای بدبینی کورکورانه نسبت به تمام یافته‌های علمی است.',
        correctAnswer: false,
        isTrue: false,
        explanation: 'نادرست است! شکاکیت علمی یعنی تقاضای شواهد معتبر و بررسی روش پژوهش، نه انکار غیرمنطقی حقایق.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q4`,
        type: 'fill_blank',
        title: 'تکمیل گزاره: اصل ساگان',
        text: 'ادعاهای خارق‌العاده نیازمند شواهد فوق‌العاده ______ و تکرارپذیر در آزمایشگاه هستند.',
        correctAnswer: 'محکم',
        options: ['محکم', 'ضعیف', 'قدیمی', 'محرمانه'],
        blankContext: {
          before: 'ادعاهای خارق‌العاده نیازمند شواهد فوق‌العاده ',
          after: ' و تکرارپذیر در آزمایشگاه هستند.',
        },
        explanation: 'اصل ساگان مانع پذیرش خرافات و ادعاهای عجیب بدون آزمون سخت‌گیرانه می‌شود.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q5`,
        type: 'match_pairs',
        title: 'تطبیق جفت‌ها: مهارت‌های تفکر انتقادی',
        text: 'هر مهارت تفکر انتقادی را با توضیح آن تطبیق بده:',
        matchPairs: [
          { id: 'p1', left: 'بررسی سوگیری', right: 'شناسایی منافع شخصی یا تعصبات پژوهشگر' },
          { id: 'p2', left: 'تفکیک همبستگی از علیت', right: 'همزمانی دو پدیده دلیل علت بودن یکی برای دیگری نیست' },
          { id: 'p3', left: 'جستجوی تبیین‌های بدیل', right: 'بررسی اینکه آیا فرضیه ساده‌تری وجود دارد' },
          { id: 'p4', left: 'تکرارپذیری آزمایش', right: 'به دست آمدن همان نتیجه توسط دانشمندان مستقل' },
        ],
        correctAnswer: 'matched_all',
        explanation: 'چهار ستون استدلال انتقادی در ارزیابی ادعاهای روان‌شناختی.',
        difficulty: 'intermediate',
        points: 15,
      },
      {
        id: `${pId}-q6`,
        type: 'case_study',
        title: 'سناریوی ارزیابی ادعا: داروی معجزه‌آسای حافظه',
        text: 'یک آگهی مدعی است یک دمنوش گیاهی حافظه دانش‌آموزان را در ۲ روز ۳۰۰٪ افزایش می‌دهد. تفکر انتقادی چه واکنشی نشان می‌دهد؟',
        caseScenario: {
          clientProfile: 'والدینی نگران نمرات فرزندشان هستند و قصد دارند پس‌انداز خود را برای خرید بسته‌های میلیونی این دمنوش خرج کنند. تنها شواهد شرکت، پیام‌های تشکر چند کاربر در اینستاگرام است.',
          symptoms: ['ادعای بازدهی نجومی', 'تکیه بر شواهد نقلی شخصی', 'عدم وجود کارآزمایی بالینی دوسوکور', 'فقدان تاییدیه وزارت بهداشت'],
          diagnosticOptions: ['درخواست شواهد کارآزمایی بالینی دوسوکور و تکرارپذیر در مجلات معتبر', 'خرید فوری به دلیل نظرات مثبت اینستاگرام', 'باور کردن چون محصول گیاهی و بی‌ضرر است', 'توصیه به سایر دوستان'],
          therapeuticStep: 'محافظت از افراد در برابر کلاهبرداری‌های شبه‌علمی از طریق سواد پژوهشی.',
        },
        options: ['درخواست شواهد کارآزمایی بالینی دوسوکور و تکرارپذیر در مجلات معتبر', 'خرید فوری به دلیل نظرات مثبت اینستاگرام', 'باور کردن چون محصول گیاهی و بی‌ضرر است', 'توصیه به سایر دوستان'],
        correctAnswer: 0,
        explanation: 'شواهد حکایتی و نظرات افراد سند علمی نیستند؛ ادعا باید در کارآزمایی‌های کنترل‌شده با گروه دارونما اثبات شود.',
        difficulty: 'intermediate',
        points: 15,
      },
      {
        id: `${pId}-q7`,
        type: 'multiple_choice',
        title: 'مغالطه توسل به مرجعیت (Authority Bias)',
        text: 'اگر یک بازیگر مشهور ادعا کند روش خاصی از مراقبه تمام افسردگی‌ها را درمان می‌کند، خطای پذیرش آن چیست؟',
        options: [
          'مغالطه توسل به مرجعیت نامربوط بدون شواهد بالینی',
          'اثبات قطعی علمی با استناد به محبوبیت',
          'کاربرد صحیح نظریه شرطی‌سازی کلاسیک',
          'کشف رابطه علت و معلولی تجربی',
        ],
        correctAnswer: 0,
        explanation: 'شهرت یا تخصص فرد در حوزه‌ای نامربوط (سینما) اعتباری به ادعای تخصصی پزشکی و روانی او نمی‌بخشد.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q8`,
        type: 'true_false',
        title: 'درست یا غلط: سوگیری تأیید',
        text: 'سوگیری تأیید (Confirmation Bias) تمایل ذهن به جستجو و پذیرش شواهدی است که باورهای قبلی‌اش را تأیید می‌کنند.',
        correctAnswer: true,
        isTrue: true,
        explanation: 'درست است! انسان‌ها تمایل دارند شواهد مخالف باورهای خود را نادیده بگیرند؛ تفکر انتقادی با این سوگیری مبارزه می‌کند.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q9`,
        type: 'fill_blank',
        title: 'تکمیل مفهوم: تبیین‌های رقیب',
        text: 'یک متفکر انتقادی همواره می‌پرسد: «آیا تبیین ______ دیگری برای این رفتار وجود دارد؟»',
        correctAnswer: 'بدیل',
        options: ['بدیل', 'خیالی', 'قدیمی', 'عجیب'],
        blankContext: {
          before: 'یک متفکر انتقادی همواره می‌پرسد: «آیا تبیین ',
          after: ' دیگری برای این رفتار وجود دارد؟»',
        },
        explanation: 'جستجوی تبیین‌های بدیل (Alternative Explanations) مانع نتیجه‌گیری زودهنگام و نادرست می‌شود.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q10`,
        type: 'multiple_choice',
        title: 'نتیجه تفکر انتقادی در جامعه',
        text: 'دستاورد اصلی ترویج تفکر انتقادی در روان‌شناسی چیست؟',
        options: [
          'توانمندسازی جامعه برای تشخیص روان‌درمانی‌های موثر از ادعاهای گمراه‌کننده زرد',
          'افزایش پرخاشگری و ناتوانی در برقراری ارتباط',
          'حذف کامل احساسات و عواطف از زندگی روزمره',
          'وابستگی مطلق به حدس و گمان‌های غیرعلمی',
        ],
        correctAnswer: 0,
        explanation: 'تفکر انتقادی سلامت روانی و مالی افراد را در برابر شارلاتانیسم و توهم دانایی محافظت می‌کند.',
        difficulty: 'basic',
        points: 10,
      },
    ];
  }

  if (stageNumber === 4) {
    // Stage 4: Pop Psychology & Pseudoscience
    return [
      {
        id: `${pId}-q3`,
        type: 'true_false',
        title: 'درست یا غلط: اثر بارنوم (فورر)',
        text: 'اثر بارنوم (Barnum Effect) تمایل افراد به باور توصیف‌های شخصیتی مبهم و کلی به عنوان ویژگی‌های اختصاصی خودشان است.',
        correctAnswer: true,
        isTrue: true,
        explanation: 'کاملاً درست است! پایه‌ی موفقیت طالع‌بینی‌ها و تست‌های نامعتبر اینترنتی اثر بارنوم است.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q4`,
        type: 'fill_blank',
        title: 'تکمیل گزاره: روان‌شناسی زرد',
        text: 'روان‌شناسی زرد به جای تکیه بر پژوهش، راه‌حل‌های سریع، تضمینی و بدون ______ برای مشکلات پیچیده روانی ارائه می‌دهد.',
        correctAnswer: 'تلاش',
        options: ['تلاش', 'سود', 'کتاب', 'هزینه'],
        blankContext: {
          before: 'روان‌شناسی زرد به جای تکیه بر پژوهش، راه‌حل‌های سریع، تضمینی و بدون ',
          after: ' برای مشکلات پیچیده روانی ارائه می‌دهد.',
        },
        explanation: 'روان‌شناسی زرد با وعده ثروتمند شدن در ۳ روز یا درمان افسردگی با جملات انگیزشی افراد را فریب می‌دهد.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q5`,
        type: 'match_pairs',
        title: 'تطبیق جفت‌ها: شبه‌علم در برابر علم',
        text: 'شاخص‌ها را با حوزه مربوطه تطبیق بده:',
        matchPairs: [
          { id: 'p1', left: 'شبه‌علم', right: 'فرضیات غیرقابل ابطال و تکیه بر حکایات شخصی' },
          { id: 'p2', left: 'علم تجربی', right: 'داوری همتایان (Peer Review) و تکرارپذیری' },
          { id: 'p3', left: 'اثر بارنوم', right: 'پذیرش جملات کلی طالع‌بینی درباره خود' },
          { id: 'p4', left: 'روان‌شناسی زرد', right: 'ساده‌سازی افراطی مشکلات روانی با شعارهای انگیزشی' },
        ],
        correctAnswer: 'matched_all',
        explanation: 'جداسازی علمی بودن از جلوه‌های عوام‌فریبانه شبه‌علم.',
        difficulty: 'basic',
        points: 15,
      },
      {
        id: `${pId}-q6`,
        type: 'case_study',
        title: 'سناریوی شبه‌علم: تست شخصیت رنگ‌ها',
        text: 'در یک مصاحبه شغلی، کارفرما مدعی است بر اساس رنگ لباس متقاضی می‌تواند خائن یا وفادار بودن او را مشخص کند. این ادعا در کدام دسته است؟',
        caseScenario: {
          clientProfile: 'کارجویی متخصص در مصاحبه رد می‌شود چون طبق کتاب غیرعلمی کارفرما، رنگ آبی نشان‌دهنده عدم انعطاف‌پذیری است.',
          symptoms: ['نبود هرگونه روایی و پایایی روان‌سنجی', 'تصمیم‌گیری سرنوشت‌ساز بر پایه حدس', 'نبود مقالات در ژورنال‌های معتبر APA', 'استفاده از برچسب‌زنی'],
          diagnosticOptions: ['شبه‌علم محض و فاقد روایی سازه روان‌سنجی', 'روش استاندارد روان‌شناسی صنعتی و سازمانی', 'آزمون معتبر هوش هیجانی', 'رویکرد تجربی مبتنی بر عصب‌شناسی'],
          therapeuticStep: 'لزوم استفاده از ابزارهای دارای پایایی و روایی استاندارد مانند آزمون NEO یا مصاحبه رفتاری ساختاریافته.',
        },
        options: ['شبه‌علم محض و فاقد روایی سازه روان‌سنجی', 'روش استاندارد روان‌شناسی صنعتی و سازمانی', 'آزمون معتبر هوش هیجانی', 'رویکرد تجربی مبتنی بر عصب‌شناسی'],
        correctAnswer: 0,
        explanation: 'ارتباط دادن رنگ لباس با صفات شخصیتی پیچیده فاقد هرگونه سند تجربی است و مصداق شبه‌علم محسوب می‌شود.',
        difficulty: 'intermediate',
        points: 15,
      },
      {
        id: `${pId}-q7`,
        type: 'multiple_choice',
        title: 'خطر روان‌شناسی زرد برای بیماران',
        text: 'چرا ترویج شعارهای روان‌شناسی زرد مانند «فقط مثبت فکر کن تا شفا پیدا کنی» برای مراجعان افسرده خطرناک است؟',
        options: [
          'چون باعث احساس گناه ثانویه در بیمار شده و مراجعه به درمان‌های علمی موثر را به تاخیر می‌اندازد',
          'چون هزینه کتاب‌های انگیزشی کم است',
          'چون مثبت‌اندیشی همیشه باعث افزایش حافظه می‌شود',
          'چون مغز انسان به افکار منفی نیاز مطلق دارد',
        ],
        correctAnswer: 0,
        explanation: 'بیمار فکر می‌کند بیماری‌اش تقصیر خودش است و از دارودرمانی و روان‌درمانی استاندارد محروم می‌ماند.',
        difficulty: 'intermediate',
        points: 10,
      },
      {
        id: `${pId}-q8`,
        type: 'true_false',
        title: 'درست یا غلط: داوری همتایان',
        text: 'یکی از تفاوت‌های بزرگ علم با شبه‌علم این است که یافته‌های علمی باید از فیلتر داوری همتایان (Peer Review) عبور کنند.',
        correctAnswer: true,
        isTrue: true,
        explanation: 'درست است! دانشمندان دیگر مقالات را قبل از چاپ به دقت نقد و راستی‌آزمایی می‌کنند.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q9`,
        type: 'fill_blank',
        title: 'تکمیل مفهوم: زبان پیچیده‌نما',
        text: 'شبه‌علم اغلب از واژه‌های علمی مانند «کوانتوم» و «انرژی» برای فریب مخاطب و به شکل ______ استفاده می‌کند.',
        correctAnswer: 'گمراه‌کننده',
        options: ['گمراه‌کننده', 'دقیق', 'آزمایشگاهی', 'ریاضی'],
        blankContext: {
          before: 'شبه‌علم اغلب از واژه‌های علمی مانند «کوانتوم» و «انرژی» برای فریب مخاطب و به شکل ',
          after: ' استفاده می‌کند.',
        },
        explanation: 'شبه‌علم برای اینکه موجه به نظر برسد اصطلاحات پیچیده فیزیک را در بستری کاملاً بی‌ربط به کار می‌برد.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q10`,
        type: 'multiple_choice',
        title: 'سنگ محک تمایز علم از شبه‌علم',
        text: 'کدام فیلسوف علم معیار «ابطال‌پذیری» را به عنوان مهم‌ترین ابزار تمایز علم از شبه‌علم تدوین کرد؟',
        options: [
          'کارل پوپر (Karl Popper)',
          'ارسطو',
          'زیگموند فروید',
          'ادوارد تیچنر',
        ],
        correctAnswer: 0,
        explanation: 'کارل پوپر نشان داد علمی بودن به این است که بتوان شرایطی را تعیین کرد که اگر رخ دهند، نظریه باطل شود.',
        difficulty: 'basic',
        points: 10,
      },
    ];
  }

  if (stageNumber === 5) {
    // Stage 5: Animism & Pre-scientific Roots
    return [
      {
        id: `${pId}-q3`,
        type: 'true_false',
        title: 'درست یا غلط: درمان با ترپاناسیون',
        text: 'انسان‌های اولیه با ایجاد حفره در جمجمه قصد داشتند جریان خون مغز را تنظیم کنند.',
        correctAnswer: false,
        isTrue: false,
        explanation: 'نادرست است! هدف ترپاناسیون فراری دادن ارواح خبیثه و شیاطین تسخیرکننده بدن بود نه دلایل پزشکی مدرن.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q4`,
        type: 'fill_blank',
        title: 'تکمیل گزاره: باور جاندارپنداری',
        text: 'در دوران باستان، باور به اینکه تمام پدیده‌های طبیعی و رفتارها دارای روح هستند ______ نامیده می‌شد.',
        correctAnswer: 'آنیمیسم',
        options: ['آنیمیسم', 'ماتریالیسم', 'رفتارگرایی', 'پراگماتیسم'],
        blankContext: {
          before: 'در دوران باستان، باور به اینکه تمام پدیده‌های طبیعی و رفتارها دارای روح هستند ',
          after: ' نامیده می‌شد.',
        },
        explanation: 'آنیمیسم (Animism) نخستین تلاش اسطوره‌ای بشر برای توضیح جهان پیرامون بود.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q5`,
        type: 'match_pairs',
        title: 'تطبیق جفت‌ها: باورهای کهن و تحول شناخت',
        text: 'دوران تاریخی را به رویکرد تبیین رفتار متصل کن:',
        matchPairs: [
          { id: 'p1', left: 'دوران پیشاتاریخ', right: 'آنیمیسم و حلول ارواح و شیاطین' },
          { id: 'p2', left: 'یونان باستان (بقراط)', right: 'اخلاط چهارگانه و علل طبیعی بدنی' },
          { id: 'p3', left: 'قرون وسطی اروپا', right: 'بازگشت به جن‌گیری و جادوگری' },
          { id: 'p4', left: 'عصر روشنگری', right: 'عقل‌گرایی و ریشه‌های علم تجربی' },
        ],
        correctAnswer: 'matched_all',
        explanation: 'سیر تحول نگرش بشر به اختلالات روانی از خرافه تا تبیین‌های زیستی.',
        difficulty: 'basic',
        points: 15,
      },
      {
        id: `${pId}-q6`,
        type: 'case_study',
        title: 'سناریوی باستان‌شناسی: کشف جمجمه در پرو',
        text: 'باستان‌شناسان جمجمه‌ای ۵۰۰۰ ساله با سوراخی گرد در استخوان آهیانه پیدا کرده‌اند که بافت استخوانی اطرافش التیام یافته است. این نشانه چیست؟',
        caseScenario: {
          clientProfile: 'جمجمه متعلق به بیماری است که احتمالاً دچار تشنج یا هذیان بوده و عمل ترپاناسیون روی او انجام شده است.',
          symptoms: ['سوراخ مهندسی‌شده در استخوان آهیانه', 'رشد مجدد لایه‌های استخوان (التیام)', 'عدم وجود علائم شکستگی ناشی از جنگ'],
          diagnosticOptions: ['بیمار از عمل جراحی ترپاناسیون جان سالم به در برده و مدتی زنده مانده است', 'فرد در جنگ کشته شده است', 'جمجمه پس از مرگ سوراخ شده است', 'بیمار به طور معجزه‌آسا به پزشک مدرن دسترسی داشته است'],
          therapeuticStep: 'درک اینکه جراحی‌های باستانی روی افراد زنده و برای اخراج شیاطین انجام می‌شد.',
        },
        options: ['بیمار از عمل جراحی ترپاناسیون جان سالم به در برده و مدتی زنده مانده است', 'فرد در جنگ کشته شده است', 'جمجمه پس از مرگ سوراخ شده است', 'بیمار به طور معجزه‌آسا به پزشک مدرن دسترسی داشته است'],
        correctAnswer: 0,
        explanation: 'التیام استخوان ثابت می‌کند عمل روی فرد زنده انجام شده و او ماه‌ها پس از سوراخ کردن جمجمه زنده مانده است.',
        difficulty: 'intermediate',
        points: 15,
      },
      {
        id: `${pId}-q7`,
        type: 'multiple_choice',
        title: 'نقش بقراط در خروج از آنیمیسم',
        text: 'بقراط (پدر طب) چه گام انقلابی در برابر باورهای آنیمیستی برداشت؟',
        options: [
          'اعلام کرد بیماری‌های روانی منشأ طبیعی در مغز دارند نه لعنت خدایان و شیاطین',
          'دستور سوزاندن تمام کتاب‌های پزشکی را داد',
          'روان‌درمانی به روش تحلیل رویا را ابداع کرد',
          'ادعا کرد جن‌گیری تنها راه نجات انسان است',
        ],
        correctAnswer: 0,
        explanation: 'بقراط بیماری صرع (که بیماری مقدس نامیده می‌شد) را ناشی از آسیب مغزی دانست نه تسخیر توسط ارواح.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q8`,
        type: 'true_false',
        title: 'درست یا غلط: جن‌گیری در قرون وسطی',
        text: 'در اروپای قرون وسطی، افراد مبتلا به اسکیزوفرنی و توهم اغلب به عنوان جادوگر سوزانده یا شکنجه می‌شدند.',
        correctAnswer: true,
        isTrue: true,
        explanation: 'درست است! با پسرفت تفکر علمی، رفتارهای نامتعارف دوباره به عنوان تسخیر شیطانی تعبیر شد.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q9`,
        type: 'fill_blank',
        title: 'تکمیل مفهوم: ترپاناسیون',
        text: 'عمل سوراخ کردن استخوان جمجمه در دوران کهن در اصطلاح علمی پزشکی ______ نامیده می‌شود.',
        correctAnswer: 'ترپاناسیون',
        options: ['ترپاناسیون', 'لوبوتومی', 'الکتروشوک', 'آنژیوگرافی'],
        blankContext: {
          before: 'عمل سوراخ کردن استخوان جمجمه در دوران کهن در اصطلاح علمی پزشکی ',
          after: ' نامیده می‌شود.',
        },
        explanation: 'ترپاناسیون (Trepanation) یکی از قدیمی‌ترین اقدامات جراحی ثبت‌شده در تاریخ باستان‌شناسی است.',
        difficulty: 'basic',
        points: 10,
      },
      {
        id: `${pId}-q10`,
        type: 'multiple_choice',
        title: 'درس بزرگ روان‌شناسی از تاریخ پیشاعلمی',
        text: 'چرا روان‌شناسی علمی بر متدولوژی تجربی و رد تبیین‌های ماورایی اصرار می‌ورزد؟',
        options: [
          'چون بازگشت به تبیین‌های خرافی در طول تاریخ به قربانی شدن و شکنجه بیماران روانی انجامیده است',
          'چون تجهیزات پزشکی گران‌قیمت هستند',
          'چون انسان‌های اولیه هوش بالاتری داشتند',
          'چون دانشمندان با تاریخ مخالف هستند',
        ],
        correctAnswer: 0,
        explanation: 'نگاه علمی و زیستی به روان، بیماران را از برچسب تسخیر شیطانی رهانید و مسیر درمان انسانی را باز کرد.',
        difficulty: 'intermediate',
        points: 10,
      },
    ];
  }

  // Stages 6 to 10 and general generator
  return generateCurriculumPack(stageNumber, bp);
}

/**
 * Universal curriculum pack builder for Stages 6-100:
 * Guarantees 10 to 12 questions per stage covering curriculum units with rich mixed types.
 */
function generateCurriculumPack(stageNumber: number, bp: BlueprintForBuilder): Question[] {
  const pId = `s1-stage-${stageNumber}`;
  const unit = bp.unitIndex;
  const questions: Question[] = [];

  // Question 3: True / False tailored to unit concepts
  questions.push({
    id: `${pId}-q3`,
    type: 'true_false',
    title: `درست یا غلط: مبانی مفهومی گام ${stageNumber}`,
    text: getUnitTrueFalsePrompt(stageNumber, bp),
    correctAnswer: stageNumber % 2 === 0,
    isTrue: stageNumber % 2 === 0,
    explanation:
      stageNumber % 2 === 0
        ? `این گزاره کاملاً درست است. نکته کلیدی: ${bp.keyTakeaway}`
        : `این گزاره نادرست است. در روش‌شناسی علمی روان‌شناسی، گزاره‌ها بدون آزمون تجربی و شواهد کنترل‌شده پذیرفته نمی‌شوند. (${bp.keyTakeaway})`,
    difficulty: 'basic',
    points: 10,
  });

  // Question 4: Word Bank chip fill in the blank
  const blankWord = extractTargetKeyword(bp);
  const distractorPool = ['فرآیند ذهنی', 'رفتار آشکار', 'تجربه زیسته', 'انطباق فرگشتی', 'ساختار شناختی'];
  const uniqueDistractors = distractorPool.filter((w) => w !== blankWord).slice(0, 3);
  const fillOptions = [blankWord, ...uniqueDistractors].sort(() => 0.5 - Math.random());
  questions.push({
    id: `${pId}-q4`,
    type: 'fill_blank',
    title: `تکمیل گزاره: کلیدواژه بنیادین`,
    text: `در مبحث «${bp.title}»، مفهوم محوری مرتبط با ساختار نظریه عبارت است از ______ .`,
    correctAnswer: blankWord,
    options: fillOptions,
    blankContext: {
      before: `در مبحث «${bp.title}»، مفهوم محوری مرتبط با ساختار نظریه عبارت است از `,
      after: ' .',
    },
    explanation: bp.keyTakeaway,
    difficulty: 'basic',
    points: 10,
  });

  // Question 5: Match pairs connecting 4 core concepts
  questions.push({
    id: `${pId}-q5`,
    type: 'match_pairs',
    title: `تطبیق جفت‌ها: مفاهیم کلیدی ${bp.title}`,
    text: 'جفت‌های مفهومی مرتبط را به یکدیگر وصل کنید:',
    matchPairs: getUnitMatchPairs(stageNumber, bp),
    correctAnswer: 'matched_all',
    explanation: `ارتباط مفاهیم اساسی در ساختار علمی ${bp.title}.`,
    difficulty: 'intermediate',
    points: 15,
  });

  // Question 6: Clinical or Experimental Case Study
  questions.push({
    id: `${pId}-q6`,
    type: 'case_study',
    title: `تحلیل موقعیت و کاربست: ${bp.title}`,
    text: `در چارچوب ${bp.title}، کدام تحلیل یا تصمیم‌گیری پژوهشی علمی‌ترین رویکرد است؟`,
    caseScenario: {
      clientProfile: `پژوهشگری در حال ارزیابی متغیرهای مرتبط با «${bp.title}» در یک جامعه آماری است و نیاز به سنجش فرضیات دارد.`,
      symptoms: [`متغیرهای کلیدی: ${bp.title}`, `هدف: اثبات تجربی فرضیه`, 'روش: مطالعه استاندارد روان‌شناختی'],
      diagnosticOptions: [
        `اجرای طرح استاندارد با کنترل متغیرهای مخدوش‌کننده بر مبنای اصل ${bp.title}`,
        'تکیه بر مصاحبه‌های غیرساختاریافته و تجربیات شخصی تصادفی',
        'نادیده گرفتن خطاهای احتمالی نمونه‌گیری',
        'تغییر فرضیه پس از مشاهده داده‌ها بدون گزارش علمی',
      ],
      therapeuticStep: `پایبندی به موازین اخلاقی و روش‌شناختی علم روان‌شناسی.`,
    },
    options: [
      `اجرای طرح استاندارد با کنترل متغیرهای مخدوش‌کننده بر مبنای اصل ${bp.title}`,
      'تکیه بر مصاحبه‌های غیرساختاریافته و تجربیات شخصی تصادفی',
      'نادیده گرفتن خطاهای احتمالی نمونه‌گیری',
      'تغییر فرضیه پس از مشاهده داده‌ها بدون گزارش علمی',
    ],
    correctAnswer: 0,
    explanation: `طراحی روش‌مند و کنترل دقیق متغیرها لازمه بررسی علمی در حوزه ${bp.title} است.`,
    difficulty: 'intermediate',
    points: 15,
  });

  // Question 7: Analytical Multiple Choice
  questions.push({
    id: `${pId}-q7`,
    type: 'multiple_choice',
    title: `تحلیل انتقادی: ${bp.title}`,
    text: `کدام مورد نقد یا چالش متدولوژیک اصلی در حیطه «${bp.title}» را به درستی بیان می‌کند؟`,
    options: [
      `نیاز به سنجش تکرارپذیر و تفکیک شواهد تجربی از سوگیری‌های پژوهشگر`,
      'غیرممکن بودن هرگونه آزمایش تجربی در این حیطه',
      'کافی دانستن نظرات شخصی دانشمندان بدون نیاز به داده',
      'بی‌فایده بودن مفاهیم این مبحث در روان‌شناسی معاصر',
    ],
    correctAnswer: 0,
    explanation: bp.keyTakeaway,
    difficulty: 'intermediate',
    points: 10,
  });

  // Question 8: Secondary True / False Challenge
  questions.push({
    id: `${pId}-q8`,
    type: 'true_false',
    title: `درست یا غلط: کاربرد بالینی و نظری`,
    text: `یافته‌های مرتبط با «${bp.title}» در روان‌شناسی امروز به عنوان بخشی از مدل چندعاملی (زیستی-روانی-اجتماعی) ادغام شده‌اند.`,
    correctAnswer: true,
    isTrue: true,
    explanation: 'روان‌شناسی مدرن نگرش تلفیقی دارد و دستاوردهای تاریخی و روش‌شناختی معتبر را در مدل‌های جامع ترکیب می‌کند.',
    difficulty: 'basic',
    points: 10,
  });

  // Question 9: Secondary Word Bank Completion
  questions.push({
    id: `${pId}-q9`,
    type: 'fill_blank',
    title: `تکمیل اصل علمی`,
    text: `در روان‌شناسی علمی، هر نظریه باید توانایی تبیین و ______ رفتار در موقعیت‌های مشابه را داشته باشد.`,
    correctAnswer: 'پیش‌بینی',
    options: ['پیش‌بینی', 'توجیه خیالی', 'حدس تصادفی', 'فراموشی'],
    blankContext: {
      before: 'در روان‌شناسی علمی، هر نظریه باید توانایی تبیین و ',
      after: ' رفتار در موقعیت‌های مشابه را داشته باشد.',
    },
    explanation: 'پیش‌بینی‌پذیری یکی از مهم‌ترین محک‌های اعتبار یک نظریه در علم تجربی است.',
    difficulty: 'basic',
    points: 10,
  });

  // Question 10: Master Synthesis Multiple Choice
  questions.push({
    id: `${pId}-q10`,
    type: 'multiple_choice',
    title: `تسلط بر مبحث مرحله ${stageNumber}: ${bp.title}`,
    text: `پیام و دستاورد کلیدی مرحله «${bp.title}» برای درک کلی از علم روان‌شناسی چیست؟`,
    options: [
      bp.keyTakeaway,
      'کنار گذاشتن تمام شواهد فیزیولوژیک و عصب‌شناختی',
      'پذیرش بدون چون‌وچرای ادعاهای شبه‌علمی در زندگی روزمره',
      'بی‌اعتباری کامل تمام مطالعات آزمایشگاهی قرن بیستم',
    ],
    correctAnswer: 0,
    explanation: `مهم‌ترین نکته این مرحله: ${bp.keyTakeaway}`,
    difficulty: 'advanced',
    points: 15,
  });

  return questions;
}

function getUnitTrueFalsePrompt(stageNumber: number, bp: BlueprintForBuilder): string {
  if (bp.unitIndex === 1) {
    return stageNumber % 2 === 0
      ? `در مبحث «${bp.title}»، تمایز میان پدیده‌های مشاهده‌پذیر و فرآیندهای استنباطی پایه و اساس سنجش تجربی است.`
      : `در مبحث «${bp.title}»، ادعاهای تجربی بدون نیاز به گروه گواه و تکرارپذیری مورد پذیرش قرار می‌گیرند.`;
  }
  if (bp.unitIndex === 2) {
    return stageNumber % 2 === 0
      ? `طبق اصول معرفت‌شناسی در «${bp.title}»، یک گزاره برای علمی بودن باید دارای پتانسیل ابطال‌پذیری باشد.`
      : `در فلسفه علم، نظریاتی که همه چیز را توجیه می‌کنند بالاترین دقت پیش‌بینی ریاضی را دارند.`;
  }
  if (bp.unitIndex === 3) {
    return stageNumber % 2 === 0
      ? `تأسیس آزمایشگاه لایپزیگ توسط وونت در ۱۸۷۹ روان‌شناسی را از فلسفه جدا و به علمی تجربی بدل ساخت.`
      : `روش درون‌نگری تیچنر توانست تمامی ابهامات ادراک را بدون ایجاد هرگونه اختلاف نظر بین آزمایشگاه‌ها حل کند.`;
  }
  if (bp.unitIndex === 4) {
    return stageNumber % 2 === 0
      ? `مکاتب بزرگ روان‌شناسی هر یک جنبه‌ای از وجود انسان (رفتار، ناهشیار، کل ادراکی، شناخت) را برجسته ساختند.`
      : `اسکینر و رفتارگرایان وجود سیستم عصبی و مغز را در ارگانیسم‌های زنده انکار می‌کردند.`;
  }
  // Unit 5
  return stageNumber % 2 === 0
    ? `در پژوهش‌های روان‌شناختی، تنها روش آزمایشی با دستکاری متغیر مستقل توانایی اثبات رابطه علیت را دارد.`
    : `همبستگی مثبت قوی بین دو متغیر نشان‌دهنده این است که متغیر اول قطعاً علت متغیر دوم است.`;
}

function extractTargetKeyword(bp: BlueprintForBuilder): string {
  const title = bp.title;
  if (title.includes('فرگشت') || title.includes('انطباق')) return 'انطباق';
  if (title.includes('شناخت') || title.includes('پردازش')) return 'پردازش';
  if (title.includes('ناخودآگاه') || title.includes('فروید')) return 'ناهشیار';
  if (title.includes('رفتار') || title.includes('اسکینر')) return 'تقویت';
  if (title.includes('همبستگی')) return 'همبستگی';
  if (title.includes('آزمایش') || title.includes('مستقل')) return 'متغیر مستقل';
  if (title.includes('پایایی')) return 'همسانی';
  if (title.includes('روایی')) return 'اعتبار';
  if (title.includes('اخلاق') || title.includes('رضایت')) return 'رضایت آگاهانه';
  if (title.includes('وونت') || title.includes('لایپزیگ')) return 'درون‌نگری';
  if (title.includes('دکارت')) return 'دوگانه‌انگاری';
  if (title.includes('لاک')) return 'لوح سپید';
  if (title.includes('افلاطون')) return 'خردگرایی';
  if (title.includes('ارسطو')) return 'تجربه‌گرایی';
  if (title.includes('پوپر')) return 'ابطال‌پذیری';
  return 'فرآیند ذهنی';
}

function getUnitMatchPairs(stageNumber: number, bp: BlueprintForBuilder): { id: string; left: string; right: string }[] {
  if (bp.unitIndex === 1) {
    return [
      { id: 'p1', left: 'رفتار آشکار', right: 'کنش‌های فیزیکی قابل ثبت مستقیم' },
      { id: 'p2', left: 'فرآیند ذهنی', right: 'ادراک، تفکر و خاطرات درونی' },
      { id: 'p3', left: 'شبه‌علم', right: 'ادعاهای فاقد ابطال‌پذیری تجربی' },
      { id: 'p4', left: 'تفکر انتقادی', right: 'ارزیابی شواهد و پرسشگری روش‌مند' },
    ];
  }
  if (bp.unitIndex === 2) {
    return [
      { id: 'p1', left: 'ابطال‌پذیری پوپر', right: 'معیار تمایز علم از شبه‌علم' },
      { id: 'p2', left: 'پارادایم کوهن', right: 'چارچوب مسلط نظری در یک عصر' },
      { id: 'p3', left: 'مسئله ذهن-بدن', right: 'رابطه هشیاری با فیزیولوژی مغز' },
      { id: 'p4', left: 'تیغ اوکام', right: 'ترجیح تبیین ساده‌تر با مفروضات کمتر' },
    ];
  }
  if (bp.unitIndex === 3) {
    return [
      { id: 'p1', left: 'ویلهلم وونت', right: 'آزمایشگاه لایپزیگ ۱۸۷۹ و زمان واکنش' },
      { id: 'p2', left: 'ادوارد تیچنر', right: 'ساخت‌گرایی و تجزیه عناصر هشیاری' },
      { id: 'p3', left: 'درون‌نگری تجربی', right: 'گزارش هشیارانه از محرک‌های حسی' },
      { id: 'p4', left: 'بحران روش‌شناسی', right: 'عدم تکرارپذیری درون‌نگری در آزمایشگاه‌ها' },
    ];
  }
  if (bp.unitIndex === 4) {
    return [
      { id: 'p1', left: 'ویلیام جیمز', right: 'کارکردگرایی و جریان سیال ذهن' },
      { id: 'p2', left: 'زیگموند فروید', right: 'روان‌کاوی و انگیزش ناهشیار' },
      { id: 'p3', left: 'جان واتسون', right: 'مانیفست رفتارگرایی و نفی ذهن' },
      { id: 'p4', left: 'مکتب گشتالت', right: 'کل بزرگتر از مجموع اجزاست' },
    ];
  }
  // Unit 5
  return [
    { id: 'p1', left: 'متغیر مستقل (IV)', right: 'عاملی که پژوهشگر دستکاری می‌کند' },
    { id: 'p2', left: 'متغیر وابسته (DV)', right: 'پاسخی که در آزمایش اندازه گرفته می‌شود' },
    { id: 'p3', left: 'گمارش تصادفی', right: 'توزیع یکسان تفاوت‌های فردی در گروه‌ها' },
    { id: 'p4', left: 'پایایی ابزار', right: 'تکرارپذیری و همسانی نمرات در آزمون' },
  ];
}
