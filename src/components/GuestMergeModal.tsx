/**
 * Guest Progress Merge Prompt Modal
 * Project: PsychoMaster (روان‌لینگو) - Phase 5A
 */

import React from 'react';
import { GitMerge, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const GuestMergeModal: React.FC = () => {
  const { isMergeModalOpen, pendingMergeData, mergeGuestProgress, skipMerge, isLoading } = useAuth();

  if (!isMergeModalOpen || !pendingMergeData) return null;

  const guestProgress = pendingMergeData.guestProgress || {};
  const guestXp = (guestProgress.totalStudyMinutes || 0) * 15 + (guestProgress.completedChapters?.length || 0) * 50;
  const completedChaptersCount = (guestProgress.completedChapters || []).length;
  const streakDays = guestProgress.streakDays || 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 pb-safe bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-indigo-100 overflow-hidden flex flex-col max-h-[92dvh] overflow-y-auto overscroll-contain touch-scroll"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-950 p-4 sm:p-6 text-white text-right shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center shadow-inner shrink-0">
              <GitMerge className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-200" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">ادغام پیشرفت مهمان با حساب گوگل</h2>
              <p className="text-[11px] sm:text-xs text-indigo-200 mt-0.5">انتقال امتیازات آفلاین به حساب دائم ابری</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-3.5 sm:space-y-4 pb-safe">
          <p className="text-xs text-slate-600 leading-relaxed">
            شما پیش از ورود با حساب گوگل، فعالیت‌های مطالعاتی و آزمونی در حالت مهمان ثبت کرده‌اید. آیا مایلید این پیشرفت به حساب جدید گوگل شما منتقل شود؟
          </p>

          {/* Progress summary card */}
          <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-white rounded-xl shadow-2xs">
              <span className="block text-xs text-slate-500">امتیاز مهمان</span>
              <span className="text-base font-black text-indigo-600">+{guestXp} XP</span>
            </div>
            <div className="p-2 bg-white rounded-xl shadow-2xs">
              <span className="block text-xs text-slate-500">سرفصل‌های طی‌شده</span>
              <span className="text-base font-black text-slate-800">{completedChaptersCount} فصل</span>
            </div>
            <div className="p-2 bg-white rounded-xl shadow-2xs">
              <span className="block text-xs text-slate-500">زنجیره مطالعه</span>
              <span className="text-base font-black text-amber-600">{streakDays} روز</span>
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-2xl flex items-start gap-2.5 text-[11px] text-amber-800 leading-relaxed">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              در صورت تایید، امتیازات به صورت اتمیک در دفترکل دیتابیس D1 ذخیره شده و از رتبه لیگ شما کسر نخواهد شد.
            </span>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <button
              onClick={() => mergeGuestProgress()}
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-indigo-200" />
              <span>(پیشنهادی) تایید ادغام و ذخیره دائمی پیشرفت</span>
            </button>

            <button
              onClick={skipMerge}
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>شروع به عنوان حساب جدید بدون ادغام</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
