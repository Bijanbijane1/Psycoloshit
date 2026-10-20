import React, { useState, useEffect } from 'react';
import {
  Printer,
  Download,
  X,
  ShieldCheck,
  AlertTriangle,
  GraduationCap,
} from 'lucide-react';
import { UserProgress, Section } from '../types/psychology';
import { calculateUserAnalytics } from '../utils/adaptiveEngine';
import { getUserDisplayName } from '../utils/cloudSync';
import { playDuoSound } from '../utils/duoAudio';

interface ServerStudentReport {
  studentName: string;
  generatedAt: string;
  verified: boolean;
  isServerVerified: boolean;
  verificationStatus: 'server-verified' | 'unverified-client-reported';
  dataSource: 'server-authoritative' | 'client-self-reported';
  verifiedXp: number;
  verifiedStagesCount: number;
  overallMastery: string;
  accuracyRate: string;
  totalStudyMinutes: number;
  streakDays: number;
  completedChaptersCount: number;
  unlockedBadgesCount: number;
  levelStatus: string;
  weakestChapters: string[];
  recommendation: string;
  verificationStamp: string;
}

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
  const [studentName] = useState<string>(getUserDisplayName());
  const [serverReport, setServerReport] = useState<ServerStudentReport | null>(null);
  const stats = calculateUserAnalytics(progress);

  const allChapters = sections.flatMap((s) => s.chapters);
  const weakChapterTitles = stats.weakestChapterIds.map((id) => {
    const f = allChapters.find((c) => c.id === id);
    return f ? f.title : id;
  });

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    fetch('/api/reports/student-summary', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: studentName,
        stats: {
          overallMastery: stats.overallMastery,
          accuracyRate: stats.accuracyRate,
        },
        progress: {
          totalStudyMinutes: progress.totalStudyMinutes,
          streakDays: progress.streakDays,
          completedChapters: progress.completedChapters,
          unlockedBadgeIds: progress.unlockedBadgeIds || [],
        },
        weakestChapters: weakChapterTitles,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.report) {
          setServerReport(json.report as ServerStudentReport);
        }
      })
      .catch(() => {
        if (!cancelled) setServerReport(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, studentName, progress]);

  if (!isOpen) return null;

  const isVerified = Boolean(serverReport?.verified);
  const displayStudentName = serverReport?.studentName || studentName;
  const displayAccuracy = serverReport?.accuracyRate || `${stats.accuracyRate}٪`;
  const displayStudyMinutes = serverReport?.totalStudyMinutes ?? progress.totalStudyMinutes;
  const displayStreakDays = serverReport?.streakDays ?? progress.streakDays;
  const displayCompletedChapters =
    serverReport?.completedChaptersCount ?? progress.completedChapters.length;

  const handlePrint = () => {
    playDuoSound('click');
    window.print();
  };

  const handleDownloadJSON = () => {
    playDuoSound('click');
    const data = {
      title: isVerified
        ? 'کارنامه تحصیلی تأییدشده سامانه روان‌شناسی روان‌لینگو'
        : 'پیش‌نمایش خوداظهاری محلی (تأییدنشده توسط سرور) — روان‌لینگو',
      verified: isVerified,
      verificationStatus: serverReport?.verificationStatus || 'unverified-client-reported',
      dataSource: serverReport?.dataSource || 'client-self-reported',
      verificationStamp:
        serverReport?.verificationStamp ||
        'گزارش خوداظهاری محلی — تأییدنشده توسط سرور (Unverified Client-Supplied Data)',
      studentName: displayStudentName,
      issuedAt: serverReport?.generatedAt || new Date().toLocaleDateString('fa-IR'),
      metrics: {
        accuracyRate: displayAccuracy,
        overallMastery: serverReport?.overallMastery || `${stats.overallMastery}٪`,
        totalStudyMinutes: displayStudyMinutes,
        streakDays: displayStreakDays,
        completedChaptersCount: displayCompletedChapters,
        verifiedXp: serverReport?.verifiedXp ?? 0,
        verifiedStagesCount: serverReport?.verifiedStagesCount ?? 0,
      },
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PsychoMaster_Report_${displayStudentName}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
                کارنامه تحصیلی و گزارش پیشرفت
              </h2>
              <p className="text-xs font-bold text-slate-400">
                {isVerified
                  ? 'بر اساس سوابق تأییدشده در پایگاه داده سرور'
                  : 'پیش‌نمایش محلی مرورگر (نیازمند ثبت مرحله در سرور جهت تأیید رسمی)'}
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
                    PsychoMaster Academic Learning & Progress Report
                  </span>
                </div>
              </div>

              <div className="text-left sm:text-right flex flex-col items-end">
                <span
                  className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                    isVerified
                      ? 'text-emerald-800 bg-emerald-100 border border-emerald-300'
                      : 'text-amber-800 bg-amber-100 border border-amber-300'
                  }`}
                >
                  {isVerified ? 'تأییدشده در سرور' : 'پیش‌نمایش خوداظهاری محلی'}
                </span>
                <span className="text-xs font-bold text-slate-400 mt-1">
                  تاریخ صدور: {serverReport?.generatedAt || new Date().toLocaleDateString('fa-IR')}
                </span>
              </div>
            </div>

            {/* Student Info Bar */}
            <div className="my-6 p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-400">نام دانشجو / فراگیر:</span>
                <h3 className="text-lg font-black text-slate-800 mt-0.5">{displayStudentName}</h3>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400">وضعیت ارزیابی:</span>
                <h4 className="text-sm font-black text-emerald-700 mt-0.5">
                  {serverReport?.levelStatus ||
                    (stats.accuracyRate >= 80
                      ? 'پیشرفته (خوداظهاری — تأییدنشده)'
                      : stats.accuracyRate >= 60
                      ? 'استاندارد رو به رشد (خوداظهاری — تأییدنشده)'
                      : 'نیازمند تثبیت سرفصل‌های پایه (خوداظهاری — تأییدنشده)')}
                </h4>
              </div>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="p-3.5 rounded-xl border border-slate-200 bg-white text-center">
                <span className="text-[11px] font-black text-slate-400">درصد دقت آزمون</span>
                <div className="text-2xl font-black text-[#58CC02] mt-1">{displayAccuracy}</div>
                <span className="text-[10px] text-slate-400 font-bold">
                  {isVerified
                    ? `${serverReport?.verifiedStagesCount || 0} مرحله تأییدشده`
                    : 'پیش‌نمایش محلی مرورگر'}
                </span>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-white text-center">
                <span className="text-[11px] font-black text-slate-400">مدت مطالعه مفید</span>
                <div className="text-2xl font-black text-[#1CB0F6] mt-1">{displayStudyMinutes} دقیقه</div>
                <span className="text-[10px] text-slate-400 font-bold">جلسات پومودورو و مرور</span>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-white text-center">
                <span className="text-[11px] font-black text-slate-400">زنجیره استمرار</span>
                <div className="text-2xl font-black text-[#FF9600] mt-1">{displayStreakDays} روز</div>
                <span className="text-[10px] text-slate-400 font-bold">پشتکار متوالی</span>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-white text-center">
                <span className="text-[11px] font-black text-slate-400">دروس گذرانده</span>
                <div className="text-2xl font-black text-[#CE82FF] mt-1">{displayCompletedChapters} درس</div>
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
                  {serverReport?.recommendation ||
                    'پیشنهاد می‌شود برای ثبت کارنامه رسمی، مراحل آزمون را تکمیل نمایید.'}
                </p>
              )}
            </div>

            {/* Truthful Verification Stamp */}
            <div className="border-t-2 border-slate-200 pt-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                {isVerified ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                )}
                <span>
                  {serverReport?.verificationStamp ||
                    'گزارش خوداظهاری محلی — تأییدنشده توسط سرور (Unverified Client-Supplied Data)'}
                </span>
              </div>

              <div
                className={`flex items-center gap-2 text-xs font-black px-3 py-1.5 rounded-xl border ${
                  isVerified
                    ? 'text-emerald-800 bg-emerald-50 border-emerald-300'
                    : 'text-amber-800 bg-amber-50 border-amber-300'
                }`}
              >
                <span>وضعیت اعتبارسنجی:</span>
                <span>{isVerified ? 'SERVER-VERIFIED RECORD ✓' : 'UNVERIFIED LOCAL PREVIEW'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
