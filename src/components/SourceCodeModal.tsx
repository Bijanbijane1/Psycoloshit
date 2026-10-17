import React, { useState, useEffect } from 'react';
import {
  X,
  Code2,
  Copy,
  Check,
  Download,
  FileCode,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { DuoMascot } from './DuoMascot';
import { playDuoSound } from '../utils/duoAudio';

interface SourceFileOption {
  id: string;
  name: string;
  path: string;
  description: string;
  category: 'badges' | 'curriculum' | 'quizzes' | 'core';
  language: string;
  content: string;
}

// Key source files embedded for instantaneous preview, copy, and download
const SOURCE_FILES: SourceFileOption[] = [
  {
    id: 'badges-view',
    name: 'BadgesView.tsx',
    path: 'src/components/BadgesView.tsx',
    description: 'تالار مدال‌ها و افتخارات سه‌بعدی با فیلتر دسته‌بندی و رهگیری پیشرفت',
    category: 'badges',
    language: 'typescript',
    content: `import React, { useState, useMemo } from 'react';
import { Section, Chapter, UserProgress } from '../types/psychology';
import { BadgeDefinition, BadgeProgressInfo, BadgeCategory } from '../types/badges';
import { BADGE_DEFINITIONS, evaluateBadgeProgress } from '../data/badgeDefinitions';
import { BadgeIcon } from './BadgeIcon';
import { DuoMascot } from './DuoMascot';
import { playDuoSound } from '../utils/duoAudio';
import {
  Award,
  Sparkles,
  Lock,
  CheckCircle2,
  Flame,
  Zap,
  Crown,
  BookOpen,
  Filter,
  Trophy,
} from 'lucide-react';

interface BadgesViewProps {
  sections: Section[];
  progress: UserProgress;
  onSelectChapter?: (chapter: Chapter) => void;
  onStartQuiz?: (chapter: Chapter) => void;
}

export const BadgesView: React.FC<BadgesViewProps> = ({
  sections,
  progress,
  onSelectChapter,
  onStartQuiz,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<BadgeCategory | 'all'>('all');
  const [selectedBadge, setSelectedBadge] = useState<BadgeProgressInfo | null>(null);

  // Evaluate all badges against user's progress
  const evaluatedBadges: BadgeProgressInfo[] = useMemo(() => {
    return BADGE_DEFINITIONS.map((badge) =>
      evaluateBadgeProgress(badge, progress, sections)
    );
  }, [progress, sections]);

  const unlockedCount = evaluatedBadges.filter((b) => b.isUnlocked).length;
  const totalCount = evaluatedBadges.length;
  const completionPercentage = Math.round((unlockedCount / totalCount) * 100);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Hall of Fame Header & Level Stats */}
      <div className="bg-gradient-to-br from-[#58CC02] to-[#46A302] rounded-3xl p-6 sm:p-8 text-white border-2 border-b-6 border-[#337a01] shadow-md flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-right">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-black">
            <Trophy className="w-3.5 h-3.5 fill-[#FFC800] text-[#FFC800]" />
            ویترین دستاوردها و مدال‌های روان‌لینگو
          </span>
          <h1 className="text-2xl sm:text-3xl font-black">تالار افتخارات روان‌شناسی</h1>
          <p className="text-sm font-bold text-white/90">
            با تکمیل دروس، شرکت در کوئیزها و حفظ زنجیره مطالعه، مدال‌های نفیس سه‌بعدی آزاد کن!
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 text-center min-w-[180px]">
          <span className="text-xs font-black block text-white/80">مدال‌های کسب‌شده</span>
          <span className="text-3xl font-black">{unlockedCount} / {totalCount}</span>
          <span className="text-xs font-black block text-[#FFC800] mt-1">{completionPercentage}% تکمیل</span>
        </div>
      </div>
    </div>
  );
};`,
  },
  {
    id: 'badge-icon',
    name: 'BadgeIcon.tsx',
    path: 'src/components/BadgeIcon.tsx',
    description: 'کامپوننت آیکون مدال سه‌بعدی به سبک دوئولینگو با لایه‌های شیشه‌ای و متالیک',
    category: 'badges',
    language: 'typescript',
    content: `import React from 'react';
import { BadgeIconType } from '../types/badges';
import { Lock } from 'lucide-react';

interface BadgeIconProps {
  type: BadgeIconType;
  isUnlocked: boolean;
  size?: number;
  className?: string;
  tier?: 1 | 2 | 3;
}

export const BadgeIcon: React.FC<BadgeIconProps> = ({
  type,
  isUnlocked,
  size = 72,
  className = '',
  tier = 1,
}) => {
  // 3D Duolingo Medal Graphic with layered SVG bevels and vibrant metallic gradients
  return (
    <div
      style={{ width: size, height: size }}
      className={\`relative inline-flex items-center justify-center select-none transition-transform group-hover:scale-105 \${className}\`}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="drop-shadow-md overflow-visible"
      >
        <defs>
          <linearGradient id="goldMedal" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFDF00" />
            <stop offset="100%" stopColor="#D4AF37" />
          </linearGradient>
          <linearGradient id="silverMedal" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#E2E8F0" />
            <stop offset="100%" stopColor="#94A3B8" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r="42"
          fill={isUnlocked ? "url(#goldMedal)" : "#CBD5E1"}
          stroke={isUnlocked ? "#B45309" : "#64748B"}
          strokeWidth="4"
        />
      </svg>
      {!isUnlocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-full">
          <Lock className="w-5 h-5 text-white/90 drop-shadow" />
        </div>
      )}
    </div>
  );
};`,
  },
  {
    id: 'badge-definitions',
    name: 'badgeDefinitions.ts',
    path: 'src/data/badgeDefinitions.ts',
    description: 'تعاریف ساختاریافته مدال‌ها، شرایط آنلاک و موتور ارزیابی پیشرفت کاربر',
    category: 'badges',
    language: 'typescript',
    content: `import { BadgeDefinition, BadgeProgressInfo } from '../types/badges';
import { Section, UserProgress } from '../types/psychology';

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: 'foundations_master',
    title: 'معمار شالوده روان',
    englishTitle: 'Foundations Master',
    description: 'تکمیل تمامی مباحث فصل مبانی و تاریخچه روان‌شناسی',
    category: 'modules',
    iconType: 'foundations',
    tier: 1,
    maxRequirement: 1,
    targetSectionId: 1,
    xpReward: 100,
  },
  {
    id: 'quiz_sharpshooter',
    title: 'تک‌تیرانداز کوئیزها',
    englishTitle: 'Quiz Sharpshooter',
    description: 'پاسخ صحیح به ۲۰ سوال کوئیز بدون خطا',
    category: 'quizzes',
    iconType: 'sharpshooter',
    tier: 2,
    maxRequirement: 20,
    xpReward: 200,
  },
  {
    id: 'streak_legend',
    title: 'قهرمان استمرار',
    englishTitle: 'Streak Legend',
    description: 'ثبت ۷ روز مطالعه مداوم و حفظ آتش یادگیری',
    category: 'streaks_study',
    iconType: 'streak_master',
    tier: 3,
    maxRequirement: 7,
    xpReward: 250,
  },
];`,
  },
  {
    id: 'academic-sources',
    name: 'academicSources.ts',
    path: 'src/data/academicSources.ts',
    description: 'بانک جامع منابع، رفرنس‌ها و ارجاعات استاندارد APA برای سرفصل‌ها',
    category: 'curriculum',
    language: 'typescript',
    content: `import { AcademicSource } from '../types/psychology';

export const CHAPTER_ACADEMIC_SOURCES: Record<string, AcademicSource[]> = {
  'ch-1': [
    {
      id: 'src-1-1',
      citationAPA: 'Nolen-Hoeksema, S., et al. (2014). Atkinson & Hilgard\\'s Introduction to Psychology (16th ed.). Cengage Learning.',
      bookOrJournal: 'زمینه روان‌شناسی اتکینسون و هیلگارد',
      authors: 'سوزان نولن-هوکسما، باربارا فردریکسون، جفری لافتوس',
      year: '2014',
      editionOrVolume: 'ویرایش ۱۶',
      publisher: 'Cengage Learning / ترجمه رشد',
      chapterOrPages: 'فصل ۱: ماهیت روان‌شناسی',
      type: 'book',
    },
    {
      id: 'src-1-2',
      citationAPA: 'Schultz, D. P., & Schultz, S. E. (2016). A History of Modern Psychology (11th ed.). Cengage Learning.',
      bookOrJournal: 'تاریخ روان‌شناسی نوین',
      authors: 'دوان پی. شولتز و سیدنی آلن شولتز',
      year: '2016',
      editionOrVolume: 'ویرایش ۱۱',
      publisher: 'Cengage Learning / ترجمه دکتر سیف',
      type: 'book',
    },
  ],
};`,
  },
  {
    id: 'section-1-stages',
    name: 'section1Stages.ts',
    path: 'src/data/section1Stages.ts',
    description: 'دیتابیس ۱۰۰ مرحله زنجیره‌ای دولینگو برای بخش اول (مبانی و فلسفه روان‌شناسی)',
    category: 'curriculum',
    language: 'typescript',
    content: `// 100 Chained Duolingo Stages for Section 1 (Foundations & Epistemology)
import { DuolingoStage, Question } from '../types/psychology';

// Exports SECTION_1_STAGES (array of 100 stages), getUnlockedStageNumber, and isStageUnlocked
export const SECTION_1_STAGES: DuolingoStage[] = [...];

export function getUnlockedStageNumber(completedStages?: Record<number, any>): number {
  if (!completedStages || Object.keys(completedStages).length === 0) return 1;
  let next = 1;
  while (completedStages[next] !== undefined) next++;
  return Math.min(next, 100);
}

export function isStageUnlocked(stageNumber: number, completedStages?: Record<number, any>): boolean {
  if (stageNumber === 1) return true;
  return !!completedStages && !!completedStages[stageNumber - 1];
}`,
  },
  {
    id: 'duolingo-stage-modal',
    name: 'DuolingoStageModal.tsx',
    path: 'src/components/DuolingoStageModal.tsx',
    description: 'پنجره تعاملی کوئیز و یادگیری مراحل ۱ الی ۱۰۰ با فیدبک آنی، جان، ستاره و افکت صدا',
    category: 'quizzes',
    language: 'typescript',
    content: `import React, { useState } from 'react';
import { DuolingoStage, StageCompletionRecord } from '../types/psychology';

export const DuolingoStageModal: React.FC<DuolingoStageModalProps> = ({
  stage,
  isOpen,
  isLocked,
  previousStageNumber,
  onClose,
  onCompleteStage,
  onStartNextStage,
}) => {
  // If locked, renders lock barrier explaining prerequisite stage.
  // If unlocked, renders Duolingo question player with hearts, progress bar, audio, and victory celebration!
};`,
  },
];

interface SourceCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFileId?: string;
}

