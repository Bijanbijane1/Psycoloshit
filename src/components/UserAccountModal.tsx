/**
 * User Account & Security Modal
 * Project: PsychoMaster (روان‌لینگو) - Phase 5A / Debugged & Enhanced
 */

import React, { useState } from 'react';
import {
  X,
  LogOut,
  ShieldCheck,
  Database,
  Award,
  Flame,
  BookOpen,
  Clock,
  Edit3,
  Check,
  Loader2,
  RefreshCw,
  CloudUpload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { syncProgressToCloud } from '../utils/cloudSync';
import { loadUserProgress } from '../utils/storage';

const AVATAR_OPTIONS = [
  { emoji: '🦉', label: 'جغد دانا' },
  { emoji: '🎓', label: 'فارغ‌التحصیل' },
  { emoji: '🧠', label: 'عصب‌پژوه' },
  { emoji: '👩‍⚕️', label: 'روان‌پزشک' },
  { emoji: '👨‍🎓', label: 'پژوهشگر' },
  { emoji: '📚', label: 'استاد' },
  { emoji: '🏆', label: 'قهرمان لیگ' },
  { emoji: '⭐', label: 'ستاره برتر' },
];

export const UserAccountModal: React.FC = () => {
  const {
    isAccountModalOpen,
    setIsAccountModalOpen,
    currentUser,
    logout,
    updateUserProfile,
    refreshCurrentUser,
    openGoogleSignInModal,
    isLoading,
  } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('🎓');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [syncNowMessage, setSyncNowMessage] = useState<string | null>(null);

  const [d1HealthLoading, setD1HealthLoading] = useState(false);
  const [d1HealthResult, setD1HealthResult] = useState<{
    ok: boolean;
    latencyMs?: number;
    message?: string;
    databaseId?: string;
    totalUsers?: number;
  } | null>(null);

  if (!isAccountModalOpen || !currentUser) return null;

  const handleManualSyncNow = async () => {
    setIsSyncingNow(true);
    setSyncNowMessage(null);
    try {
      const localProg = loadUserProgress(currentUser.userId);
      const synced = await syncProgressToCloud(localProg);
      await refreshCurrentUser();
      if (synced) {
        setSyncNowMessage('اطلاعات پیشرفت و امتیاز شما با موفقیت در دیتابیس ذخیره و همگام‌سازی شد.');
      } else {
        setSyncNowMessage('نشست کاربری از دیتابیس بازخوانی شد.');
      }
      setTimeout(() => setSyncNowMessage(null), 4000);
    } catch {
      setSyncNowMessage('خطا در ارتباط با دیتابیس.');
    } finally {
      setIsSyncingNow(false);
    }
  };

  const handleVerifyD1Health = async () => {
    setD1HealthLoading(true);
    setD1HealthResult(null);
    const start = performance.now();
    try {
      const res = await fetch('/api/d1/health', {
        headers: { 'Cache-Control': 'no-store' },
      });
      const latency = Math.max(1, Math.round(performance.now() - start));
      if (res.ok) {
        const json = await res.json();
        const isWorkerD1 = json.database === 'psychomaster-db' && json.binding === 'DB';
        setD1HealthResult({
          ok: true,
          latencyMs: json.latencyMs || latency,
          message: isWorkerD1
            ? 'اتصال به دیتابیس ابری Cloudflare D1 برقرار است.'
            : 'سرور توسعه (Express) به دیتابیس محلی Node SQLite متصل است (به D1 ابری متصل نیست).',
          databaseId: isWorkerD1 ? 'psychomaster-db (Cloudflare D1)' : (json.storagePath || 'data/psychomaster.sqlite'),
        });
      } else {
        setD1HealthResult({
          ok: false,
          message: `خطای سرور (${res.status}) در بررسی وضعیت دیتابیس`,
        });
      }
    } catch {
      setD1HealthResult({
        ok: false,
        message: 'عدم دسترسی به سرویس دیتابیس یا قطعی شبکه',
      });
    } finally {
      setD1HealthLoading(false);
    }
  };

  const handleStartEdit = () => {
    setEditName(currentUser.name || 'دانشجوی روان‌شناسی');
    setEditAvatar(currentUser.avatar || '🎓');
    setIsEditing(true);
    setProfileSaveSuccess(false);
    setProfileError(null);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      setProfileError('لطفاً نام یا لقب تحصیلی خود را وارد فرمایید.');
      return;
    }
    setIsSavingProfile(true);
    setProfileError(null);
    try {
      const ok = await updateUserProfile(editName.trim(), editAvatar);
      if (ok) {
        setProfileSaveSuccess(true);
        setTimeout(() => {
          setIsEditing(false);
          setProfileSaveSuccess(false);
        }, 800);
      } else {
        setProfileError('خطا در ذخیره تغییرات در پایگاه داده D1.');
      }
    } catch {
      setProfileError('خطای غیرمنتظره در ذخیره اطلاعات.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSwitchAccount = () => {
    setIsAccountModalOpen(false);
    openGoogleSignInModal('signin');
  };

  const showPicture =
    Boolean(currentUser.picture) &&
    !imgError &&
    !currentUser.picture?.includes('default-user');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/65 backdrop-blur-md animate-in fade-in duration-200"
      onClick={() => setIsAccountModalOpen(false)}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col max-h-[92dvh]"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-r from-slate-900 via-indigo-950 to-indigo-900 p-4 sm:p-6 text-white text-right shrink-0">
          <button
            type="button"
            onClick={() => setIsAccountModalOpen(false)}
            className="absolute top-3 left-3 sm:top-4 sm:left-4 p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center"
            title="بستن پنجره"
            aria-label="بستن"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 sm:gap-3.5">
            <div className="relative shrink-0">
              {showPicture ? (
                <img
                  src={currentUser.picture}
                  alt={currentUser.name}
                  onError={() => setImgError(true)}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl border-2 border-indigo-400 shadow-md object-cover bg-slate-800"
                />
              ) : (
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-indigo-600 border-2 border-indigo-400 flex items-center justify-center text-xl sm:text-2xl shadow-md">
                  {currentUser.avatar || '🎓'}
                </div>
              )}
              <span
                className="absolute -bottom-1 -left-1 w-4 h-4 sm:w-5 sm:h-5 bg-emerald-500 rounded-full border-2 border-indigo-950 flex items-center justify-center"
                title="نشست فعال ابری"
              >
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></span>
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 className="text-sm sm:text-lg font-black text-white truncate">{currentUser.name}</h2>
                <span className="text-[9px] sm:text-[10px] font-bold bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full border border-indigo-400/30 shrink-0">
                  Google Verified
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-indigo-200 font-mono mt-0.5 truncate" dir="ltr">
                {currentUser.email || 'حساب کاربری ابری'}
              </p>
            </div>
          </div>
        </div>

        {/* Body Stats & Security */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto text-right">
          {/* Inline Profile Editor Section */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
            {!isEditing ? (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-700 block">مشخصات نمایشی لیگ:</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-lg">{currentUser.avatar || '🎓'}</span>
                    <span className="text-xs font-black text-slate-800">{currentUser.name}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="px-3 py-1.5 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>ویرایش</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800">ویرایش نام و نماد کاربری:</span>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                  >
                    انصراف
                  </button>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    نام یا لقب تحصیلی:
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="مثال: دکتر سارا کیانی"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-base sm:text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1.5">
                    انتخاب نماد و آواتار در جدول لیگ:
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {AVATAR_OPTIONS.map((item) => {
                      const isSel = editAvatar === item.emoji;
                      return (
                        <button
                          key={item.emoji}
                          type="button"
                          onClick={() => setEditAvatar(item.emoji)}
                          className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all min-h-[44px] active:scale-95 ${
                            isSel
                              ? 'border-indigo-600 bg-indigo-50 shadow-2xs scale-102 ring-1 ring-indigo-300'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <span className="text-lg">{item.emoji}</span>
                          <span className="text-[9px] text-slate-600 truncate max-w-full">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {profileError && (
                  <div className="text-[11px] text-rose-600 font-bold bg-rose-50 p-2 rounded-xl border border-rose-200">
                    {profileError}
                  </div>
                )}

                {profileSaveSuccess && (
                  <div className="text-[11px] text-emerald-700 font-bold bg-emerald-50 p-2 rounded-xl border border-emerald-200 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>تغییرات با موفقیت در دیتابیس ثبت گردید!</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={isSavingProfile}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 min-h-[42px] active:scale-98"
                >
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>در حال ذخیره...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>ذخیره تغییرات مشخصات</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <Award className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-slate-500 block truncate">مجموع امتیاز</span>
                <span className="text-xs sm:text-sm font-black text-slate-800">{currentUser.xp} XP</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                <Flame className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-slate-500 block truncate">زنجیره مطالعه</span>
                <span className="text-xs sm:text-sm font-black text-slate-800">{currentUser.streakDays} روز متوالی</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-slate-500 block truncate">فصول تکمیل‌شده</span>
                <span className="text-xs sm:text-sm font-black text-slate-800">
                  {(currentUser.completedChapters || []).length} فصل
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-slate-500 block truncate">زمان مطالعه کل</span>
                <span className="text-xs sm:text-sm font-black text-slate-800">
                  {currentUser.totalStudyMinutes} دقیقه
                </span>
              </div>
            </div>
          </div>

          {/* Cloudflare D1 Sync Status Card */}
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-2xl space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5 text-indigo-900">
                <Database className="w-4 h-4 text-indigo-600" />
                وضعیت پایگاه داده ابری:
              </span>
              <span className="text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                همگام با psychomaster-db (D1)
              </span>
            </div>
            <div className="text-[11px] text-slate-500 flex items-center justify-between">
              <span>آخرین همگام‌سازی:</span>
              <span className="font-mono text-slate-700">
                {new Date(currentUser.lastSyncedAt).toLocaleTimeString('fa-IR')}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 flex items-center justify-between">
              <span>شناسه کاربر دیتابیس:</span>
              <span className="font-mono text-[10px] text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                {currentUser.userId}
              </span>
            </div>

            {/* Manual Sync & Live Remote D1 Verification Actions */}
            <div className="pt-2 border-t border-indigo-100/80 space-y-2">
              <button
                type="button"
                onClick={handleManualSyncNow}
                disabled={isSyncingNow}
                className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 min-h-[38px] active:scale-98 shadow-xs"
              >
                {isSyncingNow ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>در حال ذخیره و همگام‌سازی با دیتابیس...</span>
                  </>
                ) : (
                  <>
                    <CloudUpload className="w-3.5 h-3.5" />
                    <span>ذخیره و همگام‌سازی فوری اطلاعات در دیتابیس</span>
                  </>
                )}
              </button>

              {syncNowMessage && (
                <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold flex items-center gap-1.5 animate-in fade-in">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{syncNowMessage}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleVerifyD1Health}
                disabled={d1HealthLoading}
                className="w-full py-2 px-3 rounded-xl bg-white hover:bg-indigo-100/70 border border-indigo-200 text-indigo-800 text-[11px] font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 min-h-[38px] active:scale-98 shadow-2xs"
              >
                {d1HealthLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    <span>در حال سنجش اتصال زنده دیتابیس D1...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-3.5 h-3.5 text-indigo-600" />
                    <span>اعتبارسنجی اتصال ریموت دیتابیس Cloudflare D1</span>
                  </>
                )}
              </button>

              {d1HealthResult && (
                <div
                  className={`mt-2 p-2.5 rounded-xl border text-[11px] flex items-start gap-2 animate-in fade-in ${
                    d1HealthResult.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full mt-1 shrink-0 ${
                      d1HealthResult.ok ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  />
                  <div className="flex-1">
                    <div className="font-bold flex items-center justify-between">
                      <span>{d1HealthResult.message}</span>
                      {d1HealthResult.latencyMs && (
                        <span className="font-mono text-[10px] bg-white/80 px-1.5 py-0.2 rounded border border-emerald-300">
                          {d1HealthResult.latencyMs}ms
                        </span>
                      )}
                    </div>
                    {d1HealthResult.databaseId && (
                      <div className="text-[10px] font-mono opacity-80 mt-0.5 flex items-center justify-between">
                        <span>D1 UUID: {d1HealthResult.databaseId}</span>
                        {d1HealthResult.totalUsers !== undefined && (
                          <span>کاربران ثبت‌شده: {d1HealthResult.totalUsers}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Security Information */}
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-start gap-2.5 text-slate-600 text-[11px] leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <p>
              نشست شما به صورت رمزنگاری‌شده (SHA-256 Hashed Session) ذخیره شده و از تمامی دستگاه‌های شما قابل بازیابی است.
            </p>
          </div>

          {/* Account Actions: Switch Account & Logout */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={handleSwitchAccount}
              className="w-full py-2.5 px-4 rounded-2xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>ورود با حسابی دیگر (تغییر کاربر گوگل)</span>
            </button>

            <button
              type="button"
              onClick={() => logout()}
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج از حساب کاربری (پایان نشست امن)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
