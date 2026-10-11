export type BadgeCategory = 'modules' | 'quizzes' | 'streaks_study' | 'mastery';

export type BadgeIconType =
  | 'foundations'
  | 'neuroscience'
  | 'cognition'
  | 'pathology'
  | 'clinical'
  | 'grandmaster'
  | 'first_quiz'
  | 'sharpshooter'
  | 'match_master'
  | 'quiz_specialist'
  | 'speed_demon'
  | 'wildfire'
  | 'notes_master'
  | 'diamond_champ';

export interface BadgeDefinition {
  id: string;
  title: string;
  englishTitle: string;
  description: string;
  category: BadgeCategory;
  iconType: BadgeIconType;
  accentColor: string; // hex or duolingo brand color
  xpReward: number;
  targetCount: number;
  unitLabel: string;
  moduleSectionId?: number; // for module completion badges
}

export interface BadgeProgressInfo {
  badge: BadgeDefinition;
  isUnlocked: boolean;
  currentValue: number;
  targetValue: number;
  progressPercent: number; // 0 to 100
  unlockedDate?: string;
  tier: 1 | 2 | 3;
}
