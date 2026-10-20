/**
 * Persian Digit Formatting & RTL Safe Text Utilities (Phase 7)
 *
 * Hard Rule:
 * - `toPersianDigits` is strictly for UI display rendering ONLY.
 * - NEVER pass Persian digits into API payloads, URL query strings, localStorage keys/numeric values,
 *   numeric calculations, or DOM id attributes.
 */

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;

/**
 * Converts ASCII digits (0-9) and Arabic-Indic digits (٠-٩) into Persian digits (۰-۹) for display.
 */
export function toPersianDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return str
    .replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d)
    .replace(/[\u0660-\u0669]/g, (d) => PERSIAN_DIGITS[d.charCodeAt(0) - 0x0660] ?? d);
}

/**
 * Ensures any Persian (۰-۹) or Arabic-Indic (٠-٩) digits are converted to standard ASCII (0-9).
 * Useful as a defensive guard before building API payloads or URL query parameters.
 */
export function toEnglishDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/**
 * Sanitizes AI-generated or user-supplied text for safe RTL rendering without XSS or control-char risks.
 */
export function sanitizeRtlText(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/\uFFFD/g, '')
    .trim();
}

