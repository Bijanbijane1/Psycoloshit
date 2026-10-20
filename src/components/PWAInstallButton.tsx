import React, { useState } from 'react';
import { usePWAInstall } from '../utils/usePWAInstall';
import { Download, Share2, PlusSquare, X, CheckCircle2, WifiOff, Smartphone } from 'lucide-react';
import { playDuoSound } from '../utils/duoAudio';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'sheet';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'compact' }) => {
  const { isInstallable, isInstalled, isIOS, isOffline, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If running already in standalone mode, display a subtle offline badge if offline
  if (isInstalled) {
    if (isOffline) {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFF0C8] border border-[#E5A33D]/50 text-[#5C3D0E] text-xs font-extrabold min-h-[44px]">
          <WifiOff className="w-3.5 h-3.5 text-[#C98A27]" />
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
      {variant === 'sheet' ? (
        <button
          onClick={handleInstallClick}
          className="w-full py-2.5 px-3.5 rounded-xl bg-[#DDF3E9]/70 hover:bg-[#DDF3E9] text-[#134E4A] text-xs font-extrabold flex items-center justify-between cursor-pointer border border-[#149D9A]/35 min-h-[48px] transition-colors"
          title="نصب وب‌اپلیکیشن روان‌مستر (نسخه آفلاین)"
          aria-label="نصب وب‌اپلیکیشن روان‌مستر روی دستگاه"
        >
          <div className="flex items-center gap-2.5">
            <Download className="w-4 h-4 text-[#149D9A] shrink-0" />
            <span>نصب نسخه وب‌اپلیکیشن (دسترسی آفلاین)</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white text-[#149D9A] border border-[#149D9A]/25">
            نصب PWA
          </span>
        </button>
      ) : (
        <button
          onClick={handleInstallClick}
          className="editorial-btn-leaf px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#389D77]"
          title="نصب اپلیکیشن روی دستگاه (PWA آفلاین)"
          aria-label="نصب اپلیکیشن روی گوشی یا دسکتاپ"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">نصب برنامه آفلاین</span>
          <span className="sm:hidden">نصب</span>
        </button>
      )}

      {/* iOS / General Safari Install Guidance Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#24243B]/60 backdrop-blur-xs animate-fadeIn select-none">
          <div className="bg-white border border-[#E5E1EB] rounded-3xl p-5 sm:p-6 max-w-sm w-full text-right shadow-2xl relative animate-scaleUp">
            <button
              onClick={() => setShowIOSGuide(false)}
              className="absolute top-3.5 left-3.5 p-2 rounded-xl text-[#69697E] hover:text-[#24243B] hover:bg-[#F7F5F0] transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="بستن راهنمای نصب"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4 pl-10">
              <div className="w-12 h-12 rounded-2xl bg-[#EAE4FF] border border-[#7056D8]/25 text-[#7056D8] flex items-center justify-center shrink-0">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black text-[#24243B]">
                  نصب «روان‌مستر» روی صفحه اصلی
                </h3>
                <span className="text-[11px] font-bold text-[#69697E]">
                  دسترسی سریع و مطالعه ۱۰۰٪ آفلاین
                </span>
              </div>
            </div>

            <div className="space-y-3 my-4 text-xs font-bold text-[#24243B] leading-relaxed bg-[#F7F5F0] p-4 rounded-2xl border border-[#E5E1EB]">
              <div className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#7056D8] text-white flex items-center justify-center text-xs font-extrabold shrink-0">
                  ۱
                </span>
                <p>
                  در نوار مرورگر دکمه <span className="font-extrabold text-[#36345F]">Share (اشتراک‌گذاری)</span> را انتخاب کنید:
                  <Share2 className="w-4 h-4 inline-block mx-1 text-[#3976E4]" />
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#7056D8] text-white flex items-center justify-center text-xs font-extrabold shrink-0">
                  ۲
                </span>
                <p>
                  گزینه <span className="font-extrabold text-[#36345F]">Add to Home Screen (افزودن به صفحه اصلی)</span> را بزنید:
                  <PlusSquare className="w-4 h-4 inline-block mx-1 text-[#149D9A]" />
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#7056D8] text-white flex items-center justify-center text-xs font-extrabold shrink-0">
                  ۳
                </span>
                <p>
                  اکنون آیکون روان‌مستر در صفحه اصلی دستگاه شما قرار دارد و بدون نیاز به اینترنت قابل استفاده است.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="editorial-btn-primary w-full py-3 rounded-2xl text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1.5 min-h-[48px]"
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

