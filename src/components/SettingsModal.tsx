import React, { useState, useEffect } from 'react';
import { UserProgress, Section, DifficultyLevel } from '../types/psychology';
import { X, SlidersHorizontal, RotateCcw, Volume2, Sparkles, Pin } from 'lucide-react';
import { DuoMascot } from './DuoMascot';
import { playDuoSound } from '../utils/duoAudio';

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
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4 animate-fadeIn select-none">
      <div className="bg-white border-2 border-b-4 border-slate-200 rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="p-5 border-b-2 border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DuoMascot mood="happy" size={40} animate={false} />
            <h3 className="text-base font-black text-slate-800">تنظیمات روان‌لینگو</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs font-black">
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
