import React, { useState, useEffect } from 'react';
import { Section, Chapter, UserProgress } from '../types/psychology';
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Sparkles,
  Bookmark,
  Pin,
  CheckCircle2,
  FileEdit,
  Save,
  Volume2,
  VolumeX,
  Check,
  Zap,
  Menu,
  X,
  Star,
  GraduationCap,
  Quote,
  Copy,
  Timer,
  Layers,
  MessageSquare,
} from 'lucide-react';
import { playDuoSound } from '../utils/duoAudio';
import { getAcademicSourcesForChapter } from '../data/academicSources';
import { toPersianDigits } from '../utils/persianDigits';
import confetti from 'canvas-confetti';

interface BookReaderViewProps {
  sections: Section[];
  currentChapter: Chapter;
  onSelectChapter: (chapter: Chapter) => void;
  onStartQuiz: (chapter: Chapter) => void;
  progress: UserProgress;
  onToggleBookmark: (chapterId: string) => void;
  onTogglePin: (chapterId: string) => void;
  onSaveNote: (chapterId: string, noteText: string) => void;
  onMarkCompleted: (chapterId: string) => void;
  onAskMentorAboutChapter: (chapterTitle: string, sectionTitle: string) => void;
  onOpenPomodoro?: () => void;
  onUpdateSettings?: (newSettings: Partial<UserProgress['customSettings']>) => void;
}

