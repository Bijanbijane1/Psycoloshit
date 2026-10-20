import React, { useState } from 'react';
import { Section, Chapter, UserProgress } from '../types/psychology';
import { toPersianDigits } from '../utils/persianDigits';
import {
  FileEdit,
  BookOpen,
  Trash2,
  Copy,
  Check,
  Search,
  ChevronLeft,
} from 'lucide-react';
import { playDuoSound } from '../utils/duoAudio';

interface NotebookViewProps {
  sections: Section[];
  progress: UserProgress;
  onSelectChapter: (chapter: Chapter) => void;
  onSaveNote: (chapterId: string, noteText: string) => void;
}

export const NotebookView: React.FC<NotebookViewProps> = ({
  sections,
  progress,
  onSelectChapter,
  onSaveNote,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'notes' | 'flashcards'>('notes');

  const allChapters = sections.flatMap((s) => s.chapters);
  const allFlashcards = allChapters.flatMap((c) =>
    c.flashcards.map((f) => ({ ...f, chapterTitle: c.title, chapter: c }))
  );

  // Find all chapters that have non-empty notes
  const notesEntries = Object.entries(progress.chapterNotes)
    .filter(([_, text]) => text && text.trim().length > 0)
    .map(([chapterId, text]) => {
      const chapter = allChapters.find((c) => c.id === chapterId);
      const section = chapter ? sections.find((s) => s.id === chapter.sectionId) : null;
      return {
        chapterId,
        text,
        chapter,
        section,
      };
    })
    .filter((entry) => {
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        entry.text.toLowerCase().includes(q) ||
        (entry.chapter?.title || '').toLowerCase().includes(q) ||
        (entry.section?.title || '').toLowerCase().includes(q)
      );
    });

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    playDuoSound('click');
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExecuteDelete = (chapterId: string) => {
    playDuoSound('click');
    onSaveNote(chapterId, '');
    setConfirmDeleteId(null);
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6 pb-28 select-none animate-fadeIn">
      {/* Editorial Notebook Header Banner */}
      <div className="bg-white border border-[#E5E1EB] rounded-3xl p-5 sm:p-6 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 text-right">
          <div className="w-14 h-14 rounded-2xl bg-[#FFF6D6] border border-[#FDE68A] flex items-center justify-center text-[#D97706] shrink-0">
            <FileEdit className="w-7 h-7" />
          </div>
          <div>
            <span className="text-[10px] sm:text-[11px] font-extrabold tracking-wider bg-[#FFF6D6] text-[#92400E] px-2.5 py-0.5 rounded-full inline-block">
              گنجینه واژگان و یادداشت‌ها
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-[#1E1E2E] mt-1">دفترچه شخصی یادگیری</h1>
            <p className="text-[11px] sm:text-xs font-bold text-[#686882] mt-0.5">
              مرور سریع اصطلاحات روان‌شناسی، نکات شخصی و فلش‌کارت‌ها
            </p>
          </div>
        </div>

        {/* Tab pills switcher */}
        <div className="flex items-center bg-[#F7F5F0] p-1 rounded-2xl border border-[#E5E1EB] w-full md:w-auto justify-around gap-1">
          <button
            onClick={() => {
              playDuoSound('click');
              setActiveTab('notes');
            }}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex-1 md:flex-initial text-center ${
              activeTab === 'notes'
                ? 'bg-white text-[#5B4BDB] shadow-2xs border border-[#E5E1EB]'
                : 'text-[#686882] hover:text-[#24243B]'
            }`}
          >
            یادداشت‌ها ({toPersianDigits(notesEntries.length)})
          </button>
          <button
            onClick={() => {
              playDuoSound('click');
              setActiveTab('flashcards');
            }}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex-1 md:flex-initial text-center ${
              activeTab === 'flashcards'
                ? 'bg-white text-[#5B4BDB] shadow-2xs border border-[#E5E1EB]'
                : 'text-[#686882] hover:text-[#24243B]'
            }`}
          >
            واژگان ({toPersianDigits(allFlashcards.length)})
          </button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="w-5 h-5 text-[#686882] absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="جستجو در بین یادداشت‌ها و واژگان تخصصی..."
          className="w-full pr-12 pl-4 py-3 bg-white border border-[#E5E1EB] rounded-2xl text-base lg:text-xs font-bold text-[#1E1E2E] outline-none focus:border-[#5B4BDB] min-h-[48px] shadow-2xs"
        />
      </div>

      {/* TAB 1: USER NOTES */}
      {activeTab === 'notes' && (
        <div className="flex flex-col gap-4">
          {notesEntries.length === 0 ? (
            <div className="bg-white border border-[#E5E1EB] rounded-3xl p-10 text-center flex flex-col items-center shadow-2xs">
              <div className="w-16 h-16 rounded-2xl bg-[#F4F1FA] border border-[#DCD6F7] flex items-center justify-center text-[#5B4BDB] mb-3">
                <FileEdit className="w-8 h-8" />
              </div>
              <h3 className="text-base font-black text-[#1E1E2E] mt-1">
                هنوز یادداشتی ثبت نکرده‌اید
              </h3>
              <p className="text-xs font-bold text-[#686882] mt-1.5 max-w-sm leading-relaxed">
                هنگام مطالعه هر درس در بخش کتابخانه، روی دکمه «یادداشت» بزنید تا نکات مهم خود را اینجا ذخیره کنید.
              </p>
            </div>
          ) : (
            notesEntries.map(({ chapterId, text, chapter, section }) => (
              <div
                key={chapterId}
                className="bg-white border border-[#E5E1EB] rounded-3xl p-5 shadow-2xs flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E5E1EB]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#5B4BDB] shrink-0" />
                    <span className="text-xs font-black text-[#1E1E2E] truncate">
                      {chapter?.title || 'سرفصل نامشخص'}
                    </span>
                    {section && (
                      <span className="text-[10px] font-bold text-[#686882] truncate">
                        ({section.title})
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    {/* Copy */}
                    <button
                      onClick={() => handleCopy(chapterId, text)}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-[#FAF8F5] hover:bg-[#F4F1FA] border border-[#E5E1EB] p-2.5 rounded-xl text-[#47475E] cursor-pointer transition-colors"
                      title="کپی یادداشت"
                    >
                      {copiedId === chapterId ? (
                        <Check className="w-4 h-4 text-[#0F766E]" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>

                    {/* Delete with inline confirm */}
                    {confirmDeleteId === chapterId ? (
                      <div className="flex items-center gap-1.5 bg-[#FFE4E8] px-2.5 py-1 rounded-xl border border-[#FECDD3] min-h-[44px]">
                        <span className="text-[11px] font-black text-[#BE123C] px-1">حذف؟</span>
                        <button
                          onClick={() => handleExecuteDelete(chapterId)}
                          className="min-h-[44px] min-w-[44px] px-3 py-1.5 bg-[#E11D48] text-white rounded-lg text-xs font-black cursor-pointer flex items-center justify-center"
                        >
                          بله
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[44px] min-w-[44px] px-3 py-1.5 text-[#47475E] hover:bg-white/60 rounded-lg text-xs font-bold cursor-pointer flex items-center justify-center"
                        >
                          لغو
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(chapterId)}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 text-[#686882] hover:text-[#E11D48] hover:bg-[#FFE4E8] border border-transparent hover:border-[#FECDD3] rounded-xl cursor-pointer transition-colors"
                        title="حذف یادداشت"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                    {/* Go to Chapter */}
                    {chapter && (
                      <button
                        onClick={() => {
                          playDuoSound('click');
                          onSelectChapter(chapter);
                        }}
                        className="min-h-[44px] bg-[#5B4BDB] hover:bg-[#4636B5] text-white px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>ورود به درس</span>
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs sm:text-sm font-bold text-[#24243B] leading-relaxed whitespace-pre-wrap">
                  {text}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: FLASHCARDS DICTIONARY */}
      {activeTab === 'flashcards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {allFlashcards
            .filter((fc) => {
              if (!searchTerm.trim()) return true;
              const q = searchTerm.toLowerCase();
              return (
                fc.term.toLowerCase().includes(q) ||
                (fc.englishTerm || '').toLowerCase().includes(q) ||
                fc.definition.toLowerCase().includes(q)
              );
            })
            .map((fc) => (
              <div
                key={fc.id}
                className="bg-white border border-[#E5E1EB] rounded-3xl p-5 shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-black text-[#1E1E2E]">{fc.term}</span>
                    {fc.englishTerm && (
                      <span className="text-[11px] font-bold text-[#5B4BDB] bg-[#F4F1FA] px-2 py-0.5 rounded-lg" dir="ltr">
                        {fc.englishTerm}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-[#47475E] leading-relaxed mb-3">
                    {fc.definition}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#E5E1EB]">
                  <span className="text-[11px] font-bold text-[#686882] truncate max-w-[160px]">
                    {fc.chapterTitle}
                  </span>
                  <button
                    onClick={() => {
                      playDuoSound('click');
                      onSelectChapter(fc.chapter);
                    }}
                    className="min-h-[44px] bg-[#FAF8F5] hover:bg-[#F4F1FA] border border-[#E5E1EB] text-[#24243B] px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>مطالعه در سرفصل</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

