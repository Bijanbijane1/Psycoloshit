export type DifficultyLevel = 'basic' | 'intermediate' | 'advanced';

export type LearningDisciplineId =
  | 'psychology'
  | 'sociology'
  | 'law'
  | 'art'
  | 'philosophy'
  | 'entrance_exam'
  | 'politics';

export interface LearningDisciplineDefinition {
  id: LearningDisciplineId;
  label: string;
  englishLabel: string;
  deskTitle: string;
  subtitle: string;
  upcomingSummary: string;
  iconName:
    | 'brain'
    | 'users'
    | 'scale'
    | 'palette'
    | 'book-open'
    | 'graduation-cap'
    | 'landmark';
  hasCurriculum: boolean;
  palette: {
    activeBg: string;
    activeText: string;
    activeBorder: string;
    badgeBg: string;
    iconColor: string;
  };
}

export type QuestionType =
  | 'multiple_choice'
  | 'fill_blank'
  | 'case_study'
  | 'match_pairs'
  | 'sentence_order'
  | 'true_false';

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  text: string;
  options?: string[]; // for multiple choice
  correctAnswer: number | string | boolean; // index for multiple choice, exact or matching word for fill_blank, or bool
  blankContext?: { before: string; after: string }; // for fill_blank
  caseScenario?: {
    clientProfile: string;
    symptoms: string[];
    diagnosticOptions: string[];
    therapeuticStep: string;
  };
  matchPairs?: { id: string; left: string; right: string }[]; // for match_pairs
  sentenceTokens?: string[]; // for sentence_order (pool of chips)
  correctSentence?: string; // for sentence_order
  isTrue?: boolean; // for true_false
  explanation: string;
  difficulty: DifficultyLevel;
  points: number;
}

export interface Flashcard {
  id: string;
  term: string;
  englishTerm?: string;
  definition: string;
  example?: string;
}

export interface AcademicSource {
  id: string;
  citationAPA: string;
  bookOrJournal: string;
  authors: string;
  year: string;
  editionOrVolume?: string;
  publisher?: string;
  chapterOrPages?: string;
  doiOrUrl?: string;
  type: 'book' | 'handbook' | 'dsm' | 'journal' | 'meta-analysis';
}

export interface SubtopicDetail {
  title: string;
  academicText: string;
  simplifiedText: string;
}

export interface Chapter {
  id: string;
  sectionId: number;
  chapterNumber: string;
  title: string;
  englishTitle: string;
  subtopics: string[];
  subtopicDetails?: SubtopicDetail[];
  academicText: string;
  simplifiedText: string;
  keyPoints: string[];
  flashcards: Flashcard[];
  questions: Question[];
  difficulty: DifficultyLevel;
  estimatedMinutes: number;
  sources?: AcademicSource[];
}

export interface Section {
  id: number;
  title: string;
  subTitle: string;
  description: string;
  iconName: string;
  color: {
    bg: string;
    text: string;
    border: string;
    accent: string;
    badge: string;
  };
  chapters: Chapter[];
}

export type StageType = 'normal' | 'checkpoint' | 'boss' | 'chest' | 'speed_round';

export interface DuolingoStage {
  id: string; // e.g. "s1-stage-1"
  stageNumber: number; // 1 to 100
  sectionId: number; // 1
  chapterId: string; // "ch-1", "ch-2", etc.
  unitIndex: number; // 1 to 5
  unitTitle: string;
  title: string;
  englishTitle: string;
  description: string;
  keyTakeaway: string;
  type: StageType;
  xpReward: number;
  questions: Question[];
}

export interface StageCompletionRecord {
  stageNumber: number;
  completedAt: string;
  stars: number; // 1 to 3
  score: number;
  totalQuestions: number;
  xpEarned: number;
  verified?: boolean;
  source?: 'online-verified' | 'offline-local';
  stageAnswers?: Record<string, unknown>;
}

export interface UserProgress {
  completedChapters: string[]; // chapter ids
  bookmarkedChapters: string[];
  chapterNotes: Record<string, string>; // chapterId -> note text
  quizHistory: {
    chapterId: string;
    questionId: string;
    isCorrect: boolean;
    userAnswer: any;
    timestamp: number;
    timeSpentSeconds: number;
    difficulty: DifficultyLevel;
  }[];
  streakDays: number;
  lastStudyDate: string;
  totalStudyMinutes: number;
  pinnedChapters: string[];
  unlockedBadgeIds?: string[];
  claimedBadgeIds?: string[];
  rewardedChapterIds?: string[]; // chapter ids that have already granted their one-time completion XP
  diamonds?: number; // User diamond currency balance (default 480)
  totalXp?: number; // Authoritative cumulative XP persisted locally
  dailyXp?: number; // XP earned on dailyMissionDate
  dailyTargetXp?: number; // Daily XP mission goal (default 50)
  dailyMissionDate?: string; // ISO date string (YYYY-MM-DD) for daily mission tracking
  dailyMissionCompleted?: boolean; // Whether the daily XP mission has been completed today
  pomodoroHistory?: {
    id: string;
    chapterId: string;
    minutes: number;
    xpEarned?: number;
    completedAt: string;
  }[];
  // 100-Stage Duolingo System
  completedStages?: Record<number, StageCompletionRecord>; // stageNumber -> record
  claimedStageChests?: number[]; // milestone stage numbers claimed
  unlockedStageNumber?: number; // max unlocked stage number (at least 1)
  chapterStudyTime?: Record<string, number>; // chapterId -> focused seconds
  totalPomodoroSessionsCompleted?: number;
  customSettings: {
    fontSize: 'sm' | 'md' | 'lg' | 'xl';
    readingTheme: 'light' | 'dark' | 'sepia' | 'emerald';
    autoAdaptiveDifficulty: boolean;
    preferredDifficulty: DifficultyLevel;
    soundEnabled: boolean;
  };
}

export interface SupportTicket {
  id: string;
  chapterId?: string;
  title: string;
  question: string;
  reply?: string;
  status: 'pending' | 'answered';
  date: string;
}
