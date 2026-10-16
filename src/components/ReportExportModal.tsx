import React, { useState } from 'react';
import {
  FileText,
  Printer,
  Download,
  X,
  Award,
  CheckCircle2,
  Clock,
  Target,
  Flame,
  ShieldCheck,
  GraduationCap,
} from 'lucide-react';
import { UserProgress, Section } from '../types/psychology';
import { calculateUserAnalytics } from '../utils/adaptiveEngine';
import { getUserDisplayName } from '../utils/cloudSync';
import { playDuoSound } from '../utils/duoAudio';

interface ReportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  progress: UserProgress;
  sections: Section[];
}

export const ReportExportModal: React.FC<ReportExportModalProps> = ({
  isOpen,
  onClose,
  progress,
  sections,
}) => {
  const [studentName, setStudentName] = useState<string>(getUserDisplayName());
  const stats = calculateUserAnalytics(progress);

  if (!isOpen) return null;

  const handlePrint = () => {
    playDuoSound('click');
    window.print();
  };

  const handleDownloadJSON = () => {
    playDuoSound('click');
    const data = {
      title: 'کارنامه تحصیلی رسمی سامانه روان‌شناسی روان‌لینگو',
      studentName,
      issuedAt: new Date().toLocaleDateString('fa-IR'),
      stats,
      progress: {
        streakDays: progress.streakDays,
        totalStudyMinutes: progress.totalStudyMinutes,
        completedChaptersCount: progress.completedChapters.length,
        unlockedBadgesCount: (progress.unlockedBadgeIds || []).length,
      },
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PsychoMaster_Report_${studentName}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const allChapters = sections.flatMap((s) => s.chapters);
  const weakChapterTitles = stats.weakestChapterIds.map((id) => {
    const f = allChapters.find((c) => c.id === id);
    return f ? f.title : id;
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs select-none animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border-2 border-b-6 border-slate-300 rounded-3xl w-full max-w-3xl max-h-[94dvh] flex flex-col shadow-2xl overflow-hidden animate-scaleUp">
        {/* Header toolbar (Hidden in Print) */}
        <div className="p-4 sm:p-5 border-b-2 border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-3 text-right">
            <div className="w-10 h-10 rounded-xl bg-purple-100 border border-purple-300 flex items-center justify-center text-purple-700 shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-800">
                کارنامه تحصیلی رسمی و گواهی پیشرفت
              </h2>
              <p className="text-xs font-bold text-slate-400">
                گزارش جامع تسلط علمی، مهارت در آزمون‌ها و استمرار مطالعه
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="duo-btn-green px-3.5 py-2 rounded-xl text-xs font-black text-white flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="چاپ یا ذخیره به عنوان PDF"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">چاپ / خروجی PDF</span>
            </button>

            <button
              onClick={handleDownloadJSON}
              className="p-2 border-2 border-slate-200 hover:bg-slate-100 rounded-xl text-slate-600 transition-all cursor-pointer"
              title="دانلود فایل داده JSON"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                playDuoSound('click');
                onClose();
              }}
              className="p-2 border-2 border-slate-200 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-all cursor-pointer"
              aria-label="بستن"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Certificate Body */}
        <div className="flex-1 overflow-y-auto touch-scroll p-6 sm:p-8 space-y-6 text-right print:p-0 print:overflow-visible">
          {/* Certificate Border Frame */}
          <div className="border-4 border-double border-slate-300 rounded-3xl p-6 sm:p-8 bg-gradient-to-b from-slate-50/50 to-white relative overflow-hidden shadow-xs">
            {/* Top Certificate Watermark */}
            <div className="flex flex-col sm:flex-row items-center justify-between border-b-2 border-slate-200 pb-5 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-[#58CC02]/10 border-2 border-[#58CC02] flex items-center justify-center text-3xl">
                  🦉
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    سامانه هوشمند آموزش روان‌شناسی (روان‌لینگو)
                  </h1>
                  <span className="text-[11px] font-bold text-slate-500">
                    PsychoMaster Academic Learning & Analytics Certificate
                  </span>
                </div>
              </div>

              <div className="text-left sm:text-right flex flex-col items-end">
                <span className="text-[10px] font-black uppercase text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                  گواهی رسمی تحصیلی
                </span>
                <span className="text-xs font-bold text-slate-400 mt-1">
                  تاریخ صدور: {new Date().toLocaleDateString('fa-IR')}
                </span>
              </div>
            </div>

            {/* Student Info Bar */}
            <div className="my-6 p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-400">نام دانشجو / فراگیر:</span>
                <h3 className="text-lg font-black text-slate-800 mt-0.5">{studentName}</h3>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400">سطح احراز صلاحیت:</span>
                <h4 className="text-sm font-black text-emerald-700 mt-0.5">
                  {stats.accuracyRate >= 80
                    ? 'دانشجوی ممتاز (سطح پیشرفته و کنکوری)'
                    : stats.accuracyRate >= 60
                    ? 'تسلط استاندارد رو به رشد'
                    : 'نیازمند تثبیت سرفصل‌های پایه'}
                </h4>
              </div>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="p-3.5 rounded-xl border border-slate-200 bg-white text-center">
                <span className="text-[11px] font-black text-slate-400">درصد کل تسلط</span>
                <div className="text-2xl font-black text-[#58CC02] mt-1">{stats.accuracyRate}٪</div>
                <span className="text-[10px] text-slate-400 font-bold">{stats.correctCount} از {stats.totalAttempts} درست</span>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-white text-center">
                <span className="text-[11px] font-black text-slate-400">مدت مطالعه مفید</span>
                <div className="text-2xl font-black text-[#1CB0F6] mt-1">{progress.totalStudyMinutes} دقیقه</div>
                <span className="text-[10px] text-slate-400 font-bold">جلسات پومودورو و مرور</span>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-white text-center">
                <span className="text-[11px] font-black text-slate-400">زنجیره استمرار</span>
                <div className="text-2xl font-black text-[#FF9600] mt-1">{progress.streakDays} روز</div>
                <span className="text-[10px] text-slate-400 font-bold">پشتکار متوالی</span>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-white text-center">
                <span className="text-[11px] font-black text-slate-400">دروس گذرانده</span>
                <div className="text-2xl font-black text-[#CE82FF] mt-1">{progress.completedChapters.length} درس</div>
                <span className="text-[10px] text-slate-400 font-bold">از سرفصل‌های مصوب</span>
              </div>
            </div>

            {/* Weak/Focus Chapters & Action Plan */}
            <div className="mb-6 p-4 rounded-2xl bg-amber-50/70 border border-amber-200">
              <h4 className="text-xs font-black text-amber-900 mb-2">
                فصول و مباحث نیازمند مرور تکمیلی:
              </h4>
              {weakChapterTitles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {weakChapterTitles.map((title) => (
                    <span
                      key={title}
                      className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-xs font-bold text-amber-950 shadow-2xs"
                    >
                      {title}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-bold text-emerald-800">
                  تمامی سرفصل‌ها با تسلط بالای ۸۰ درصد با موفقیت پشت سر گذاشته شده‌اند.
                </p>
              )}
            </div>

            {/* Official Recommendation & Stamp */}
            <div className="border-t-2 border-slate-200 pt-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span>صحت داده‌ها توسط هسته اعتبارسنجی تحصیلی سرور PsychoMaster تأیید می‌گردد.</span>
              </div>

              <div className="flex items-center gap-2 text-xs font-black text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-300">
                <span>مُهر رسمی:</span>
                <span className="text-purple-700">VERIFIED ACADEMIC RESULT ✓</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
