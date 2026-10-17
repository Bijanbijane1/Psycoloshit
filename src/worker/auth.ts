/**
 * Auth Cryptographic Utilities, Google JWS/JWKS Verification & Session Helpers
 * Compatible with Cloudflare Workers and Node.js 22+
 * Project: PsychoMaster (روان‌لینگو) - Phase 6B Security Hardening
 */

import {
  createRemoteJWKSet,
  jwtVerify,
  errors as joseErrors,
  type JWTVerifyGetKey,
} from 'jose';

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_ACCEPTED_ISSUERS = [
  'https://accounts.google.com',
  'accounts.google.com',
];

let cachedGoogleRemoteJwks: JWTVerifyGetKey | null = null;

export function getGoogleRemoteJwks(): JWTVerifyGetKey {
  if (!cachedGoogleRemoteJwks) {
    cachedGoogleRemoteJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL), {
      cooldownDuration: 30_000,
      cacheMaxAge: 3_600_000,
    });
  }
  return cachedGoogleRemoteJwks;
}

export type GoogleAuthErrorCode =
  | 'GOOGLE_CLIENT_ID_MISSING'
  | 'MISSING_CREDENTIAL'
  | 'MALFORMED_JWT'
  | 'INVALID_SIGNATURE'
  | 'EXPIRED_TOKEN'
  | 'INVALID_ISSUER'
  | 'INVALID_AUDIENCE'
  | 'INVALID_CLAIMS'
  | 'MISSING_SUB'
  | 'EMAIL_NOT_VERIFIED'
  | 'INVALID_NONCE';

export class GoogleAuthError extends Error {
  public readonly code: GoogleAuthErrorCode;
  public readonly status: number;

  constructor(code: GoogleAuthErrorCode, message: string, status: number = 401) {
    super(message);
    this.name = 'GoogleAuthError';
    this.code = code;
    this.status = status;
  }
}

export interface VerifiedGoogleIdentity {
  sub: string;
  email: string;
  emailVerified: true;
  name?: string;
  picture?: string;
  iss: string;
  aud: string | string[];
  exp: number;
  nonce: string;
}

export interface VerifyGoogleTokenOptions {
  clientId: string | undefined | null;
  expectedNonce: string | undefined | null;
  jwks?: JWTVerifyGetKey;
}

/**
 * Cryptographically verifies a Google Identity Services (GIS) ID token (JWT):
 * 1. Rejects when GOOGLE_CLIENT_ID is unconfigured (fails closed).
 * 2. Validates compact JWS format (3 base64url segments).
 * 3. Requires a non-empty server-issued expectedNonce challenge (fails closed if missing).
 * 4. Verifies RS256 cryptographic signature against Google's published JWK set.
 * 5. Verifies `iss` is `https://accounts.google.com` or `accounts.google.com`.
 * 6. Verifies `aud` matches the configured Google Web Client ID.
 * 7. Verifies `exp` has not passed.
 * 8. Verifies `sub` is present and non-empty.
 * 9. Verifies `email` is present and `email_verified === true`.
 * 10. Verifies `nonce` claim is present in the signed ID token and matches `expectedNonce`.
 */
