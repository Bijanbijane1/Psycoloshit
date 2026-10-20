import React, { Component, ErrorInfo, ReactNode } from 'react';
import { WifiOff, RotateCcw, AlertTriangle } from 'lucide-react';

interface OfflineSafeErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface OfflineSafeErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Catches dynamic chunk import failures or render errors (especially when switching views offline)
 * and renders a clean Persian retry card instead of a blank screen.
 */
export class OfflineSafeErrorBoundary extends Component<
  OfflineSafeErrorBoundaryProps,
  OfflineSafeErrorBoundaryState
> {
  constructor(props: OfflineSafeErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): OfflineSafeErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'خطا در بارگذاری بخش مورد نظر',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('OfflineSafeErrorBoundary caught error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      const isOfflineError =
        typeof navigator !== 'undefined' &&
        (!navigator.onLine ||
          /Loading chunk|Failed to fetch dynamically imported module|NetworkError/i.test(
            this.state.errorMessage
          ));

      return (
        <div
          dir="rtl"
          className="my-6 max-w-lg mx-auto bg-white border-2 border-b-4 border-amber-300 rounded-3xl p-6 text-right shadow-sm space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
              {isOfflineError ? (
                <WifiOff className="w-6 h-6" />
              ) : (
                <AlertTriangle className="w-6 h-6" />
              )}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900">
                {this.props.fallbackTitle ||
                  (isOfflineError
                    ? 'حالت مطالعه آفلاین — نیاز به بازخوانی بخش'
                    : 'خطای موقت در نمایش این بخش')}
              </h3>
              <p className="text-xs font-bold text-slate-500 mt-0.5 leading-relaxed">
                {isOfflineError
                  ? 'در حال حاضر اتصال اینترنت برقرار نیست یا بارگذاری ماژول با وقفه مواجه شد. اطلاعات مطالعه شما در حافظه محلی کاملاً محفوظ است.'
                  : 'مشکلی در بارگذاری این نما رخ داد. پیشرفت شما در حافظه دستگاه محفوظ است.'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={this.handleRetry}
              className="duo-btn-green px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>تلاش مجدد بارگذاری</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
