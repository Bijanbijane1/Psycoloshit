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

/**
 * Normalizes Persian, Arabic, and English search strings:
 * - Unifies Arabic/Persian Yeh (ي, ی, ئ, ى -> ی) and Kaf (ك, ک -> ک)
 * - Unifies Teh Marbuta (ة -> ه) and Alef variants (أ, إ, آ, ٱ -> ا)
 * - Removes Arabic diacritics (tashkeel) and tatweel (ـ)
 * - Converts ZWNJ (نیم‌فاصله \u200C), zero-width chars, and whitespace runs to a single space
 * - Converts Persian/Arabic digits to ASCII digits and lowercases Latin text
 */
export function normalizePersianSearchText(input: string | null | undefined): string {
  if (!input) return '';
  return toEnglishDigits(String(input))
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[يئى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Normalizes search text and strips all spaces/half-spaces so compound words
 * match regardless of whether the user or title uses a normal space, ZWNJ, or no space
 * (e.g., "روان شناسی" === "روان‌شناسی" === "روانشناسی").
 */
export function normalizePersianSearchCompact(input: string | null | undefined): string {
  return normalizePersianSearchText(input).replace(/\s+/g, '');
}

/**
 * Checks whether `haystack` matches `query` under both token-aware space/half-space
 * normalization and compact compound-word normalization.
 */
export function matchesNormalizedPersianQuery(
  haystack: string | null | undefined,
  query: string | null | undefined
): boolean {
  const normQuery = normalizePersianSearchText(query);
  if (!normQuery) return true;
  const normHaystack = normalizePersianSearchText(haystack);
  if (!normHaystack) return false;

  if (normHaystack.includes(normQuery)) {
    return true;
  }

  const compactQuery = normQuery.replace(/\s+/g, '');
  const compactHaystack = normHaystack.replace(/\s+/g, '');
  if (compactQuery.length > 0 && compactHaystack.includes(compactQuery)) {
    return true;
  }

  const queryTokens = normQuery.split(' ').filter(Boolean);
  if (queryTokens.length > 1) {
    const allTokensMatch = queryTokens.every(
      (token) => normHaystack.includes(token) || compactHaystack.includes(token)
    );
    if (allTokensMatch) return true;
  }

  return false;
}