export async function verifyGoogleIdToken(
  credential: unknown,
  options: VerifyGoogleTokenOptions
): Promise<VerifiedGoogleIdentity> {
  const configuredClientId =
    typeof options.clientId === 'string' ? options.clientId.trim() : '';

  if (
    !configuredClientId ||
    configuredClientId === 'MY_GOOGLE_CLIENT_ID' ||
    configuredClientId === 'YOUR_GOOGLE_CLIENT_ID'
  ) {
    throw new GoogleAuthError(
      'GOOGLE_CLIENT_ID_MISSING',
      'احراز هویت گوگل روی سرور پیکربندی نشده است (GOOGLE_CLIENT_ID الزامی است).',
      503
    );
  }

  if (typeof credential !== 'string' || credential.trim() === '') {
    throw new GoogleAuthError(
      'MISSING_CREDENTIAL',
      'توکن معتبر احراز هویت گوگل (credential) ارسال نشده است.',
      400
    );
  }

  const expectedNonce =
    typeof options.expectedNonce === 'string' ? options.expectedNonce.trim() : '';
  if (!expectedNonce) {
    throw new GoogleAuthError(
      'INVALID_NONCE',
      'چالش امنیتی (nonce) در درخواست وجود ندارد یا منقضی شده است.',
      401
    );
  }

  const rawJwt = credential.trim();
  const segments = rawJwt.split('.');
  if (segments.length !== 3 || !segments[0] || !segments[1] || !segments[2]) {
    throw new GoogleAuthError(
      'MALFORMED_JWT',
      'ساختار توکن هویتی گوگل نامعتبر است.',
      401
    );
  }

  const keySet = options.jwks || getGoogleRemoteJwks();

  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(rawJwt, keySet, {
      issuer: GOOGLE_ACCEPTED_ISSUERS,
      audience: configuredClientId,
      algorithms: ['RS256'],
    });
    payload = verified.payload as Record<string, unknown>;
  } catch (err: unknown) {
    if (err instanceof joseErrors.JWTExpired) {
      throw new GoogleAuthError(
        'EXPIRED_TOKEN',
        'توکن احراز هویت گوگل منقضی شده است.',
        401
      );
    }
    if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
      throw new GoogleAuthError(
        'INVALID_SIGNATURE',
        'امضای دیجیتال توکن گوگل نامعتبر است.',
        401
      );
    }
    if (err instanceof joseErrors.JWTClaimValidationFailed) {
      const claim = (err as joseErrors.JWTClaimValidationFailed).claim;
      if (claim === 'iss') {
        throw new GoogleAuthError(
          'INVALID_ISSUER',
          'صادرکننده توکن (iss) معتبر نیست.',
          401
        );
      }
      if (claim === 'aud') {
        throw new GoogleAuthError(
          'INVALID_AUDIENCE',
          'شناسه کلاینت توکن (aud) با سرور مطابقت ندارد.',
          401
        );
      }
      throw new GoogleAuthError(
        'INVALID_CLAIMS',
        'ادعاهای امنیتی توکن گوگل معتبر نیستند.',
        401
      );
    }
    throw new GoogleAuthError(
      'MALFORMED_JWT',
      'توکن احراز هویت گوگل نامعتبر یا مخدوش است.',
      401
    );
  }

  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (!sub) {
    throw new GoogleAuthError(
      'MISSING_SUB',
      'شناسه یکتای کاربر گوگل (sub) در توکن وجود ندارد.',
      401
    );
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const emailVerified = payload.email_verified === true;
  if (!email || !emailVerified) {
    throw new GoogleAuthError(
      'EMAIL_NOT_VERIFIED',
      'ایمیل حساب گوگل تایید نشده است (email_verified الزامی است).',
      401
    );
  }

  const tokenNonce = typeof payload.nonce === 'string' ? payload.nonce.trim() : '';
  if (!tokenNonce || tokenNonce !== expectedNonce) {
    throw new GoogleAuthError(
      'INVALID_NONCE',
      'مقدار nonce توکن با چالش امنیتی سرور مطابقت ندارد.',
      401
    );
  }

  const name =
    typeof payload.name === 'string' && payload.name.trim().length > 0
      ? payload.name.trim()
      : undefined;
  const picture =
    typeof payload.picture === 'string' && payload.picture.trim().length > 0
      ? payload.picture.trim()
      : undefined;

  return {
    sub,
    email,
    emailVerified: true,
    name,
    picture,
    iss: String(payload.iss),
    aud: payload.aud as string | string[],
    exp: Number(payload.exp),
    nonce: tokenNonce,
  };
}

