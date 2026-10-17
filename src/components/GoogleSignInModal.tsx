/**
 * Cryptographically Verified Google Identity Services (GIS) Authentication Modal
 * Project: PsychoMaster (روان‌لینگو) - Phase 5C Security Hardening
 *
 * Security invariants:
 * - Requires a real Google-issued RS256 ID token (`credential`) from Google Identity Services.
 * - Binds the GIS sign-in request to a server-issued nonce (`GET /api/auth/nonce`).
 * - Never exposes registered accounts, never accepts manual email entry, and never synthesizes Google IDs.
 * - Fails closed with a clear configuration message if GOOGLE_CLIENT_ID / VITE_GOOGLE_CLIENT_ID is missing.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';

interface GoogleSignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
}

export const GoogleSignInModal: React.FC<GoogleSignInModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { loginWithGoogle, isLoading } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isInitializingGis, setIsInitializingGis] = useState<boolean>(false);
  const [missingClientIdConfig, setMissingClientIdConfig] = useState<boolean>(false);
  const gisButtonRef = useRef<HTMLDivElement>(null);

  const rawClientId = ((import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '').trim();
  const isClientConfigured = Boolean(
    rawClientId &&
      rawClientId !== 'MY_GOOGLE_CLIENT_ID' &&
      rawClientId !== 'YOUR_GOOGLE_CLIENT_ID'
  );

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setErrorMessage(null);
    setSuccessMessage(null);
    setMissingClientIdConfig(!isClientConfigured);

    const setupGoogleIdentityServices = async () => {
      setIsInitializingGis(true);
      try {
        const nonceResp = await authService.fetchAuthNonce();
        if (cancelled) return;

        if (!isClientConfigured || nonceResp.clientIdConfigured === false) {
          setMissingClientIdConfig(true);
          return;
        }

        const googleAccountsId = (window as any).google?.accounts?.id;
        if (!googleAccountsId || !gisButtonRef.current) {
          setErrorMessage(
            'کتابخانه رسمی Google Identity Services بارگذاری نشد. لطفاً اتصال اینترنت و دسترسی به accounts.google.com را بررسی فرمایید.'
          );
          return;
        }

        const serverNonce = nonceResp.nonce;
        googleAccountsId.initialize({
          client_id: rawClientId,
          nonce: serverNonce,
          callback: async (resp: { credential?: string }) => {
            if (!resp?.credential) {
              setErrorMessage('توکن معتبر از سرویس گوگل دریافت نشد.');
              return;
            }
            setErrorMessage(null);
            const res = await loginWithGoogle({
              credential: resp.credential,
              expectedNonce: serverNonce,
            });
            if (res.ok) {
              setSuccessMessage(
                res.isNew
                  ? `حساب کاربری شما (${res.user?.email}) با تایید رمزنگاری گوگل ایجاد شد!`
                  : `خوش آمدید «${res.user?.name}»! نشست امن شما برقرار شد.`
              );
              setTimeout(() => onClose(), 700);
            } else {
              setErrorMessage(
                res.error || 'تایید امضای دیجیتال توکن گوگل در سرور ناموفق بود.'
              );
            }
          },
        });

        gisButtonRef.current.innerHTML = '';
        googleAccountsId.renderButton(gisButtonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          locale: 'fa',
          width: 320,
        });
      } catch (err) {
        console.warn('GIS initialization error:', err);
        if (!cancelled) {
          setErrorMessage('خطا در راه‌اندازی احراز هویت رسمی گوگل.');
        }
      } finally {
        if (!cancelled) {
          setIsInitializingGis(false);
        }
      }
    };

    setupGoogleIdentityServices();

    return () => {
      cancelled = true;
    };
  }, [isOpen, isClientConfigured, rawClientId, loginWithGoogle, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/65 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
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
            onClick={onClose}
            className="absolute top-3 left-3 sm:top-4 sm:left-4 p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center"
            title="بستن پنجره"
            aria-label="بستن پنجره"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white p-2 flex items-center justify-center shadow-lg shrink-0">
              <svg className="w-7 h-7 sm:w-8 sm:h-8" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-base sm:text-xl font-black tracking-tight text-white">
                احراز هویت امن با گوگل (OAuth 2.0)
              </h2>
              <p className="text-[11px] sm:text-xs text-indigo-200 mt-0.5">
                بررسی رمزنگاری‌شده امضای توکن گوگل در سمت سرور
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-right">
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 font-bold leading-relaxed">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {missingClientIdConfig ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2.5 text-amber-900">
              <div className="flex items-center gap-2 font-black text-xs sm:text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>نیاز به پیکربندی شناسه کلاینت گوگل (Fail-Closed)</span>
              </div>
              <p className="text-xs leading-relaxed text-amber-800">
                برای فعال‌سازی ورود امن با گوگل، متغیرهای محیطی{' '}
                <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded" dir="ltr">
                  GOOGLE_CLIENT_ID
                </code>{' '}
                و{' '}
                <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded" dir="ltr">
                  VITE_GOOGLE_CLIENT_ID
                </code>{' '}
                باید با شناسه OAuth 2.0 Web Client پروژه Google Cloud شما تنظیم شوند.
              </p>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                به‌منظور حفظ امنیت حساب‌های کاربری، ورود بدون توکن امضاشده گوگل (ورود صرفاً با ایمیل) غیرفعال است.
              </p>
            </div>
          ) : (
            <div className="py-4 flex flex-col items-center justify-center space-y-4">
              <p className="text-xs sm:text-sm text-slate-700 font-bold text-center leading-relaxed">
                جهت ورود یا ایجاد حساب کاربری، از دکمه رسمی Google در زیر استفاده نمایید:
              </p>

              {(isInitializingGis || isLoading) && (
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>در حال برقراری ارتباط رمزنگاری‌شده با سرور...</span>
                </div>
              )}

              <div
                ref={gisButtonRef}
                className="flex justify-center min-h-[44px]"
              />
            </div>
          )}

          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2 text-slate-600 text-[11px] leading-relaxed">
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <Lock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>استانداردهای امنیتی فعال (Phase 5C):</span>
            </div>
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p>
                توکن هویتی گوگل با کلیدهای عمومی رسمی (JWKS RS256)، صادرکننده، مخاطب، زمان انقضا، تایید ایمیل و Nonce در سرور اعتبارسنجی می‌شود و نشست کاربری در کوکی امن{' '}
                <code className="font-mono text-[10px]" dir="ltr">
                  HttpOnly
                </code>{' '}
                ذخیره می‌گردد.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
