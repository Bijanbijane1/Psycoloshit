import type { Env, ExecutionContext } from './types.ts';
export * from './db/index.ts';

/**
 * Cloudflare Worker Entry Point for PsychoMaster (روان‌لینگو)
 * Phase 4C: Hardened Health Endpoint & Secure D1 Integration
 *
 * Database Name: psychomaster-db
 * Database ID: 13bf8598-0513-4c29-81d9-2c0fa79f5ef8
 * D1 Binding Name: DB
 *
 * Scope & Guardrails:
 * - Read-only harmless connectivity check on /api/d1/health (GET only).
 * - Zero schema table metadata exposed.
 * - Zero user data or internal error details leaked.
 * - Cache-Control: no-store enforced.
 */

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Hardened D1 Connectivity Health Check endpoint
    if (url.pathname === '/api/d1/health' || url.pathname === '/api/d1-health') {
      // 1. Enforce GET only
      if (request.method !== 'GET') {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Method Not Allowed'
          }),
          {
            status: 405,
            headers: {
              'Content-Type': 'application/json',
              'Allow': 'GET',
              'Cache-Control': 'no-store'
            }
          }
        );
      }

      try {
        if (!env.DB) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: 'Database service is unavailable'
            }),
            {
              status: 503,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store'
              }
            }
          );
        }

        // Execute harmless connectivity query (minimal footprint, zero metadata exposure)
        const startTime = Date.now();
        const testResult = await env.DB.prepare(
          "SELECT 1 AS connection_test, datetime('now') AS server_utc"
        ).first<{
          connection_test: number;
          server_utc: string;
        }>();
        const latencyMs = Date.now() - startTime;

        return new Response(
          JSON.stringify({
            ok: true,
            status: 'connected',
            database: 'psychomaster-db',
            binding: 'DB',
            latencyMs,
            result: testResult
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store'
            }
          }
        );
      } catch (_err: unknown) {
        // Controlled, safe error response without exposing database errors, queries, or stack traces
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Failed to verify database connectivity'
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store'
            }
          }
        );
      }
    }

    // ==============================================================
    // Production-Ready Google Auth & Hashed Session Endpoints (Phase 6B)
    // ==============================================================

    if (url.pathname.startsWith('/api/auth/')) {
      // Explicit 404 for removed account-enumeration route
      if (url.pathname === '/api/auth/accounts') {
        return new Response(
          JSON.stringify({ ok: false, error: 'Not Found' }),
          { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      if (!env.DB) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Database service is unavailable' }),
          { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      const { D1UserRepository, SEEDED_COMPETITOR_IDS } = await import('./db/userRepository.ts');
      const {
        hashSessionToken,
        generateSessionToken,
        generateAuthNonce,
        verifyGoogleIdToken,
        GoogleAuthError,
        extractBearerToken,
        extractGuestToken,
        extractCookieValue,
        buildCookieHeader,
        validateRequestOrigin,
      } = await import('./auth.ts');
      const userRepo = new D1UserRepository(env.DB);
      const isSecure = url.protocol === 'https:';

      // Validate Origin / Referer / Sec-Fetch-Site on all state-changing auth requests (CSRF protection)
      if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
        const originHeader = request.headers.get('Origin') || request.headers.get('origin');
        const refererHeader = request.headers.get('Referer') || request.headers.get('referer');
        const secFetchSiteHeader =
          request.headers.get('Sec-Fetch-Site') || request.headers.get('sec-fetch-site');
        const allowedOrigins = [url.origin, env.APP_URL];
        if (
          !validateRequestOrigin(originHeader, allowedOrigins, {
            refererHeader,
            secFetchSiteHeader,
          })
        ) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Forbidden: Cross-origin authentication request rejected' }),
            { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }
      }

      // 0. GET /api/auth/nonce (Issues single-use server-stored CSRF/GIS nonce bound to HttpOnly cookie)
      if (url.pathname === '/api/auth/nonce') {
        if (request.method !== 'GET') {
          return new Response(
            JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
            { status: 405, headers: { 'Content-Type': 'application/json', 'Allow': 'GET', 'Cache-Control': 'no-store' } }
          );
        }
        const nonce = generateAuthNonce();
        const nonceHash = await hashSessionToken(nonce);
        await userRepo.createAuthNonce(nonceHash, 600);

        const clientId = env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || '';
        const clientIdConfigured = Boolean(
          clientId.trim() &&
          clientId.trim() !== 'MY_GOOGLE_CLIENT_ID' &&
          clientId.trim() !== 'YOUR_GOOGLE_CLIENT_ID'
        );
        const nonceCookie = buildCookieHeader('oauth_nonce', nonce, 600, isSecure);
        return new Response(
          JSON.stringify({
            ok: true,
            nonce,
            clientIdConfigured,
            googleAuthConfigured: clientIdConfigured,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
              'Set-Cookie': nonceCookie,
            },
          }
        );
      }

      // 1. POST /api/auth/google
      if (url.pathname === '/api/auth/google') {
        if (request.method !== 'POST') {
          return new Response(
            JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
            { status: 405, headers: { 'Content-Type': 'application/json', 'Allow': 'POST', 'Cache-Control': 'no-store' } }
          );
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response(
            JSON.stringify({ ok: false, error: 'ساختار درخواست نامعتبر است.' }),
            { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const clientId = (env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || '').trim();
        if (
          !clientId ||
          clientId === 'MY_GOOGLE_CLIENT_ID' ||
          clientId === 'YOUR_GOOGLE_CLIENT_ID'
        ) {
          return new Response(
            JSON.stringify({
              ok: false,
              code: 'GOOGLE_CLIENT_ID_MISSING',
              error: 'احراز هویت گوگل روی سرور پیکربندی نشده است (GOOGLE_CLIENT_ID الزامی است).',
            }),
            { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        // Strict requirement: Only cryptographically verified Google ID token `credential` is accepted.
        if (!body || typeof body.credential !== 'string' || !body.credential.trim()) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: 'توکن رسمی احراز هویت گوگل (credential) الزامی است.',
            }),
            { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        try {
          const cookieHeader = request.headers.get('Cookie') || request.headers.get('cookie');
          const cookieNonce = extractCookieValue(cookieHeader, 'oauth_nonce');
          const bodyExpectedNonce =
            typeof body.expectedNonce === 'string' && body.expectedNonce.trim()
              ? body.expectedNonce.trim()
              : typeof body.nonce === 'string' && body.nonce.trim()
              ? body.nonce.trim()
              : undefined;

          const verifiedIdentity = await verifyGoogleIdToken(body.credential, {
            clientId,
            expectedNonce: cookieNonce || bodyExpectedNonce,
            jwks: env.GOOGLE_JWKS,
          });

          if (!cookieNonce || (bodyExpectedNonce && bodyExpectedNonce !== cookieNonce)) {
            throw new GoogleAuthError(
              'INVALID_NONCE',
              'چالش امنیتی (oauth_nonce) در کوکی درخواست وجود ندارد یا مطابقت ندارد.',
              401
            );
          }

          if (!verifiedIdentity.nonce || verifiedIdentity.nonce !== cookieNonce) {
            throw new GoogleAuthError(
              'INVALID_NONCE',
              'چالش امنیتی (nonce) در توکن گوگل وجود ندارد یا مطابقت ندارد.',
              401
            );
          }

          const nonceHash = await hashSessionToken(cookieNonce);
          const nonceConsumed = await userRepo.consumeAuthNonce(nonceHash);
          if (!nonceConsumed) {
            throw new GoogleAuthError(
              'INVALID_NONCE',
              'چالش امنیتی (nonce) نامعتبر، منقضی یا قبلاً استفاده شده است.',
              401
            );
          }

          // Use ONLY cryptographically verified claims from Google ID token.
          // Preserve guest progress until an explicit, authenticated /api/auth/merge request.
          const { user, isNew } = await userRepo.createOrUpdateGoogleUser({
            googleId: verifiedIdentity.sub,
            email: verifiedIdentity.email,
            name: verifiedIdentity.name || 'دانشجوی روان‌شناسی',
            picture: verifiedIdentity.picture,
            mode: 'signin',
          });

          // Generate 32-byte opaque session token & store ONLY its SHA-256 hash in D1
          const rawToken = generateSessionToken();
          const tokenHash = await hashSessionToken(rawToken);
          await userRepo.createSession(user.userId, tokenHash);

          const respHeaders = new Headers({
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          });
          respHeaders.append('Set-Cookie', buildCookieHeader('session_token', rawToken, 2592000, isSecure));
          respHeaders.append('Set-Cookie', buildCookieHeader('oauth_nonce', '', 0, isSecure));

          return new Response(
            JSON.stringify({
              ok: true,
              user,
              isNew,
            }),
            {
              status: 200,
              headers: respHeaders,
            }
          );
        } catch (err: unknown) {
          const errHeaders = new Headers({
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          });
          errHeaders.append('Set-Cookie', buildCookieHeader('oauth_nonce', '', 0, isSecure));
          if (err instanceof GoogleAuthError) {
            return new Response(
              JSON.stringify({ ok: false, code: err.code, error: err.message }),
              {
                status: err.status,
                headers: errHeaders,
              }
            );
          }
          console.error('Google auth error in worker:', err);
          return new Response(
            JSON.stringify({ ok: false, error: 'خطا در تایید هویت با گوگل.' }),
            { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }
      }

      // 2. GET /api/auth/me
      if (url.pathname === '/api/auth/me') {
        if (request.method !== 'GET') {
          return new Response(
            JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
            { status: 405, headers: { 'Content-Type': 'application/json', 'Allow': 'GET', 'Cache-Control': 'no-store' } }
          );
        }

        const token = extractBearerToken(request);
        if (!token) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const tokenHash = await hashSessionToken(token);
        const sessionResult = await userRepo.validateSession(tokenHash);
        if (!sessionResult) {
          return new Response(
            JSON.stringify({ ok: false, error: 'نشست کاربری نامعتبر یا منقضی شده است.' }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        return new Response(
          JSON.stringify({ ok: true, user: sessionResult.user }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      // 3. POST /api/auth/merge
      if (url.pathname === '/api/auth/merge') {
        if (request.method !== 'POST') {
          return new Response(
            JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
            { status: 405, headers: { 'Content-Type': 'application/json', 'Allow': 'POST', 'Cache-Control': 'no-store' } }
          );
        }

        const token = extractBearerToken(request);
        if (!token) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const tokenHash = await hashSessionToken(token);
        const sessionResult = await userRepo.validateSession(tokenHash);
        if (!sessionResult) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        try {
          const body = (await request.json()) as Record<string, unknown>;
          const guestUserId = typeof body.guestUserId === 'string' ? body.guestUserId.trim() : '';
          const guestProgress = body.guestProgress as any;

          if (!guestUserId) {
            return new Response(
              JSON.stringify({ ok: false, error: 'guestUserId الزامی است.' }),
              { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
            );
          }

          if (
            guestUserId === sessionResult.user.userId ||
            guestUserId.startsWith('usr_g_') ||
            SEEDED_COMPETITOR_IDS.has(guestUserId)
          ) {
            return new Response(
              JSON.stringify({ ok: false, error: 'Forbidden: حساب انتخاب‌شده قابل ادغام به عنوان مهمان نیست.' }),
              { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
            );
          }

          const existingGuest = await userRepo.getUserById(guestUserId);
          if (existingGuest && existingGuest.googleId) {
            return new Response(
              JSON.stringify({ ok: false, error: 'Forbidden: حساب کاربری گوگل به عنوان مهمان قابل ادغام نیست.' }),
              { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
            );
          }

          // If the guest account exists on the server, caller must prove ownership via guest_session_token
          if (existingGuest) {
            const rawGuestToken = extractGuestToken(request, body);
            let verifiedGuestOwnerId: string | null = null;
            if (rawGuestToken) {
              const guestTokenHash = await hashSessionToken(rawGuestToken);
              const guestSession = await userRepo.validateSession(guestTokenHash);
              if (guestSession) {
                verifiedGuestOwnerId = guestSession.user.userId;
              }
            }
            if (verifiedGuestOwnerId !== guestUserId) {
              return new Response(
                JSON.stringify({
                  ok: false,
                  error: 'Forbidden: مالکیت نشست مهمان برای ادغام تایید نشد.',
                }),
                { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
              );
            }
          }

          const mergedUser = await userRepo.mergeGuestIntoUser(
            sessionResult.user.userId,
            guestUserId,
            guestProgress
          );

          await userRepo.deleteUserSessions(guestUserId);
          const clearGuestCookie = buildCookieHeader('guest_session_token', '', 0, isSecure);

          return new Response(
            JSON.stringify({ ok: true, user: mergedUser }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
                'Set-Cookie': clearGuestCookie,
              },
            }
          );
        } catch (err: unknown) {
          console.error('Merge error in worker:', err);
          return new Response(
            JSON.stringify({ ok: false, error: 'خطا در ادغام داده‌های مهمان.' }),
            { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }
      }

      // 4. POST /api/auth/logout
      if (url.pathname === '/api/auth/logout') {
        if (request.method !== 'POST') {
          return new Response(
            JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
            { status: 405, headers: { 'Content-Type': 'application/json', 'Allow': 'POST', 'Cache-Control': 'no-store' } }
          );
        }

        const token = extractBearerToken(request);
        if (token) {
          const tokenHash = await hashSessionToken(token);
          await userRepo.deleteSession(tokenHash);
        }

        const clearCookie = buildCookieHeader('session_token', '', 0, isSecure);

        return new Response(
          JSON.stringify({ ok: true, message: 'از حساب کاربری خارج شدید.' }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
              'Set-Cookie': clearCookie,
            },
          }
        );
      }

      // 5. POST/PUT /api/auth/profile (Update name or avatar)
      if (url.pathname === '/api/auth/profile') {
        if (request.method !== 'POST' && request.method !== 'PUT') {
          return new Response(
            JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
            { status: 405, headers: { 'Content-Type': 'application/json', 'Allow': 'POST, PUT', 'Cache-Control': 'no-store' } }
          );
        }

        const token = extractBearerToken(request);
        if (!token) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const tokenHash = await hashSessionToken(token);
        const sessionResult = await userRepo.validateSession(tokenHash);
        if (!sessionResult) {
          return new Response(
            JSON.stringify({ ok: false, error: 'نشست کاربری نامعتبر است.' }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        try {
          const body = (await request.json()) as Record<string, unknown>;
          const name = typeof body.name === 'string' ? body.name : undefined;
          const avatar = typeof body.avatar === 'string' ? body.avatar : undefined;

          const updated = await userRepo.updateUserProfile(sessionResult.user.userId, {
            name,
            avatar,
          });

          return new Response(
            JSON.stringify({ ok: true, user: updated }),
            { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        } catch (_err: unknown) {
          return new Response(
            JSON.stringify({ ok: false, error: 'خطا در ویرایش اطلاعات پروفایل.' }),
            { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }
      }

      return new Response(
        JSON.stringify({ ok: false, error: 'Not Found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
      );
    }

    // ==============================================================
    // User Progress Cloud Sync & Leaderboard Endpoints in D1
    // ==============================================================

    if (url.pathname === '/api/user/sync' && request.method === 'POST') {
      if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database service is unavailable' }), { status: 503 });
      }

      const { D1UserRepository, SEEDED_COMPETITOR_IDS } = await import('./db/userRepository.ts');
      const {
        hashSessionToken,
        generateSessionToken,
        extractBearerToken,
        extractGuestToken,
        buildCookieHeader,
        validateRequestOrigin,
      } = await import('./auth.ts');
      const userRepo = new D1UserRepository(env.DB);
      const isSecure = url.protocol === 'https:';

      const originHeader = request.headers.get('Origin') || request.headers.get('origin');
      const refererHeader = request.headers.get('Referer') || request.headers.get('referer');
      const secFetchSiteHeader =
        request.headers.get('Sec-Fetch-Site') || request.headers.get('sec-fetch-site');
      if (
        !validateRequestOrigin(originHeader, [url.origin, env.APP_URL], {
          refererHeader,
          secFetchSiteHeader,
        })
      ) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: Cross-origin request rejected' }),
          { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      try {
        const { isValidUserIdFormat } = await import('./rewards.ts');

        const body = (await request.json()) as Record<string, unknown>;
        const requestedUserId = typeof body.userId === 'string' ? body.userId.trim() : '';

        let authUserId: string | null = null;
        const token = extractBearerToken(request);
        if (token) {
          const tokenHash = await hashSessionToken(token);
          const sessionResult = await userRepo.validateSession(tokenHash);
          if (sessionResult) {
            authUserId = sessionResult.user.userId;
          }
        }

        let guestAuthUserId: string | null = null;
        const guestToken = extractGuestToken(request, body);
        if (guestToken) {
          const guestTokenHash = await hashSessionToken(guestToken);
          const guestSessionResult = await userRepo.validateSession(guestTokenHash);
          if (guestSessionResult) {
            guestAuthUserId = guestSessionResult.user.userId;
          }
        }

        if (authUserId && requestedUserId && requestedUserId !== authUserId) {
          return new Response(
            JSON.stringify({ error: 'Forbidden: Cannot sync profile for another user' }),
            { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        if (!authUserId && guestAuthUserId && requestedUserId && requestedUserId !== guestAuthUserId) {
          return new Response(
            JSON.stringify({ error: 'Forbidden: Guest session does not match requested userId' }),
            { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const userId = authUserId || guestAuthUserId || requestedUserId || '';
        if (!userId || !isValidUserIdFormat(userId)) {
          return new Response(
            JSON.stringify({ error: 'Valid userId is required' }),
            { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        if (SEEDED_COMPETITOR_IDS.has(userId)) {
          return new Response(
            JSON.stringify({ error: 'Forbidden: Seeded competitor profiles cannot be modified' }),
            { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const existingUser = await userRepo.getUserById(userId);
        if (
          (userId.startsWith('usr_g_') || (existingUser && existingUser.googleId)) &&
          authUserId !== userId
        ) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized: Google-authenticated accounts require a valid session' }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const isGuestAccount = !userId.startsWith('usr_g_') && !(existingUser && existingUser.googleId);
        if (isGuestAccount && existingUser && guestAuthUserId !== userId && authUserId !== userId) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized: Active guest accounts require a valid guest session token' }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const profile = await userRepo.upsertUser({
          userId,
          name: typeof body.name === 'string' ? body.name : undefined,
          avatar: typeof body.avatar === 'string' ? body.avatar : undefined,
          streakDays: typeof body.streakDays === 'number' ? body.streakDays : undefined,
          totalStudyMinutes: typeof body.totalStudyMinutes === 'number' ? body.totalStudyMinutes : undefined,
          completedChapters: Array.isArray(body.completedChapters) ? (body.completedChapters as string[]) : undefined,
          completedStages: (body.completedStages && typeof body.completedStages === 'object') ? (body.completedStages as any) : undefined,
          unlockedBadgeIds: Array.isArray(body.unlockedBadgeIds) ? (body.unlockedBadgeIds as string[]) : undefined,
          bookmarkedChapters: Array.isArray(body.bookmarkedChapters) ? (body.bookmarkedChapters as string[]) : undefined,
        });

        const respHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        };
        let issuedGuestToken: string | undefined;
        if (isGuestAccount && guestAuthUserId !== userId && authUserId !== userId) {
          issuedGuestToken = generateSessionToken();
          const issuedHash = await hashSessionToken(issuedGuestToken);
          await userRepo.createSession(userId, issuedHash);
          respHeaders['Set-Cookie'] = buildCookieHeader('guest_session_token', issuedGuestToken, 2592000, isSecure);
        }

        return new Response(
          JSON.stringify({
            success: true,
            profile,
            ...(issuedGuestToken ? { guestToken: issuedGuestToken } : {}),
          }),
          { status: 200, headers: respHeaders }
        );
      } catch (err: unknown) {
        console.error('User sync error in worker:', err);
        return new Response(
          JSON.stringify({ error: 'Failed to sync user data' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    if (url.pathname.startsWith('/api/user/sync/') && request.method === 'GET') {
      if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database service is unavailable' }), { status: 503 });
      }
      const targetUserId = decodeURIComponent(url.pathname.replace('/api/user/sync/', '')).trim();
      const { D1UserRepository } = await import('./db/userRepository.ts');
      const { hashSessionToken, extractBearerToken, extractGuestToken } = await import('./auth.ts');
      const userRepo = new D1UserRepository(env.DB);
      const user = await userRepo.getUserById(targetUserId);
      if (!user) {
        return new Response(JSON.stringify({ error: 'کاربر در پایگاه داده D1 یافت نشد.' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }

      const token = extractBearerToken(request);
      let authUserId: string | null = null;
      if (token) {
        const tokenHash = await hashSessionToken(token);
        const sessionResult = await userRepo.validateSession(tokenHash);
        if (sessionResult) {
          authUserId = sessionResult.user.userId;
        }
      }

      const guestToken = extractGuestToken(request);
      let guestAuthUserId: string | null = null;
      if (guestToken) {
        const guestTokenHash = await hashSessionToken(guestToken);
        const guestSessionResult = await userRepo.validateSession(guestTokenHash);
        if (guestSessionResult) {
          guestAuthUserId = guestSessionResult.user.userId;
        }
      }

      const isGoogleAccount = Boolean(user.googleId || targetUserId.startsWith('usr_g_'));
      if (isGoogleAccount) {
        if (authUserId !== user.userId) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }
      } else {
        if (authUserId !== user.userId && guestAuthUserId !== user.userId) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }
      }

      return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }

    if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
      if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database service is unavailable' }), { status: 503 });
      }
      const currentUserId = url.searchParams.get('userId') || undefined;
      const { D1UserRepository } = await import('./db/userRepository.ts');
      const userRepo = new D1UserRepository(env.DB);
      const leaderboardData = await userRepo.getLeaderboard(currentUserId);
      return new Response(
        JSON.stringify(leaderboardData),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
      );
    }

    if (url.pathname === '/api/leaderboard/submit' && request.method === 'POST') {
      if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database service is unavailable' }), { status: 503 });
      }
      const { D1UserRepository, SEEDED_COMPETITOR_IDS } = await import('./db/userRepository.ts');
      const {
        hashSessionToken,
        generateSessionToken,
        extractBearerToken,
        extractGuestToken,
        buildCookieHeader,
        validateRequestOrigin,
      } = await import('./auth.ts');
      const { isValidUserIdFormat, verifyRewardSubmission } = await import('./rewards.ts');
      const userRepo = new D1UserRepository(env.DB);
      const isSecure = url.protocol === 'https:';

      const originHeader = request.headers.get('Origin') || request.headers.get('origin');
      const refererHeader = request.headers.get('Referer') || request.headers.get('referer');
      const secFetchSiteHeader =
        request.headers.get('Sec-Fetch-Site') || request.headers.get('sec-fetch-site');
      if (
        !validateRequestOrigin(originHeader, [url.origin, env.APP_URL], {
          refererHeader,
          secFetchSiteHeader,
        })
      ) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: Cross-origin request rejected' }),
          { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      try {
        const body = (await request.json()) as Record<string, unknown>;
        const requestedUserId = typeof body.userId === 'string' ? body.userId.trim() : '';

        let authUserId: string | null = null;
        const token = extractBearerToken(request);
        if (token) {
          const tokenHash = await hashSessionToken(token);
          const sessionResult = await userRepo.validateSession(tokenHash);
          if (sessionResult) {
            authUserId = sessionResult.user.userId;
          }
        }

        let guestAuthUserId: string | null = null;
        const guestToken = extractGuestToken(request, body);
        if (guestToken) {
          const guestTokenHash = await hashSessionToken(guestToken);
          const guestSessionResult = await userRepo.validateSession(guestTokenHash);
          if (guestSessionResult) {
            guestAuthUserId = guestSessionResult.user.userId;
          }
        }

        if (authUserId && requestedUserId && requestedUserId !== authUserId) {
          return new Response(
            JSON.stringify({ error: 'Forbidden: Cannot submit XP for another user' }),
            { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        if (!authUserId && guestAuthUserId && requestedUserId && requestedUserId !== guestAuthUserId) {
          return new Response(
            JSON.stringify({ error: 'Forbidden: Guest session does not match requested userId' }),
            { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const userId = authUserId || guestAuthUserId || requestedUserId || '';
        if (!userId || !isValidUserIdFormat(userId)) {
          return new Response(
            JSON.stringify({ error: 'Valid userId is required' }),
            { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        if (SEEDED_COMPETITOR_IDS.has(userId)) {
          return new Response(
            JSON.stringify({ error: 'Forbidden: Seeded competitor profiles cannot be modified' }),
            { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const existing = await userRepo.getUserById(userId);
        if (
          (userId.startsWith('usr_g_') || (existing && existing.googleId)) &&
          authUserId !== userId
        ) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized: Google-authenticated accounts require a valid session' }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const isGuestAccount = !userId.startsWith('usr_g_') && !(existing && existing.googleId);
        // Require every XP submission to come from an already-synced account with a valid session
        if (!existing || (isGuestAccount && guestAuthUserId !== userId && authUserId !== userId)) {
          return new Response(
            JSON.stringify({
              error: 'Unauthorized: Active session token is required to submit rewards',
            }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const verifiedCompletedStages = await userRepo.getVerifiedCompletedStageNumbers(userId);
        const verification = verifyRewardSubmission(body, { verifiedCompletedStages });
        if (!verification.ok) {
          return new Response(
            JSON.stringify({ error: verification.error }),
            {
              status: verification.status,
              headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            }
          );
        }

        const awardResult = await userRepo.awardXp({
          userId,
          idempotencyKey: verification.idempotencyKey,
          amount: verification.amount,
          reason: verification.reason,
          stageRecord: verification.stageRecord,
          streakDays: typeof body.streakDays === 'number' ? body.streakDays : undefined,
          name: typeof body.name === 'string' ? body.name : undefined,
          avatar: typeof body.avatar === 'string' ? body.avatar : undefined,
        });

        return new Response(
          JSON.stringify({
            success: true,
            applied: awardResult.applied,
            alreadyProcessed: awardResult.alreadyProcessed,
            awardedXp: awardResult.applied ? verification.amount : 0,
            updatedXp: awardResult.updatedXp,
            profile: awardResult.profile,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
            },
          }
        );
      } catch (err: unknown) {
        console.error('Leaderboard submit error in worker:', err);
        return new Response(
          JSON.stringify({ error: 'Failed to submit score' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Pass-through to static assets (SPA) if ASSETS binding is present
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    // Default info response for worker entry point
    return new Response(
      JSON.stringify({
        name: 'psychomaster-worker',
        version: 'phase-4e',
        endpoints: ['/api/d1/health', '/api/d1-health']
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      }
    );
  }
};
