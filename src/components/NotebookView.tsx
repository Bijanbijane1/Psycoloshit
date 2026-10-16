import React, { useState } from 'react';
import { Section, Chapter, UserProgress } from '../types/psychology';
import {
  FileEdit,
  BookOpen,
  Trash2,
  Copy,
  Check,
  Search,
  Zap,
  Sparkles,
  Layers,
  Star,
  ChevronLeft,
} from 'lucide-react';
import { DuoMascot } from './DuoMascot';
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
    <div className="max-w-4xl mx-auto flex flex-col gap-6 pb-24 select-none animate-fadeIn">
      {/* Duolingo Notebook Header Banner */}
      <div className="bg-[#FF9600] border-b-4 border-[#E58500] rounded-3xl p-5 sm:p-6 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4 text-right">
          <DuoMascot mood="happy" size={56} animate={false} />
          <div>
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full inline-block">
              گنجینه واژگان و یادداشت‌ها
            </span>
            <h1 className="text-xl sm:text-2xl font-black mt-1">دفترچه طلایی یادگیری</h1>
            <p className="text-[11px] sm:text-xs font-bold opacity-90 mt-0.5">
              مرور سریع اصطلاحات روان‌شناسی، نکات شخصی و فلش‌کارت‌ها
            </p>
          </div>
        </div>

        {/* Tab pills switcher */}
        <div className="flex items-center bg-white/20 p-1 rounded-2xl border border-white/30 w-full md:w-auto justify-around">
          <button
            onClick={() => {
              playDuoSound('click');
              setActiveTab('notes');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex-1 md:flex-initial text-center ${
              activeTab === 'notes' ? 'bg-white text-orange-950 shadow-xs' : 'text-white'
            }`}
          >
            یادداشت‌ها ({notesEntries.length})
          </button>
          <button
            onClick={() => {
              playDuoSound('click');
              setActiveTab('flashcards');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex-1 md:flex-initial text-center ${
              activeTab === 'flashcards' ? 'bg-white text-orange-950 shadow-xs' : 'text-white'
            }`}
          >
            واژگان ({allFlashcards.length})
          </button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="جستجو در بین یادداشت‌ها و واژگان تخصصی..."
          className="w-full pr-12 pl-4 py-3 bg-white border-2 border-b-4 border-slate-200 rounded-2xl text-base sm:text-xs font-bold text-slate-800 outline-none focus:border-[#FF9600] min-h-[48px]"
        />
      </div>

      {/* TAB 1: USER NOTES */}
      {activeTab === 'notes' && (
        <div className="flex flex-col gap-4">
          {notesEntries.length === 0 ? (
            <div className="bg-white border-2 border-b-4 border-slate-200 rounded-3xl p-10 text-center flex flex-col items-center">
              <DuoMascot mood="thinking" size={80} />
              <h3 className="text-base font-black text-slate-800 mt-3">
                هنوز یادداشتی ثبت نکرده‌ای!
              </h3>
              <p className="text-xs font-bold text-slate-400 mt-1 max-w-sm">
                هنگام مطالعه هر درس در بخش کتابچه راهنما، روی دکمه «یادداشت» کلیک کن تا نکات طلایی خود را اینجا ذخیره کنی.
              </p>
            </div>
          ) : (
            notesEntries.map(({ chapterId, text, chapter, section }) => (
              <div
                key={chapterId}
                className="bg-white border-2 border-b-4 border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col gap-3"
              >
                <div className="flex items-center justify-between pb-3 border-b-2 border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FF9600]" />
                    <span className="text-xs font-black text-slate-800">
                      {chapter?.title || 'سرفصل نامشخص'}
                    </span>
                    {section && (
                      <span className="text-[10px] font-bold text-slate-400">
                        ({section.title})
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    {/* Copy */}
                    <button
                      onClick={() => handleCopy(chapterId, text)}
                      className="duo-btn-white p-2 rounded-xl text-slate-500 cursor-pointer"
                      title="کپی یادداشت"
                    >
                      {copiedId === chapterId ? (
                        <Check className="w-4 h-4 text-[#58CC02]" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>

                    {/* Delete with inline confirm */}
                    {confirmDeleteId === chapterId ? (
                      <div className="flex items-center gap-1 bg-rose-50 px-2 py-1 rounded-xl border border-rose-200">
                        <span className="text-[10px] font-black text-rose-700">حذف؟</span>
                        <button
                          onClick={() => handleExecuteDelete(chapterId)}
                          className="px-2 py-0.5 bg-rose-600 text-white rounded-lg text-[10px] font-black cursor-pointer"
                        >
                          بله
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-1.5 text-slate-400 text-[10px] cursor-pointer"
                        >
                          لغو
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(chapterId)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"
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
                        className="duo-btn-green px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>ورود به درس</span>
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs font-bold text-slate-700 leading-relaxed whitespace-pre-wrap">
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
                className="bg-white border-2 border-b-4 border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-black text-slate-800">{fc.term}</span>
                    {fc.englishTerm && (
                      <span className="text-[11px] font-bold text-[#1CB0F6]">
                        {fc.englishTerm}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-600 leading-relaxed mb-3">
                    {fc.definition}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 truncate max-w-[150px]">
                    {fc.chapterTitle}
                  </span>
                  <button
                    onClick={() => {
                      playDuoSound('click');
                      onSelectChapter(fc.chapter);
                    }}
                    className="duo-btn-white px-2.5 py-1 rounded-xl text-[10px] font-black flex items-center gap-1 cursor-pointer"
                  >
                    <span>مطالعه در سرفصل</span>
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};