export async function hashSessionToken(token: string): Promise<string> {
  const enc = new TextEncoder().encode(token);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateAuthNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function extractCookieValue(
  cookieHeader: string | null | undefined,
  cookieName: string
): string | null {
  if (!cookieHeader) return null;
  const escaped = cookieName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  return match && match[1] ? match[1].trim() : null;
}

export function extractBearerToken(
  requestOrHeader: Request | string | null | undefined
): string | null {
  if (!requestOrHeader) return null;

  if (typeof requestOrHeader !== 'string') {
    const cookieHeader =
      requestOrHeader.headers.get('Cookie') || requestOrHeader.headers.get('cookie');
    const cookieToken = extractCookieValue(cookieHeader, 'session_token');
    if (cookieToken && /^[a-zA-Z0-9_-]+$/.test(cookieToken)) {
      return cookieToken;
    }
  }

  const authHeader =
    typeof requestOrHeader === 'string'
      ? requestOrHeader
      : requestOrHeader.headers.get('Authorization') ||
        requestOrHeader.headers.get('authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) return token;
  }

  return null;
}

export function extractGuestToken(
  request: Request,
  body?: Record<string, unknown> | null
): string | null {
  const cookieHeader = request.headers.get('Cookie') || request.headers.get('cookie');
  const cookieToken = extractCookieValue(cookieHeader, 'guest_session_token');
  if (cookieToken && /^[a-zA-Z0-9_-]+$/.test(cookieToken)) {
    return cookieToken;
  }

  const headerToken =
    request.headers.get('X-Guest-Token') || request.headers.get('x-guest-token');
  if (headerToken && /^[a-zA-Z0-9_-]+$/.test(headerToken.trim())) {
    return headerToken.trim();
  }

  if (body && typeof body.guestToken === 'string' && /^[a-zA-Z0-9_-]+$/.test(body.guestToken.trim())) {
    return body.guestToken.trim();
  }

  return null;
}

export function buildCookieHeader(
  name: string,
  value: string,
  maxAge: number,
  isSecure: boolean
): string {
  const secureFlag = isSecure ? '; Secure' : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=${maxAge}`;
}

export function clearCookieHeader(name: string, isSecure: boolean): string {
  return buildCookieHeader(name, '', 0, isSecure);
}

/**
 * Validates the browser Origin (and Referer / Sec-Fetch-Site fallback) against
 * expected host/application origins to protect state-changing routes against CSRF.
 *
 * Security policy:
 * - Rejects `Origin: null` (sandboxed iframe / data: URI CSRF vector).
 * - When `Origin` is present, it must match an explicitly configured allowed origin.
 * - When `Origin` is absent:
 *   - If `Sec-Fetch-Site: cross-site` is present, rejects immediately.
 *   - If `Referer` is present, its origin must match an explicitly configured allowed origin.
 *   - Only allows missing `Origin` when neither `Sec-Fetch-Site: cross-site` nor a mismatched `Referer` is present.
 */
export function validateRequestOrigin(
  originHeader: string | null | undefined,
  allowedOrigins: Array<string | null | undefined>,
  options?: {
    refererHeader?: string | null;
    secFetchSiteHeader?: string | null;
  }
): boolean {
  const matchesAllowedOrigin = (candidateUrlOrOrigin: string): boolean => {
    let parsedOrigin: string;
    try {
      parsedOrigin = new URL(candidateUrlOrOrigin.trim()).origin.toLowerCase();
    } catch {
      return false;
    }

    for (const candidate of allowedOrigins) {
      if (!candidate || typeof candidate !== 'string') continue;
      const trimmed = candidate.trim();
      if (!trimmed || trimmed === 'MY_APP_URL') continue;
      try {
        const normalizedAllowed = new URL(trimmed).origin.toLowerCase();
        if (parsedOrigin === normalizedAllowed) {
          return true;
        }
      } catch {
        if (parsedOrigin === trimmed.toLowerCase()) {
          return true;
        }
      }
    }
    return false;
  };

  if (originHeader !== undefined && originHeader !== null && originHeader.trim() !== '') {
    const rawOrigin = originHeader.trim();
    if (rawOrigin.toLowerCase() === 'null') {
      return false;
    }
    return matchesAllowedOrigin(rawOrigin);
  }

  // Origin header is absent: inspect Sec-Fetch-Site and Referer if provided
  const secFetchSite = options?.secFetchSiteHeader?.trim().toLowerCase();
  if (secFetchSite === 'cross-site') {
    return false;
  }

  const referer = options?.refererHeader?.trim();
  if (referer) {
    return matchesAllowedOrigin(referer);
  }

  // Same-origin non-CORS or non-browser request without Origin/Referer/cross-site headers
  return true;
}
