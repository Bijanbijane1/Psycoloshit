import React, { useState } from 'react';
import { usePWAInstall } from '../utils/usePWAInstall';
import { Download, Share2, PlusSquare, X, CheckCircle2, WifiOff } from 'lucide-react';
import { DuoMascot } from './DuoMascot';
import { playDuoSound } from '../utils/duoAudio';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isOffline, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If running already in standalone mode, display a subtle offline badge if offline
  if (isInstalled) {
    if (isOffline) {
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-black shadow-2xs">
          <WifiOff className="w-3.5 h-3.5 text-amber-600" />
          <span>آفلاین (کتابخانه در دسترس)</span>
        </div>
      );
    }
    return null;
  }

  const handleInstallClick = async () => {
    playDuoSound('click');
    if (isInstallable) {
      await install();
    } else if (isIOS) {
      setShowIOSGuide(true);
    } else {
      // General instructions fallback
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      <button
        onClick={handleInstallClick}
        className="duo-btn-green px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs focus-visible:ring-2 focus-visible:ring-[#58CC02]"
        title="نصب اپلیکیشن روی دستگاه (PWA آفلاین)"
        aria-label="نصب اپلیکیشن روی گوشی یا دسکتاپ"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">نصب برنامه آفلاین</span>
        <span className="sm:hidden">نصب</span>
      </button>

      {/* iOS / General Safari Install Guidance Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs animate-fadeIn select-none">
          <div className="bg-white border-2 border-b-6 border-slate-300 rounded-3xl p-6 max-w-sm w-full text-right shadow-2xl relative animate-scaleUp">
            <button
              onClick={() => setShowIOSGuide(false)}
              className="absolute top-4 left-4 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <DuoMascot mood="happy" size={48} animate={false} />
              <div>
                <h3 className="text-base font-black text-slate-800">
                  نصب «روان‌لینگو» روی صفحه اصلی
                </h3>
                <span className="text-[11px] font-bold text-slate-400">
                  دسترسی همیشگی و ۱۰۰٪ آفلاین
                </span>
              </div>
            </div>

            <div className="space-y-3 my-4 text-xs font-bold text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#58CC02] text-white flex items-center justify-center text-xs font-black shrink-0">
                  ۱
                </span>
                <p>
                  در نوار پایین یا بالای مرورگر دکمه <span className="font-black text-slate-900">Share (اشتراک‌گذاری)</span> را انتخاب کنید:
                  <Share2 className="w-4 h-4 inline-block mx-1 text-sky-600" />
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#58CC02] text-white flex items-center justify-center text-xs font-black shrink-0">
                  ۲
                </span>
                <p>
                  گزینه <span className="font-black text-slate-900">Add to Home Screen (افزودن به صفحه اصلی)</span> را بزنید:
                  <PlusSquare className="w-4 h-4 inline-block mx-1 text-emerald-600" />
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#58CC02] text-white flex items-center justify-center text-xs font-black shrink-0">
                  ۳
                </span>
                <p>
                  حالا آیکون روان‌لینگو در لیست برنامه‌های شما قرار دارد و بدون نیاز به اینترنت اجرا می‌شود!
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="duo-btn-green w-full py-3 rounded-2xl text-xs font-black cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>متوجه شدم</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
