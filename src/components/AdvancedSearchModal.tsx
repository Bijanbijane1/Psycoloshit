import React, { useState, useMemo, useEffect } from 'react';
import { Section, Chapter, UserProgress } from '../types/psychology';
import { Search, X, BookOpen, Sparkles, ChevronLeft } from 'lucide-react';
import { DuoMascot } from './DuoMascot';
import { playDuoSound } from '../utils/duoAudio';
import { matchesNormalizedPersianQuery, normalizePersianSearchText } from '../utils/persianDigits';

export function searchCurriculumChapters(
  sections: Section[],
  rawQuery: string,
  options?: {
    sectionFilter?: number | 'all';
    chapterNotes?: Record<string, string>;
  }
): Chapter[] {
  const normalizedQuery = normalizePersianSearchText(rawQuery);
  if (!normalizedQuery) return [];

  const sectionFilter = options?.sectionFilter ?? 'all';
  const chapterNotes = options?.chapterNotes ?? {};
  const allChapters = (sections || []).flatMap((s) => s.chapters || []);

  return allChapters.filter((ch) => {
    if (sectionFilter !== 'all' && ch.sectionId !== sectionFilter) {
      return false;
    }

    if (
      matchesNormalizedPersianQuery(ch.title, rawQuery) ||
      matchesNormalizedPersianQuery(ch.englishTitle, rawQuery)
    ) {
      return true;
    }

    if ((ch.subtopics || []).some((st) => matchesNormalizedPersianQuery(st, rawQuery))) {
      return true;
    }

    if (
      matchesNormalizedPersianQuery(ch.academicText, rawQuery) ||
      matchesNormalizedPersianQuery(ch.simplifiedText, rawQuery)
    ) {
      return true;
    }

    if ((ch.keyPoints || []).some((kp) => matchesNormalizedPersianQuery(kp, rawQuery))) {
      return true;
    }

    const noteText = chapterNotes[ch.id] || '';
    if (noteText && matchesNormalizedPersianQuery(noteText, rawQuery)) {
      return true;
    }

    return false;
  });
}

interface AdvancedSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  sections: Section[];
  progress: UserProgress;
  onSelectChapter: (chapter: Chapter) => void;
}

export const AdvancedSearchModal: React.FC<AdvancedSearchModalProps> = ({
  isOpen,
  onClose,
  sections,
  progress,
  onSelectChapter,
}) => {
  const [query, setQuery] = useState<string>('');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<number | 'all'>('all');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const searchResults = useMemo(() => {
    return searchCurriculumChapters(sections, query, {
      sectionFilter: selectedSectionFilter,
      chapterNotes: progress.chapterNotes,
    });
  }, [query, selectedSectionFilter, sections, progress.chapterNotes]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-2.5 sm:p-4 pb-safe animate-fadeIn select-none">
      <div className="bg-white border-2 border-b-4 border-slate-200 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden animate-scaleUp">
        {/* Header Bar */}
        <div className="p-3 sm:p-4 border-b-2 border-slate-100 flex items-center gap-2.5 sm:gap-3 shrink-0">
          <DuoMascot mood="happy" size={34} animate={false} />
          <div className="flex-1 relative">
            <Search className="w-5 h-5 text-[#1CB0F6] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              autoFocus
              placeholder="جستجو در سرفصل‌ها (مثال: فروید، شرطی‌سازی، دوپامین، اریکسون)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pr-11 pl-4 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-2xl text-base sm:text-xs font-bold sm:font-black text-slate-800 outline-none focus:border-[#1CB0F6] focus:bg-white min-h-[44px]"
            />
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer min-w-[38px] min-h-[38px] flex items-center justify-center shrink-0"
            title="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section filter chips */}
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2 overflow-x-auto text-[11px] font-black">
          <span className="text-slate-400 whitespace-nowrap">بخش:</span>
          <button
            onClick={() => setSelectedSectionFilter('all')}
            className={`px-3 py-1 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
              selectedSectionFilter === 'all'
                ? 'bg-[#1CB0F6] text-white'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            همه بخش‌ها
          </button>
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSectionFilter(s.id)}
              className={`px-3 py-1 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                selectedSectionFilter === s.id
                  ? 'bg-[#1CB0F6] text-white'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              بخش {s.id}
            </button>
          ))}
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {!query.trim() ? (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center">
              <DuoMascot mood="thinking" size={64} />
              <p className="text-xs font-black mt-3">عبارت مورد نظر خود را تایپ کنید</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center">
              <DuoMascot mood="sad" size={64} />
              <p className="text-xs font-black mt-3">موردی یافت نشد!</p>
            </div>
          ) : (
            searchResults.map((ch) => (
              <div
                key={ch.id}
                onClick={() => {
                  playDuoSound('click');
                  onSelectChapter(ch);
                  onClose();
                }}
                className="bg-white border-2 border-b-4 border-slate-200 hover:border-[#1CB0F6] hover:bg-[#E5F6FD] p-4 rounded-2xl cursor-pointer transition-all flex items-center justify-between group"
              >
                <div>
                  <span className="text-[10px] font-black text-[#58CC02]">
                    بخش {ch.sectionId} · فصل {ch.chapterNumber}
                  </span>
                  <h4 className="text-sm font-black text-slate-800 mt-0.5 group-hover:text-[#1899D6]">
                    {ch.title}
                  </h4>
                  <p className="text-[11px] font-bold text-slate-400 mt-0.5">{ch.englishTitle}</p>
                </div>
                <ChevronLeft className="w-5 h-5 text-slate-300 group-hover:text-[#1CB0F6]" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