export const SourceCodeModal: React.FC<SourceCodeModalProps> = ({
  isOpen,
  onClose,
  initialFileId,
}) => {
  const [selectedFileId, setSelectedFileId] = useState<string>(
    initialFileId || 'badges-view'
  );
  const [isCopied, setIsCopied] = useState<boolean>(false);

  useEffect(() => {
    if (initialFileId) {
      setSelectedFileId(initialFileId);
    }
  }, [initialFileId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentFile =
    SOURCE_FILES.find((f) => f.id === selectedFileId) || SOURCE_FILES[0];

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(currentFile.content);
    setIsCopied(true);
    playDuoSound('click');
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownloadFile = () => {
    const blob = new Blob([currentFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = currentFile.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    playDuoSound('correct');
  };

  const lineCount = currentFile.content.split('\n').length;

  return (
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-2xs flex items-center justify-center p-2 sm:p-5 pb-safe animate-fadeIn select-none">
      <div className="bg-white border-2 border-b-6 border-slate-200 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-4xl max-h-[94dvh] flex flex-col overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="p-3.5 sm:p-5 border-b-2 border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-[#1CB0F6]/10 border border-[#1CB0F6]/20 flex items-center justify-center text-[#1CB0F6] shrink-0">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-slate-800">
                  سورس‌کد و ساختار فایل‌های پروژه
                </h3>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#E5F6FD] text-[#1CB0F6]">
                  Source Code Viewer
                </span>
              </div>
              <p className="text-[11px] sm:text-xs font-bold text-slate-400">
                مشاهده، بازرسی، کپی و دانلود سورس‌کدهای اصلی سامانه
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl cursor-pointer transition-colors min-w-[38px] min-h-[38px] flex items-center justify-center shrink-0"
            title="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* File Tabs */}
        <div className="px-4 py-2 border-b border-slate-200 bg-white flex items-center gap-2 overflow-x-auto text-xs font-black">
          {SOURCE_FILES.map((file) => {
            const isSelected = file.id === currentFile.id;
            return (
              <button
                key={file.id}
                onClick={() => {
                  setSelectedFileId(file.id);
                  playDuoSound('click');
                }}
                className={`px-3 py-2 rounded-xl flex items-center gap-2 whitespace-nowrap cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-[#1CB0F6] text-white border-b-3 border-[#1899D6] shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>{file.name}</span>
              </button>
            );
          })}
        </div>

        {/* File Meta & Action Toolbar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs font-bold">
          <div className="flex items-center gap-3 text-slate-600">
            <span className="font-mono text-[11px] text-slate-500 bg-white px-2 py-1 rounded-lg border border-slate-200">
              {currentFile.path}
            </span>
            <span className="text-slate-400">•</span>
            <span>{lineCount} خط کد</span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-500">{currentFile.description}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyCode}
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all ${
                isCopied
                  ? 'bg-[#58CC02] text-white border-b-2 border-[#46A302]'
                  : 'duo-btn-white'
              }`}
            >
              {isCopied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>کپی شد!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>کپی سورس کامل</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadFile}
              className="duo-btn-blue px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>دانلود فایل</span>
            </button>
          </div>
        </div>

        {/* Code Content with Line Numbers */}
        <div className="flex-1 overflow-auto bg-[#1E293B] text-slate-200 p-4 font-mono text-xs leading-relaxed dir-ltr text-left select-text">
          <pre className="overflow-x-auto">
            <code>
              {currentFile.content.split('\n').map((line, idx) => (
                <div key={idx} className="table-row hover:bg-slate-800/60">
                  <span className="table-cell select-none pr-4 text-slate-500 text-right w-10">
                    {idx + 1}
                  </span>
                  <span className="table-cell whitespace-pre">{line}</span>
                </div>
              ))}
            </code>
          </pre>
        </div>

        {/* Footer info */}
        <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-500">
          <div className="flex items-center gap-2">
            <DuoMascot mood="happy" size={28} animate={false} />
            <span>سورس‌کد تمیز، ماژولار و مبتنی بر استاندارد React و TypeScript</span>
          </div>
          <button
            onClick={onClose}
            className="duo-btn-green px-4 py-1.5 rounded-xl text-xs font-black cursor-pointer"
          >
            بستن پنجره
          </button>
        </div>
      </div>
    </div>
  );
};
