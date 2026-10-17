import React, { useState, useEffect } from 'react';
import { UserProgress, Section, DifficultyLevel } from '../types/psychology';
import { X, SlidersHorizontal, RotateCcw, Volume2, Sparkles, Pin, Bell, User, ShieldCheck, LogIn, UserPlus } from 'lucide-react';
import { DuoMascot } from './DuoMascot';
import { playDuoSound } from '../utils/duoAudio';
import {
  requestNotificationPermission,
  sendStudyReminderNotification,
  getNotificationPermissionStatus,
} from '../utils/studyNotifications';
import { getUserDisplayName, setUserDisplayName } from '../utils/cloudSync';
import { useAuth } from '../context/AuthContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  progress: UserProgress;
  onUpdateSettings: (newSettings: Partial<UserProgress['customSettings']>) => void;
  sections: Section[];
  onTogglePinChapter: (chapterId: string) => void;
  onResetData: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  progress,
  onUpdateSettings,
  onResetData,
}) => {
  const [confirmReset, setConfirmReset] = useState<boolean>(false);
  const [studentName, setStudentName] = useState<string>(getUserDisplayName());
  const [notifStatus, setNotifStatus] = useState<string>(getNotificationPermissionStatus());
  const { currentUser, isAuthenticated, openGoogleSignInModal, setIsAccountModalOpen } = useAuth();

  useEffect(() => {
    if (!isOpen) {
      setConfirmReset(false);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const { customSettings } = progress;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-2.5 sm:p-4 pb-safe animate-fadeIn select-none">
      <div className="bg-white border-2 border-b-4 border-slate-200 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg max-h-[90dvh] flex flex-col overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b-2 border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <DuoMascot mood="happy" size={38} animate={false} />
            <h3 className="text-base font-black text-slate-800">تنظیمات روان‌لینگو</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center"
            title="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain touch-scroll space-y-4 sm:space-y-5 text-xs font-black pb-safe">
          {/* Account Status Card (Phase 5A) */}
          <div className="p-4 rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50/70 to-slate-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-lg shadow-2xs shrink-0">
                {currentUser?.avatar || '🎓'}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-slate-800">
                    {isAuthenticated && currentUser ? currentUser.name : 'کاربر مهمان (آفلاین)'}
                  </span>
                  {isAuthenticated ? (
                    <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-full border border-emerald-300">
                      D1 متصل
                    </span>
                  ) : (
                    <span className="text-[9px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.2 rounded-full border border-amber-300">
                      مهمان
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 font-medium mt-0.5" dir={isAuthenticated ? 'ltr' : 'rtl'}>
                  {isAuthenticated && currentUser?.email
                    ? currentUser.email
                    : 'پیشرفت شما فقط در این مرورگر ذخیره است'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              {isAuthenticated ? (
                <button
                  onClick={() => {
                    playDuoSound('click');
                    onClose();
                    setIsAccountModalOpen(true);
                  }}
                  className="w-full sm:w-auto px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer text-center"
                >
                  مدیریت حساب
                </button>
              ) : (
                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                  <button
                    onClick={() => {
                      playDuoSound('click');
                      onClose();
                      openGoogleSignInModal('signin');
                    }}
                    className="flex-1 sm:flex-initial px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-1"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>ورود با گوگل</span>
                  </button>
                  <button
                    onClick={() => {
                      playDuoSound('click');
                      onClose();
                      openGoogleSignInModal('signup');
                    }}
                    className="flex-1 sm:flex-initial px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>ساخت اکانت</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* Student Profile Name */}
          <div className="p-3.5 bg-slate-50 border-2 border-slate-200 rounded-2xl flex flex-col gap-2">
            <div className="flex items-center gap-2 text-slate-800">
              <User className="w-4 h-4 text-[#1CB0F6]" />
              <span>نام نمایشی دانشجو در کارنامه و لیگ:</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={studentName}
                onChange={(e) => {
                  setStudentName(e.target.value);
                  setUserDisplayName(e.target.value);
                }}
                placeholder="مثلاً: دکتر علی رضایی"
                className="w-full px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#1CB0F6]"
              />
              <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg shrink-0">
                ذخیره خودکار
              </span>
            </div>
          </div>

          {/* Study Streak Push Notifications */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50 border-2 border-slate-200 rounded-2xl">
            <div className="flex items-center gap-2.5">
              <Bell className="w-5 h-5 text-[#FF9600]" />
              <div>
                <span className="text-slate-800 block">یادآور روزانه زنجیره مطالعه</span>
                <span className="text-[10px] font-bold text-slate-400">
                  ارسال اعلان مرور تست‌ها برای حفظ روزهای متوالی
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={async () => {
                  playDuoSound('click');
                  const granted = await requestNotificationPermission();
                  setNotifStatus(granted ? 'granted' : 'denied');
                  if (granted) {
                    sendStudyReminderNotification({ streakDays: progress.streakDays });
                  }
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all ${
                  notifStatus === 'granted' ? 'duo-btn-green' : 'duo-btn-white text-slate-600'
                }`}
              >
                {notifStatus === 'granted' ? 'فعال ✓' : 'فعال‌سازی'}
              </button>
            </div>
          </div>

          {/* Sound & Audio */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50 border-2 border-slate-200 rounded-2xl">
            <div className="flex items-center gap-2.5">
              <Volume2 className="w-5 h-5 text-[#58CC02]" />
              <div>
                <span className="text-slate-800 block">افکت‌های صوتی Duolingo</span>
                <span className="text-[10px] font-bold text-slate-400">
                  پخش صدای تشویقی هنگام پاسخ درست و پایان آزمون
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                playDuoSound('click');
                onUpdateSettings({ soundEnabled: !customSettings.soundEnabled });
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all ${
                customSettings.soundEnabled ? 'duo-btn-green' : 'duo-btn-white text-slate-400'
              }`}
            >
              {customSettings.soundEnabled ? 'فعال ✓' : 'غیرفعال'}
            </button>
          </div>

          {/* Difficulty Level */}
          <div>
            <label className="text-xs font-black text-slate-700 block mb-2">
              سطح سختی سوالات آزمون:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'basic' as DifficultyLevel, label: 'مبتدی (سبز)' },
                { id: 'intermediate' as DifficultyLevel, label: 'متوسط (آبی)' },
                { id: 'advanced' as DifficultyLevel, label: 'ارشد و بالینی (طلایی)' },
              ].map((lvl) => (
                <button
                  key={lvl.id}
                  onClick={() => {
                    playDuoSound('click');
                    onUpdateSettings({ preferredDifficulty: lvl.id });
                  }}
                  className={`py-2.5 px-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    customSettings.preferredDifficulty === lvl.id
                      ? 'bg-[#E5F6FD] border-2 border-b-4 border-[#1CB0F6] text-[#1899D6]'
                      : 'bg-white border-2 border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {lvl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div>
            <label className="text-xs font-black text-slate-700 block mb-2">اندازه قلم متون:</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'sm' as const, label: 'کوچک' },
                { id: 'md' as const, label: 'استاندارد' },
                { id: 'lg' as const, label: 'بزرگ' },
                { id: 'xl' as const, label: 'بسیار بزرگ' },
              ].map((fs) => (
                <button
                  key={fs.id}
                  onClick={() => {
                    playDuoSound('click');
                    onUpdateSettings({ fontSize: fs.id });
                  }}
                  className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    customSettings.fontSize === fs.id
                      ? 'bg-[#E5F6FD] border-2 border-b-4 border-[#1CB0F6] text-[#1899D6]'
                      : 'bg-white border-2 border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {fs.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reset Progress Section */}
          <div className="pt-4 border-t-2 border-slate-100 flex items-center justify-between">
            {confirmReset ? (
              <div className="flex items-center gap-2 bg-rose-50 p-3 rounded-2xl border-2 border-rose-200 w-full justify-between">
                <span className="text-xs text-rose-700 font-black">
                  آیا تمام امتیازها و زنجیره صفر شود؟
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      onResetData();
                      onClose();
                    }}
                    className="duo-btn-red px-3 py-1 rounded-xl text-xs font-black cursor-pointer"
                  >
                    بله، بازنشانی
                  </button>
                  <button
                    onClick={() => setConfirmReset(false)}
                    className="duo-btn-white px-3 py-1 rounded-xl text-xs font-black cursor-pointer"
                  >
                    انصراف
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                className="text-xs font-black text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>بازنشانی پیشرفت و شروع از ابتدا</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
