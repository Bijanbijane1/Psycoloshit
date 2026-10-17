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
  HelpCircle,
  Menu,
  X,
  Star,
  ChevronDown,
  GraduationCap,
  Quote,
  Copy,
  ExternalLink,
  Timer,
} from 'lucide-react';
import { DuoMascot } from './DuoMascot';
import { playDuoSound } from '../utils/duoAudio';
import { getAcademicSourcesForChapter } from '../data/academicSources';
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
      particleCount: 70,
      spread: 75,
      origin: { y: 0.6 },
      colors: ['#58CC02', '#FFC800', '#1CB0F6'],
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
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden transition-opacity"
        />
      )}

      {/* ======================================================== */}
      {/* 1. TABLE OF CONTENTS DRAWER / SIDEBAR                   */}
      {/* ======================================================== */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-72 max-w-[85vw] bg-white border-l-2 border-slate-200 p-4 transition-transform lg:translate-x-0 lg:static lg:w-72 lg:rounded-2xl lg:border-2 lg:border-b-4 lg:shadow-xs ${
          isSidebarOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#58CC02]" />
            <h3 className="text-sm font-black text-slate-800">فهرست سرفصل‌های دوره</h3>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-slate-700 rounded-xl min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-140px)] touch-scroll">
          {sections.map((sec) => (
            <div key={sec.id} className="flex flex-col gap-1">
              <span className="text-[11px] font-black text-slate-400 px-2">
                بخش {sec.id}: {sec.title}
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
                      className={`w-full text-right px-3 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-between cursor-pointer min-h-[44px] ${
                        isCur
                          ? 'bg-[#E5F6FD] text-[#1CB0F6] border-2 border-[#1CB0F6]'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="truncate">{chap.title}</span>
                      {isDone && <Check className="w-4 h-4 text-[#58CC02] stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ======================================================== */}
      {/* 2. MAIN GUIDEBOOK / STORY READING ARENA                  */}
      {/* ======================================================== */}
      <main className="flex-1 max-w-3xl xl:max-w-4xl w-full flex flex-col gap-5">
        {/* Unit Top Banner (Academic Guidebook Header) */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-indigo-900 border border-indigo-900/60 border-b-4 border-b-slate-950 rounded-3xl p-5 sm:p-6 text-white shadow-xl flex items-center justify-between gap-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0 relative z-10">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center shrink-0 border border-white/10"
              title="فهرست سرفصل‌ها"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-indigo-200/90 block truncate">
                کتابچه راهنما و مطالعه عمیق · بخش {currentSection.id}: {currentSection.title}
              </span>
              <h1 className="text-xl sm:text-2xl font-black mt-1 leading-tight text-white">{currentChapter.title}</h1>
              <p className="text-[11px] sm:text-xs font-bold text-slate-300/80 mt-1 truncate">
                {currentChapter.englishTitle}
              </p>
            </div>
          </div>

          <div className="shrink-0 hidden xs:block relative z-10 p-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10">
            <DuoMascot mood="tutor" size={54} animate={false} />
          </div>
        </div>

        {/* TTS Notification Banner */}
        {ttsNotice && (
          <div className="p-3 bg-amber-50 border-2 border-amber-300 text-amber-900 rounded-2xl text-xs font-black">
            {ttsNotice}
          </div>
        )}

        {/* Academic Controls Toolbar */}
        <div className="glass-panel rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs border border-white/80">
          {/* Segmented Pills (Academic vs Simple) */}
          <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
            <button
              onClick={() => {
                playDuoSound('click');
                setReadingMode('academic');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                readingMode === 'academic'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              متن دانشگاهی و مرجع
            </button>
            <button
              onClick={() => {
                playDuoSound('click');
                setReadingMode('simplified');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                readingMode === 'simplified'
                  ? 'bg-white text-indigo-700 shadow-2xs font-extrabold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
              <span>خلاصه ساده</span>
            </button>
          </div>

          {/* Action buttons: Font Size, Audio TTS, Notes, Bookmark */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Font Size Adjuster */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-black">
              <button
                onClick={() => {
                  playDuoSound('click');
                  setFontSize('sm');
                }}
                className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                  fontSize === 'sm' ? 'bg-white text-slate-800 shadow-2xs font-black' : 'text-slate-400 hover:text-slate-700'
                }`}
                title="اندازه متن کوچک"
              >
                A-
              </button>
              <button
                onClick={() => {
                  playDuoSound('click');
                  setFontSize('base');
                }}
                className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                  fontSize === 'base' ? 'bg-white text-slate-800 shadow-2xs font-black' : 'text-slate-400 hover:text-slate-700'
                }`}
                title="اندازه متن استاندارد"
              >
                A
              </button>
              <button
                onClick={() => {
                  playDuoSound('click');
                  setFontSize('lg');
                }}
                className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                  fontSize === 'lg' ? 'bg-white text-slate-800 shadow-2xs font-black' : 'text-slate-400 hover:text-slate-700'
                }`}
                title="اندازه متن بزرگ"
              >
                A+
              </button>
            </div>

            {/* Audio TTS Button */}
            <button
              onClick={handleToggleAudioTTS}
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all ${
                isSpeaking
                  ? 'duo-btn-red animate-pulse'
                  : 'duo-btn-blue'
              }`}
              title="خوانش صوتی متن با هوش صوتی"
            >
              {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span>{isSpeaking ? 'توقف خوانش' : 'گوش دادن'}</span>
            </button>

            {/* Notebook Toggle */}
            <button
              onClick={() => {
                playDuoSound('click');
                setShowNotesPanel(!showNotesPanel);
              }}
              className="duo-btn-white px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
            >
              <FileEdit className="w-4 h-4" />
              <span>یادداشت</span>
            </button>

            {/* Pomodoro Focus Timer Toggle */}
            {onOpenPomodoro && (
              <button
                onClick={() => {
                  playDuoSound('click');
                  onOpenPomodoro();
                }}
                className="duo-btn-yellow px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="شروع جلسه مطالعه متمرکز پومودورو برای این فصل"
              >
                <Timer className="w-4 h-4" />
                <span>پومودورو</span>
              </button>
            )}

            {/* Bookmark */}
            <button
              onClick={() => {
                playDuoSound('click');
                onToggleBookmark(currentChapter.id);
              }}
              className={`p-2 rounded-xl border-2 transition-all cursor-pointer ${
                isBookmarked
                  ? 'bg-amber-50 border-[#FFC800] text-amber-700'
                  : 'border-slate-200 text-slate-400 hover:bg-slate-50'
              }`}
              title="نشان‌گذاری"
            >
              <Bookmark className="w-4 h-4 fill-current" />
            </button>

            {/* Pin */}
            <button
              onClick={() => {
                playDuoSound('click');
                onTogglePin(currentChapter.id);
              }}
              className={`p-2 rounded-xl border-2 transition-all cursor-pointer ${
                isPinned
                  ? 'bg-sky-50 border-[#1CB0F6] text-[#1CB0F6]'
                  : 'border-slate-200 text-slate-400 hover:bg-slate-50'
              }`}
              title="پین در بالای داشبورد"
            >
              <Pin className="w-4 h-4 fill-current" />
            </button>
          </div>
        </div>

        {/* Subtopic tabs strip */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => {
              playDuoSound('click');
              setActiveSubtopicIndex(null);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all cursor-pointer ${
              activeSubtopicIndex === null
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'glass-pill text-slate-600 hover:text-indigo-900 hover:bg-white'
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
              className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all cursor-pointer ${
                activeSubtopicIndex === idx
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'glass-pill text-slate-600 hover:text-indigo-900 hover:bg-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Note-taking expandable drawer */}
        {showNotesPanel && (
          <div className="bg-amber-50/80 border-2 border-b-4 border-amber-300 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                <FileEdit className="w-4 h-4 text-amber-600" />
                <span>یادداشت شخصی شما برای این فصل</span>
              </span>
              <button
                onClick={handleSaveNoteAction}
                className="bg-amber-400 hover:bg-amber-500 text-amber-950 px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isNoteSaved ? 'ذخیره شد!' : 'ذخیره'}</span>
              </button>
            </div>
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="نکات مهم، خلاصه کلمات، یا یادآوری‌های خود را اینجا بنویسید..."
              className="w-full h-24 p-3 bg-white border border-amber-200 rounded-xl text-xs font-bold text-slate-800 resize-none outline-none focus:border-amber-400"
            />
          </div>
        )}

        {/* Main Text Content Story Card - Deep Study Paper */}
        <article className="glass-panel bg-white/90 backdrop-blur-md rounded-2xl sm:rounded-3xl p-4 sm:p-8 lg:p-10 shadow-sm border border-white/90">
          {activeSubtopicDetail && (
            <div className="mb-4 pb-3 border-b-2 border-slate-100 flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-black text-indigo-700">
                {activeSubtopicDetail.title}
              </h2>
              <span className="text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                مبحث تخصصی
              </span>
            </div>
          )}

          <div
            className={`prose-persian max-w-none space-y-4 ${
              fontSize === 'sm'
                ? 'text-xs sm:text-sm leading-relaxed'
                : fontSize === 'lg'
                ? 'text-base sm:text-lg leading-loose'
                : 'text-sm sm:text-base leading-relaxed sm:leading-loose'
            }`}
          >
            {currentDisplayContent.split('\n\n').map((paragraph, pIdx) => (
              <p key={pIdx}>
                {paragraph}
              </p>
            ))}
          </div>
        </article>

        {/* Key Points (نکات طلایی درس) */}
        {currentChapter.keyPoints && currentChapter.keyPoints.length > 0 && (
          <div className="glass-panel rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm border border-white/80">
            <div className="flex items-center gap-2 mb-3.5 text-indigo-700 font-black">
              <Star className="w-5 h-5 fill-amber-400 text-amber-500" />
              <h3 className="text-sm sm:text-base font-black text-slate-900">نکات کلیدی برای آزمون و تثبیت مفهوم</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
              {currentChapter.keyPoints.map((point, kIdx) => (
                <div
                  key={kIdx}
                  className="bg-white/80 border border-indigo-100 rounded-xl sm:rounded-2xl p-3 sm:p-3.5 flex items-start gap-2.5 text-xs font-black text-slate-800 shadow-2xs hover:border-indigo-300 transition-colors"
                >
                  <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 text-[10px] font-black">
                    ✓
                  </div>
                  <span className="leading-relaxed">{point}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Duolingo Flashcards (کارت‌های واژگان) */}
        {currentChapter.flashcards && currentChapter.flashcards.length > 0 && (
          <div className="glass-panel rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm border border-white/80">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 font-black text-slate-900">
              <DuoMascot mood="happy" size={36} animate={false} />
              <h3 className="text-base font-black">فلش‌کارت‌های تخصصی فصل</h3>
            </div>
            <span className="text-xs font-bold text-slate-400">
              برای مشاهده تعریف بر روی کارت کلیک کن
            </span>
          </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentChapter.flashcards.map((fc) => {
                const isFlipped = revealedFlashcards[fc.id];
                return (
                  <div
                    key={fc.id}
                    onClick={() => {
                      playDuoSound('click');
                      setRevealedFlashcards((prev) => ({
                        ...prev,
                        [fc.id]: !prev[fc.id],
                      }));
                    }}
                    className={`p-4 rounded-2xl border-2 border-b-4 cursor-pointer transition-all select-none min-h-[100px] flex flex-col justify-between ${
                      isFlipped
                        ? 'bg-[#DDF4FF] border-[#1CB0F6] text-[#1899D6]'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black">{fc.term}</span>
                      {fc.englishTerm && (
                        <span className="text-[10px] font-bold text-slate-400">
                          {fc.englishTerm}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold mt-2 leading-relaxed">
                      {isFlipped ? fc.definition : '💡 لمس برای مشاهده تعریف...'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Academic Sources & Citations (منابع و مراجع علمی فصل) */}
        {chapterSources && chapterSources.length > 0 && (
          <div className="bg-white border-2 border-b-4 border-indigo-200 rounded-3xl p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b-2 border-indigo-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                    <span>منابع و رفرنس‌های آکادمیک این فصل</span>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                      فرمت رسمی APA 7th
                    </span>
                  </h3>
                  <p className="text-xs font-bold text-slate-400">
                    محتوای آموزشی این فصل بر اساس کتب و مراجع دانشگاهی استاندارد تدوین شده است
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
                    className="p-4 rounded-2xl border-2 border-slate-200 bg-slate-50/60 hover:bg-white hover:border-indigo-300 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-right"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-7 h-7 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 shrink-0 mt-0.5">
                        <Quote className="w-3.5 h-3.5 text-indigo-500" />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-indigo-950">
                            {src.bookOrJournal}
                          </span>
                          {src.editionOrVolume && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                              {src.editionOrVolume}
                            </span>
                          )}
                          <span className="text-[10px] font-bold text-slate-400">
                            سال {src.year}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-600 font-mono leading-relaxed select-all dir-ltr text-left">
                          {src.citationAPA}
                        </p>
                        {src.chapterOrPages && (
                          <span className="text-[11px] font-bold text-slate-500 block">
                            📌 {src.chapterOrPages}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleCopyCitation(src.citationAPA, src.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shrink-0 transition-all ${
                        isCopied
                          ? 'bg-[#58CC02] text-white border-b-2 border-[#46A302]'
                          : 'bg-white border-2 border-slate-200 hover:border-indigo-400 text-slate-700 hover:text-indigo-600'
                      }`}
                      title="کپی رفرنس کامل جهت استفاده در مقاله یا پایان‌نامه"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-white" />
                          <span>کپی شد!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>کپی رفرنس APA</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom Celebration / Actions Bar */}
        <div className="bg-white border-2 border-b-4 border-slate-200 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <DuoMascot mood={isCompleted ? 'excited' : 'happy'} size={56} />
            <div className="text-right">
              <span className="text-sm font-black text-slate-800 block">
                {isCompleted ? 'این فصل با موفقیت تمام شده!' : 'آماده برای پایان درس؟'}
              </span>
              <span className="text-xs font-bold text-slate-400">
                با ثبت اتمام، ۲۰ امتیاز تجربه XP دریافت می‌کنی.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {/* Mark Completed */}
            <button
              onClick={handleCompleteLesson}
              className={`flex-1 sm:flex-initial px-5 py-3 rounded-2xl text-xs font-black cursor-pointer flex items-center justify-center gap-2 ${
                isCompleted ? 'duo-btn-yellow' : 'duo-btn-green'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isCompleted ? 'تکمیل شده ✓' : 'اتمام درس (+۲۰ XP)'}</span>
            </button>

            {/* Jump to Quiz */}
            <button
              onClick={() => {
                playDuoSound('click');
                onStartQuiz(currentChapter);
              }}
              className="duo-btn-blue px-5 py-3 rounded-2xl text-xs font-black cursor-pointer flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>شروع کوئیز</span>
            </button>
          </div>
        </div>

        {/* Prev / Next Chapter Buttons */}
        <div className="flex items-center justify-between pt-2 gap-2">
          {prevChapter ? (
            <button
              onClick={() => {
                playDuoSound('click');
                onSelectChapter(prevChapter);
              }}
              className="duo-btn-white px-3 sm:px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer max-w-[48%] min-h-[44px]"
            >
              <ChevronRight className="w-4 h-4 shrink-0" />
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
              className="duo-btn-white px-3 sm:px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer max-w-[48%] min-h-[44px]"
            >
              <span className="truncate">
                <span className="sm:hidden">فصل بعد</span>
                <span className="hidden sm:inline">فصل بعدی: {nextChapter.title}</span>
              </span>
              <ChevronLeft className="w-4 h-4 shrink-0" />
            </button>
          )}
        </div>
      </main>
    </div>
  );
};