export const BookReaderView: React.FC<BookReaderViewProps> = ({
  sections,
  currentChapter,
  onSelectChapter,
  onStartQuiz,
  progress,
  onToggleBookmark,
  onTogglePin,
  onSaveNote,
  onMarkCompleted,
  onAskMentorAboutChapter,
  onOpenPomodoro,
}) => {
  const [readingMode, setReadingMode] = useState<'academic' | 'simplified'>('academic');
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');
  const [activeSubtopicIndex, setActiveSubtopicIndex] = useState<number | null>(null);

  // Sidebar for table of contents
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Notes
  const [noteContent, setNoteContent] = useState<string>(
    progress.chapterNotes[currentChapter.id] || ''
  );
  const [isNoteSaved, setIsNoteSaved] = useState<boolean>(false);
  const [showNotesPanel, setShowNotesPanel] = useState<boolean>(false);

  // Audio Speech Synthesis
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [ttsNotice, setTtsNotice] = useState<string | null>(null);

  // Flashcards state
  const [revealedFlashcards, setRevealedFlashcards] = useState<Record<string, boolean>>({});

  // Academic sources citation state
  const [copiedSourceId, setCopiedSourceId] = useState<string | null>(null);
  const chapterSources = getAcademicSourcesForChapter(currentChapter.id);

  const handleCopyCitation = (citation: string, id: string) => {
    navigator.clipboard?.writeText(citation);
    setCopiedSourceId(id);
    playDuoSound('click');
    setTimeout(() => setCopiedSourceId(null), 2500);
  };

  // Reset states when chapter changes
  useEffect(() => {
    setNoteContent(progress.chapterNotes[currentChapter.id] || '');
    setActiveSubtopicIndex(null);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, [currentChapter.id, progress.chapterNotes]);

  // Audio toggle
  const handleToggleAudioTTS = () => {
    if (!('speechSynthesis' in window)) {
      setTtsNotice('مرورگر شما از قابلیت خوانش صوتی گفتار پشتیبانی نمی‌کند.');
      setTimeout(() => setTtsNotice(null), 4000);
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const textToRead =
      activeSubtopicIndex !== null && currentChapter.subtopicDetails?.[activeSubtopicIndex]
        ? readingMode === 'academic'
          ? currentChapter.subtopicDetails[activeSubtopicIndex].academicText
          : currentChapter.subtopicDetails[activeSubtopicIndex].simplifiedText
        : readingMode === 'academic'
        ? currentChapter.academicText
        : currentChapter.simplifiedText;

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'fa-IR';
    utterance.rate = 0.95;

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
    playDuoSound('click');
  };

  const handleSaveNoteAction = () => {
    onSaveNote(currentChapter.id, noteContent);
    setIsNoteSaved(true);
    playDuoSound('correct');
    setTimeout(() => setIsNoteSaved(false), 2000);
  };

  const handleCompleteLesson = () => {
    onMarkCompleted(currentChapter.id);
    playDuoSound('complete');
    confetti({
      particleCount: 65,
      spread: 75,
      origin: { y: 0.6 },
      colors: ['#5B46E8', '#16A394', '#F59E0B'],
    });
  };

  // Find current section & chapter indices for Prev / Next navigation
  const currentSection = sections.find((s) => s.id === currentChapter.sectionId) || sections[0];
  const allChapters = sections.flatMap((s) => s.chapters);
  const currentIndex = allChapters.findIndex((c) => c.id === currentChapter.id);
  const prevChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null;

  const isCompleted = progress.completedChapters.includes(currentChapter.id);
  const isBookmarked = progress.bookmarkedChapters.includes(currentChapter.id);
  const isPinned = progress.pinnedChapters.includes(currentChapter.id);

  const activeSubtopicDetail =
    activeSubtopicIndex !== null && currentChapter.subtopicDetails
      ? currentChapter.subtopicDetails[activeSubtopicIndex]
      : null;

  const currentDisplayContent = activeSubtopicDetail
    ? readingMode === 'academic'
      ? activeSubtopicDetail.academicText
      : activeSubtopicDetail.simplifiedText
    : readingMode === 'academic'
    ? currentChapter.academicText
    : currentChapter.simplifiedText;

  return (
    <div className="flex flex-col lg:flex-row gap-6 pb-24 select-none animate-fadeIn">
      {/* Mobile Backdrop for Sidebar Drawer */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-[#24243B]/45 backdrop-blur-xs lg:hidden transition-opacity"
        />
      )}

      {/* ======================================================== */}
      {/* 1. TABLE OF CONTENTS DRAWER / SIDEBAR                   */}
      {/* ======================================================== */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-72 max-w-[85vw] bg-white border-l border-[#E5E1EB] p-4 transition-transform lg:translate-x-0 lg:static lg:w-72 lg:rounded-2xl lg:border lg:border-[#E5E1EB] lg:self-start ${
          isSidebarOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full lg:translate-x-0'
        }`}
      >
          <div className="flex items-center justify-between pb-3.5 border-b border-[#E5E1EB]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#DDF7F2] text-[#0F766E] flex items-center justify-center">
                <BookOpen className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-black text-[#24243B]">فهرست سرفصل‌های کتاب</h3>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-2 text-[#69697E] hover:text-[#24243B] rounded-xl min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
              aria-label="بستن فهرست"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-160px)] touch-scroll pr-0.5">
            {sections.map((sec) => (
              <div key={sec.id} className="flex flex-col gap-1.5">
                <span className="text-[11px] font-extrabold text-[#69697E] px-2">
                  بخش {toPersianDigits(sec.id)}: {sec.title}
                </span>
                <div className="flex flex-col gap-1">
                  {sec.chapters.map((chap) => {
                    const isCur = chap.id === currentChapter.id;
                    const isDone = progress.completedChapters.includes(chap.id);
                    return (
                      <button
                        key={chap.id}
                        onClick={() => {
                          playDuoSound('click');
                          onSelectChapter(chap);
                          setIsSidebarOpen(false);
                        }}
                        className={`w-full text-right px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer min-h-[44px] border ${
                          isCur
                            ? 'bg-[#EAE4FF] text-[#5B46E8] border-[#5B46E8]/35 font-extrabold'
                            : 'bg-transparent border-transparent text-[#24243B] hover:bg-[#F7F5F0]'
                        }`}
                      >
                        <span className="truncate">{chap.title}</span>
                        {isDone && (
                          <span className="w-4 h-4 rounded-full bg-[#DDF7F2] text-[#169E6C] flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ======================================================== */}
        {/* 2. MAIN EDITORIAL READING ARENA                          */}
        {/* ======================================================== */}
        <main className="flex-1 max-w-3xl xl:max-w-4xl w-full flex flex-col gap-5">
          {/* Editorial Chapter Header Banner */}
          <div className="bg-[#1F1B44] border border-[#352E6E] rounded-2xl sm:rounded-3xl p-5 sm:p-7 text-white relative overflow-hidden">
            {/* Subtle Psychology Geometry Accent */}
            <svg
              viewBox="0 0 220 140"
              className="absolute left-0 top-0 h-full w-48 opacity-15 pointer-events-none"
              aria-hidden="true"
            >
              <circle cx="55" cy="70" r="46" fill="none" stroke="#16A394" strokeWidth="1.5" />
              <circle cx="95" cy="70" r="34" fill="none" stroke="#EAE4FF" strokeWidth="1.5" strokeDasharray="4 4" />
              <path d="M20 70 H165" stroke="#F59E0B" strokeWidth="1.2" />
            </svg>

            <div className="flex items-start justify-between gap-4 relative z-10">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="lg:hidden p-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0 border border-white/15 mt-0.5"
                  title="فهرست سرفصل‌ها"
                  aria-label="فهرست سرفصل‌ها"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-extrabold text-[#DDF7F2] bg-[#16A394]/30 border border-[#16A394]/45 px-2.5 py-0.5 rounded-md">
                      بخش {toPersianDigits(currentSection.id)} · {currentSection.title}
                    </span>
                    {isCompleted && (
                      <span className="text-[11px] font-extrabold text-[#DDF7F2] bg-[#169E6C]/30 border border-[#169E6C]/40 px-2.5 py-0.5 rounded-md flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        مطالعه شده
                      </span>
                    )}
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black mt-2.5 leading-snug text-white">
                    {currentChapter.title}
                  </h1>
                  <p className="text-xs font-medium text-[#EAE4FF]/75 mt-1 truncate dir-ltr text-right">
                    {currentChapter.englishTitle}
                  </p>
                </div>
              </div>

              {/* Direct Practice Action in Header */}
              <button
                onClick={() => {
                  playDuoSound('click');
                  onStartQuiz(currentChapter);
                }}
                className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#16A394] hover:bg-[#12877A] text-white text-xs font-extrabold transition-colors cursor-pointer shrink-0 min-h-[44px]"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>آزمون این فصل</span>
              </button>
            </div>
          </div>

          {/* TTS Notification Banner */}
          {ttsNotice && (
            <div className="p-3.5 bg-[#FFF0C8] border border-[#F59E0B]/40 text-[#92400E] rounded-xl text-xs font-bold">
              {ttsNotice}
            </div>
          )}

          {/* Editorial Controls Toolbar */}
          <div className="bg-white rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 border border-[#E5E1EB]">
            {/* Reading Mode Switcher (Academic vs Simplified) */}
            <div className="flex items-center bg-[#F7F5F0] p-1 rounded-xl border border-[#E5E1EB] w-full sm:w-auto">
              <button
                onClick={() => {
                  playDuoSound('click');
                  setReadingMode('academic');
                }}
                className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer min-h-[44px] ${
                  readingMode === 'academic'
                    ? 'bg-[#5B46E8] text-white'
                    : 'text-[#69697E] hover:text-[#24243B]'
                }`}
              >
                متن دانشگاهی و مرجع
              </button>
              <button
                onClick={() => {
                  playDuoSound('click');
                  setReadingMode('simplified');
                }}
                className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 min-h-[44px] ${
                  readingMode === 'simplified'
                    ? 'bg-[#5B46E8] text-white'
                    : 'text-[#69697E] hover:text-[#24243B]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>خلاصه آموزشی</span>
              </button>
            </div>

            {/* Reader Utilities: Font Size, Audio TTS, Notes, Bookmark, Pin */}
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              {/* Font Size Adjuster */}
              <div className="flex items-center bg-[#F7F5F0] p-1 rounded-xl border border-[#E5E1EB] text-xs font-extrabold">
                <button
                  onClick={() => {
                    playDuoSound('click');
                    setFontSize('sm');
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer min-h-[44px] ${
                    fontSize === 'sm' ? 'bg-white text-[#24243B] shadow-2xs' : 'text-[#69697E] hover:text-[#24243B]'
                  }`}
                  title="اندازه متن کوچک"
                >
                  کوچک
                </button>
                <button
                  onClick={() => {
                    playDuoSound('click');
                    setFontSize('base');
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer min-h-[44px] ${
                    fontSize === 'base' ? 'bg-white text-[#24243B] shadow-2xs' : 'text-[#69697E] hover:text-[#24243B]'
                  }`}
                  title="اندازه متن استاندارد"
                >
                  متوسط
                </button>
                <button
                  onClick={() => {
                    playDuoSound('click');
                    setFontSize('lg');
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer min-h-[44px] ${
                    fontSize === 'lg' ? 'bg-white text-[#24243B] shadow-2xs' : 'text-[#69697E] hover:text-[#24243B]'
                  }`}
                  title="اندازه متن بزرگ"
                >
                  بزرگ
                </button>
              </div>

              {/* Audio TTS Button */}
              <button
                onClick={handleToggleAudioTTS}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors border min-h-[44px] ${
                  isSpeaking
                    ? 'bg-[#FFE4E8] text-[#9F1239] border-[#D9485F]/35'
                    : 'bg-[#F7F5F0] hover:bg-[#EAE4FF]/50 text-[#24243B] border-[#E5E1EB]'
                }`}
                title="خوانش صوتی متن"
              >
                {isSpeaking ? <VolumeX className="w-4 h-4 text-[#D9485F]" /> : <Volume2 className="w-4 h-4 text-[#5B46E8]" />}
                <span>{isSpeaking ? 'توقف خوانش' : 'خوانش صوتی'}</span>
              </button>

              {/* Notebook Toggle */}
              <button
                onClick={() => {
                  playDuoSound('click');
                  setShowNotesPanel(!showNotesPanel);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer border transition-colors min-h-[44px] ${
                  showNotesPanel
                    ? 'bg-[#FFF0C8] text-[#92400E] border-[#F59E0B]/40'
                    : 'bg-[#F7F5F0] hover:bg-[#EAE4FF]/50 text-[#24243B] border-[#E5E1EB]'
                }`}
              >
                <FileEdit className="w-4 h-4 text-[#D97706]" />
                <span>یادداشت</span>
              </button>

              {/* Pomodoro Focus Timer Toggle */}
              {onOpenPomodoro && (
                <button
                  onClick={() => {
                    playDuoSound('click');
                    onOpenPomodoro();
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer bg-[#F7F5F0] hover:bg-[#FFF0C8]/60 text-[#24243B] border border-[#E5E1EB] transition-colors min-h-[44px]"
                  title="تایمر مطالعه پومودورو"
                >
                  <Timer className="w-4 h-4 text-[#D97706]" />
                  <span className="hidden sm:inline">پومودورو</span>
                </button>
              )}

              {/* Bookmark */}
              <button
                onClick={() => {
                  playDuoSound('click');
                  onToggleBookmark(currentChapter.id);
                }}
                className={`p-2.5 rounded-xl border transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center ${
                  isBookmarked
                    ? 'bg-[#FFF0C8] border-[#F59E0B]/45 text-[#B45309]'
                    : 'border-[#E5E1EB] text-[#69697E] hover:bg-[#F7F5F0]'
                }`}
                title="نشان‌گذاری فصل"
                aria-label="نشان‌گذاری فصل"
              >
                <Bookmark className="w-4 h-4 fill-current" />
              </button>

              {/* Pin */}
              <button
                onClick={() => {
                  playDuoSound('click');
                  onTogglePin(currentChapter.id);
                }}
                className={`p-2.5 rounded-xl border transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center ${
                  isPinned
                    ? 'bg-[#DDF7F2] border-[#16A394]/40 text-[#0F766E]'
                    : 'border-[#E5E1EB] text-[#69697E] hover:bg-[#F7F5F0]'
                }`}
                title="سنجاق در داشبورد"
                aria-label="سنجاق در داشبورد"
              >
                <Pin className="w-4 h-4 fill-current" />
              </button>
            </div>
          </div>

          {/* Subtopic Switcher Strip */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              onClick={() => {
                playDuoSound('click');
                setActiveSubtopicIndex(null);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-colors cursor-pointer border min-h-[44px] ${
                activeSubtopicIndex === null
                  ? 'bg-[#24243B] text-white border-[#24243B]'
                  : 'bg-white text-[#69697E] border-[#E5E1EB] hover:text-[#24243B]'
              }`}
            >
              همه مباحث فصل
            </button>
            {currentChapter.subtopics.map((st, idx) => (
              <button
                key={idx}
                onClick={() => {
                  playDuoSound('click');
                  setActiveSubtopicIndex(idx);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-colors cursor-pointer border min-h-[44px] ${
                  activeSubtopicIndex === idx
                    ? 'bg-[#5B46E8] text-white border-[#5B46E8]'
                    : 'bg-white text-[#69697E] border-[#E5E1EB] hover:text-[#24243B]'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Note-taking expandable drawer */}
          {showNotesPanel && (
            <div className="bg-[#FFF0C8]/55 border border-[#F59E0B]/35 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#92400E] flex items-center gap-1.5">
                  <FileEdit className="w-4 h-4 text-[#D97706]" />
                  <span>یادداشت شخصی شما برای این فصل</span>
                </span>
                <button
                  onClick={handleSaveNoteAction}
                  className="bg-[#D97706] hover:bg-[#B45309] text-white px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1 cursor-pointer transition-colors min-h-[44px]"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isNoteSaved ? 'ذخیره شد' : 'ذخیره یادداشت'}</span>
                </button>
              </div>
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="نکات مهم، خلاصه مفاهیم، یا یادآوری‌های خود را اینجا بنویسید..."
                className="w-full h-24 p-3 bg-white border border-[#F59E0B]/30 rounded-xl text-base lg:text-xs font-medium text-[#24243B] resize-none outline-none focus:border-[#D97706]"
              />
            </div>
          )}

          {/* Main Editorial Article Surface */}
          <article className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 lg:p-10 border border-[#E5E1EB] shadow-2xs">
            {activeSubtopicDetail && (
              <div className="mb-5 pb-3.5 border-b border-[#E5E1EB] flex items-center justify-between gap-2">
                <h2 className="text-base sm:text-lg font-black text-[#5B46E8]">
                  {activeSubtopicDetail.title}
                </h2>
                <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-md bg-[#EAE4FF] text-[#5B46E8]">
                  زیرمبحث تخصصی
                </span>
              </div>
            )}

            <div
              className={`prose-persian max-w-[68ch] space-y-4 text-[#24243B] ${
                fontSize === 'sm'
                  ? 'text-xs sm:text-sm leading-relaxed'
                  : fontSize === 'lg'
                  ? 'text-base sm:text-lg leading-loose'
                  : 'text-sm sm:text-base leading-loose'
              }`}
            >
              {currentDisplayContent.split('\n\n').map((paragraph, pIdx) => (
                <p key={pIdx}>
                  {paragraph}
                </p>
              ))}
            </div>
          </article>

          {/* Key Points (نکات کلیدی برای آزمون و تثبیت مفهوم) */}
          {currentChapter.keyPoints && currentChapter.keyPoints.length > 0 && (
            <section className="bg-[#EAE4FF]/45 rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-[#5B46E8]/20">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-[#5B46E8] text-white flex items-center justify-center">
                  <Star className="w-4 h-4 fill-current" />
                </div>
                <h3 className="text-sm sm:text-base font-black text-[#24243B]">
                  نکات کلیدی و مفاهیم پرتکرار آزمونی
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentChapter.keyPoints.map((point, kIdx) => (
                  <div
                    key={kIdx}
                    className="bg-white border border-[#E5E1EB] rounded-xl p-3.5 flex items-start gap-2.5 text-xs font-bold text-[#24243B]"
                  >
                    <span className="w-5 h-5 rounded-md bg-[#EAE4FF] text-[#5B46E8] flex items-center justify-center shrink-0 text-[11px] font-extrabold mt-0.5">
                      {toPersianDigits(kIdx + 1)}
                    </span>
                    <span className="leading-relaxed">{point}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Highlighted Definitions & Concept Cards (فلش‌کارت‌های مفهومی فصل) */}
          {currentChapter.flashcards && currentChapter.flashcards.length > 0 && (
            <section className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-[#E5E1EB]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#DDF7F2] text-[#0F766E] flex items-center justify-center">
                    <Layers className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm sm:text-base font-black text-[#24243B]">
                    واژگان تخصصی و تعاریف کلیدی فصل
                  </h3>
                </div>
                <span className="text-xs font-medium text-[#69697E]">
                  برای مشاهده یا پنهان‌کردن تعریف، روی هر کارت کلیک کنید
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentChapter.flashcards.map((fc) => {
                  const isFlipped = revealedFlashcards[fc.id];
                  return (
                    <button
                      type="button"
                      key={fc.id}
                      onClick={() => {
                        playDuoSound('click');
                        setRevealedFlashcards((prev) => ({
                          ...prev,
                          [fc.id]: !prev[fc.id],
                        }));
                      }}
                      className={`p-4 rounded-xl border text-right cursor-pointer transition-all min-h-[104px] flex flex-col justify-between ${
                        isFlipped
                          ? 'bg-[#DDF7F2]/60 border-[#16A394] text-[#064E3B]'
                          : 'bg-[#F7F5F0]/60 border-[#E5E1EB] hover:border-[#16A394]/50 text-[#24243B]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="text-sm font-black">{fc.term}</span>
                        {fc.englishTerm && (
                          <span className="text-[11px] font-medium text-[#69697E] dir-ltr">
                            {fc.englishTerm}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium mt-2.5 leading-relaxed text-right">
                        {isFlipped ? fc.definition : 'مشاهده تعریف علمی ←'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Academic Sources & Citations */}
          {chapterSources && chapterSources.length > 0 && (
            <section className="bg-white border border-[#E5E1EB] rounded-2xl sm:rounded-3xl p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[#E5E1EB]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#EAE4FF] text-[#5B46E8] flex items-center justify-center shrink-0">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-[#24243B] flex items-center gap-2">
                      <span>منابع و رفرنس‌های دانشگاهی فصل</span>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-[#F7F5F0] text-[#69697E] border border-[#E5E1EB]">
                        APA 7th
                      </span>
                    </h3>
                    <p className="text-xs font-medium text-[#69697E]">
                      محتوای این فصل بر اساس منابع معتبر روان‌شناسی تدوین شده است
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {chapterSources.map((src) => {
                  const isCopied = copiedSourceId === src.id;
                  return (
                    <div
                      key={src.id}
                      className="p-4 rounded-xl border border-[#E5E1EB] bg-[#F7F5F0]/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-right"
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-white border border-[#E5E1EB] flex items-center justify-center text-[#5B46E8] shrink-0 mt-0.5">
                          <Quote className="w-3.5 h-3.5" />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-extrabold text-[#24243B]">
                              {src.bookOrJournal}
                            </span>
                            {src.editionOrVolume && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border border-[#E5E1EB] text-[#69697E]">
                                {src.editionOrVolume}
                              </span>
                            )}
                            <span className="text-[10px] font-bold text-[#69697E]">
                              سال {toPersianDigits(src.year)}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-[#69697E] font-mono leading-relaxed select-all dir-ltr text-left">
                            {src.citationAPA}
                          </p>
                          {src.chapterOrPages && (
                            <span className="text-[11px] font-medium text-[#69697E] block">
                              {src.chapterOrPages}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleCopyCitation(src.citationAPA, src.id)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors border min-h-[44px] ${
                          isCopied
                            ? 'bg-[#169E6C] text-white border-[#169E6C]'
                            : 'bg-white border-[#E5E1EB] hover:border-[#5B46E8] text-[#24243B]'
                        }`}
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-white" />
                            <span>کپی شد</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>کپی رفرنس</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Direct Connection to Practice & Completion Bar */}
          <div className="bg-white border border-[#E5E1EB] rounded-2xl sm:rounded-3xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="text-right">
              <span className="text-sm font-black text-[#24243B] block">
                {isCompleted ? 'مطالعه این فصل ثبت شده است' : 'ثبت مطالعه و ورود به تمرین فصل'}
              </span>
              <span className="text-xs font-medium text-[#69697E] mt-0.5 block">
                پس از مطالعه متن، با حل سوالات مرتبط، مفاهیم را در حافظه بلندمدت تثبیت کنید.
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
              {/* Ask AI Mentor about chapter */}
              <button
                onClick={() => {
                  playDuoSound('click');
                  onAskMentorAboutChapter(currentChapter.title, currentSection.title);
                }}
                className="px-3.5 py-2.5 rounded-xl text-xs font-extrabold text-[#5B46E8] bg-[#EAE4FF]/70 hover:bg-[#EAE4FF] border border-[#5B46E8]/25 cursor-pointer flex items-center justify-center gap-1.5 transition-colors min-h-[44px]"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>پرسش از منتور</span>
              </button>

              {/* Mark Completed */}
              <button
                onClick={handleCompleteLesson}
                className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1.5 border transition-colors min-h-[44px] ${
                  isCompleted
                    ? 'bg-[#DDF7F2] text-[#064E3B] border-[#169E6C]/35'
                    : 'bg-[#F7F5F0] hover:bg-[#DDF7F2]/60 text-[#24243B] border-[#E5E1EB]'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-[#169E6C]" />
                <span>{isCompleted ? 'تکمیل شده' : `ثبت مطالعه (+${toPersianDigits(20)} XP)`}</span>
              </button>

              {/* Jump to Quiz */}
              <button
                onClick={() => {
                  playDuoSound('click');
                  onStartQuiz(currentChapter);
                }}
                className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-[#5B46E8] hover:bg-[#4935D4] text-white text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1.5 transition-colors min-h-[44px]"
              >
                <Zap className="w-4 h-4" />
                <span>آزمون این فصل</span>
              </button>
            </div>
          </div>

        {/* Prev / Next Chapter Navigation */}
        <div className="flex items-center justify-between pt-1 gap-3">
          {prevChapter ? (
            <button
              onClick={() => {
                playDuoSound('click');
                onSelectChapter(prevChapter);
              }}
              className="bg-white hover:bg-[#F7F5F0] border border-[#E5E1EB] text-[#24243B] px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer max-w-[48%] min-h-[44px] transition-colors"
            >
              <ChevronRight className="w-4 h-4 shrink-0 text-[#69697E]" />
              <span className="truncate">
                <span className="sm:hidden">فصل قبل</span>
                <span className="hidden sm:inline">فصل قبلی: {prevChapter.title}</span>
              </span>
            </button>
          ) : (
            <div />
          )}

          {nextChapter && (
            <button
              onClick={() => {
                playDuoSound('click');
                onSelectChapter(nextChapter);
              }}
              className="bg-white hover:bg-[#F7F5F0] border border-[#E5E1EB] text-[#24243B] px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer max-w-[48%] min-h-[44px] transition-colors"
            >
              <span className="truncate">
                <span className="sm:hidden">فصل بعد</span>
                <span className="hidden sm:inline">فصل بعدی: {nextChapter.title}</span>
              </span>
              <ChevronLeft className="w-4 h-4 shrink-0 text-[#69697E]" />
            </button>
          )}
        </div>
      </main>
    </div>
  );
};

