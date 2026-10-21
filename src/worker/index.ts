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

    // Rate limiting across all /api/* routes (Tier-1 memory + Tier-2 D1 quota on billable AI routes)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const { checkWorkerRateLimit } = await import('./rateLimiter.ts');
      const rateLimitResponse = await checkWorkerRateLimit(request, url.pathname, env);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
    }

    // Application Health Check endpoint (/api/health)
    if (url.pathname === '/api/health') {
      if (request.method !== 'GET') {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Method Not Allowed',
          }),
          {
            status: 405,
            headers: {
              'Content-Type': 'application/json',
              'Allow': 'GET',
              'Cache-Control': 'no-store',
            },
          }
        );
      }

      const { isWorkerAiAvailable, workerAiCache } = await import('./ai.ts');
      let d1Available = false;
      let totalQuestionsInBank = 0;

      if (env.DB) {
        try {
          const { D1QuestionRepository } = await import('./db/questionRepository.ts');
          const qRepo = new D1QuestionRepository(env.DB);
          totalQuestionsInBank = await qRepo.getTotalCount();
          d1Available = true;
        } catch {
          d1Available = false;
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          status: 'ok',
          service: 'PsychoMaster Academic Platform',
          runtime: 'cloudflare-worker',
          aiAvailable: isWorkerAiAvailable(env),
          d1Available,
          cacheStats: workerAiCache.getStats(),
          totalQuestionsInBank,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      );
    }

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

    if (url.pathname === '/api/user/sync') {
      if (request.method !== 'POST') {
        return new Response(
          JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
          { status: 405, headers: { 'Content-Type': 'application/json', 'Allow': 'POST', 'Cache-Control': 'no-store' } }
        );
      }
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

    if (url.pathname.startsWith('/api/user/sync/')) {
      if (request.method !== 'GET') {
        return new Response(
          JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
          { status: 405, headers: { 'Content-Type': 'application/json', 'Allow': 'GET', 'Cache-Control': 'no-store' } }
        );
      }
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

    if (url.pathname === '/api/leaderboard') {
      if (request.method !== 'GET') {
        return new Response(
          JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
          { status: 405, headers: { 'Content-Type': 'application/json', 'Allow': 'GET', 'Cache-Control': 'no-store' } }
        );
      }
      if (!env.DB) {
        return new Response(JSON.stringify({ error: 'Database service is unavailable' }), { status: 503 });
      }
      const requestedUserId = url.searchParams.get('userId')?.trim() || undefined;
      const { D1UserRepository, SEEDED_COMPETITOR_IDS } = await import('./db/userRepository.ts');
      const userRepo = new D1UserRepository(env.DB);
      let verifiedCurrentUserId: string | undefined = undefined;

      if (requestedUserId) {
        if (SEEDED_COMPETITOR_IDS.has(requestedUserId)) {
          verifiedCurrentUserId = requestedUserId;
        } else {
          const { hashSessionToken, extractBearerToken, extractGuestToken } = await import('./auth.ts');
          const rawToken = extractBearerToken(request) || extractGuestToken(request);
          if (rawToken) {
            const tokenHash = await hashSessionToken(rawToken);
            const sessionResult = await userRepo.validateSession(tokenHash);
            if (sessionResult && sessionResult.user.userId === requestedUserId) {
              verifiedCurrentUserId = sessionResult.user.userId;
            }
          }
        }
      }

      const leaderboardData = await userRepo.getLeaderboard(verifiedCurrentUserId);
      return new Response(
        JSON.stringify(leaderboardData),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
      );
    }

    if (url.pathname === '/api/leaderboard/submit') {
      if (request.method !== 'POST') {
        return new Response(
          JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
          { status: 405, headers: { 'Content-Type': 'application/json', 'Allow': 'POST', 'Cache-Control': 'no-store' } }
        );
      }
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
        const verifiedQuizKeys =
          (typeof body.rewardType === 'string' && body.rewardType.trim() === 'badge_unlock') ||
          (typeof body.reason === 'string' && body.reason.trim() === 'badge_unlock')
            ? await userRepo.getVerifiedQuizIdempotencyKeys(userId)
            : undefined;
        const verification = verifyRewardSubmission(body, {
          verifiedCompletedStages,
          verifiedQuizKeys,
          userProfile: {
            xp: existing.xp,
            streakDays: existing.streakDays,
            completedChapters: existing.completedChapters,
            unlockedBadgeIds: existing.unlockedBadgeIds,
          },
        });
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
          chapterId: verification.chapterId,
          badgeId: verification.badgeId,
          pomodoroMinutes: verification.pomodoroMinutes,
          streakDays: typeof body.streakDays === 'number' ? body.streakDays : undefined,
          name: typeof body.name === 'string' ? body.name : undefined,
          avatar: typeof body.avatar === 'string' ? body.avatar : undefined,
        });

        return new Response(
          JSON.stringify({
            success: true,
            applied: awardResult.applied,
            alreadyProcessed: awardResult.alreadyProcessed,
            alreadyClaimed: awardResult.alreadyProcessed,
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

    // ==============================================================
    // Question Bank Endpoints (/api/quiz/bank & /api/quiz/bank/generate)
    // ==============================================================

    if (url.pathname === '/api/quiz/bank') {
      if (request.method !== 'GET') {
        return new Response(
          JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
          {
            status: 405,
            headers: {
              'Content-Type': 'application/json',
              'Allow': 'GET',
              'Cache-Control': 'no-store',
            },
          }
        );
      }

      if (!env.DB) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Database service is unavailable' }),
          { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      const chapterId = url.searchParams.get('chapterId')?.trim() || undefined;
      const difficulty = url.searchParams.get('difficulty')?.trim() || undefined;
      const rawLimit = url.searchParams.get('limit');
      const limit = rawLimit !== null ? Number(rawLimit) : 10;

      if (difficulty && difficulty !== 'easy' && difficulty !== 'medium' && difficulty !== 'hard') {
        return new Response(
          JSON.stringify({ ok: false, error: 'Invalid difficulty filter. Allowed: easy, medium, hard' }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      try {
        const { D1QuestionRepository } = await import('./db/questionRepository.ts');
        const qRepo = new D1QuestionRepository(env.DB);
        await qRepo.ensureSeeded();
        const questions = await qRepo.getQuestions({
          chapterId,
          difficulty,
          limit: Number.isFinite(limit) ? limit : 10,
        });
        const totalInBank = await qRepo.getTotalCount();
        const sanitizedQuestions = questions.map(({ correctIndex: _ci, explanation: _exp, ...publicFields }) => publicFields);

        return new Response(
          JSON.stringify({
            questions: sanitizedQuestions,
            totalInBank,
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
        console.error('Worker quiz bank error:', err);
        return new Response(
          JSON.stringify({ ok: false, error: 'خطا در بازیابی بانک سوالات.' }),
          { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }
    }

    if (url.pathname === '/api/quiz/bank/generate') {
      const { handleWorkerQuizBankGenerate } = await import('./ai.ts');
      return handleWorkerQuizBankGenerate(request, env);
    }

    // ==============================================================
    // AI Mentor & Adaptive Study Plan Endpoints (/api/ai/*)
    // ==============================================================

    if (url.pathname === '/api/ai/mentor') {
      const { handleWorkerAiMentor } = await import('./ai.ts');
      return handleWorkerAiMentor(request, env);
    }

    if (url.pathname === '/api/ai/mentor/stream') {
      const { handleWorkerAiMentorStream } = await import('./ai.ts');
      return handleWorkerAiMentorStream(request, env);
    }

    if (url.pathname === '/api/ai/adaptive-plan') {
      const { handleWorkerAiAdaptivePlan } = await import('./ai.ts');
      return handleWorkerAiAdaptivePlan(request, env);
    }

    // ==============================================================
    // Site Traffic Analytics & Student Summary Report Endpoints
    // ==============================================================

    if (url.pathname === '/api/analytics/ping') {
      if (request.method !== 'POST') {
        return new Response(
          JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
          {
            status: 405,
            headers: {
              'Content-Type': 'application/json',
              'Allow': 'POST',
              'Cache-Control': 'no-store',
            },
          }
        );
      }

      const { validateRequestOrigin } = await import('./auth.ts');
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
          JSON.stringify({ ok: false, error: 'Forbidden: Cross-origin request rejected' }),
          { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return new Response(
          JSON.stringify({ ok: false, error: 'Invalid JSON payload' }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
      const visitorId = typeof body?.visitorId === 'string' ? body.visitorId.trim() : '';
      if (!sessionId || !visitorId) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Missing sessionId or visitorId' }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      const { workerAnalyticsManager } = await import('./analytics.ts');
      const rawDevice = typeof body.device === 'string' ? body.device.trim() : 'mobile';
      const device: 'mobile' | 'desktop' | 'tablet' =
        rawDevice === 'desktop' || rawDevice === 'tablet' || rawDevice === 'mobile'
          ? rawDevice
          : 'mobile';

      const result = workerAnalyticsManager.ping({
        sessionId: sessionId.slice(0, 128),
        visitorId: visitorId.slice(0, 128),
        device,
        browser: typeof body.browser === 'string' && body.browser.trim() ? body.browser.trim().slice(0, 64) : 'Chrome',
        os: typeof body.os === 'string' && body.os.trim() ? body.os.trim().slice(0, 64) : 'Android',
        path: typeof body.path === 'string' && body.path.trim() ? body.path.trim().slice(0, 128) : '/dashboard',
        title: typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 160) : 'صفحه اصلی',
      });

      return new Response(
        JSON.stringify({ ok: true, ...result }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
      );
    }

    if (url.pathname === '/api/analytics/track') {
      if (request.method !== 'POST') {
        return new Response(
          JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
          {
            status: 405,
            headers: {
              'Content-Type': 'application/json',
              'Allow': 'POST',
              'Cache-Control': 'no-store',
            },
          }
        );
      }

      const { validateRequestOrigin } = await import('./auth.ts');
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
          JSON.stringify({ ok: false, error: 'Forbidden: Cross-origin request rejected' }),
          { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return new Response(
          JSON.stringify({ ok: false, error: 'Invalid JSON payload' }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : '';
      const visitorId = typeof body?.visitorId === 'string' ? body.visitorId.trim() : '';
      if (!sessionId || !visitorId) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Missing visitorId or sessionId' }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      const { workerAnalyticsManager } = await import('./analytics.ts');
      const rawDevice = typeof body.device === 'string' ? body.device.trim() : 'mobile';
      const device: 'mobile' | 'desktop' | 'tablet' =
        rawDevice === 'desktop' || rawDevice === 'tablet' || rawDevice === 'mobile'
          ? rawDevice
          : 'mobile';

      await workerAnalyticsManager.track(
        {
          visitorId: visitorId.slice(0, 128),
          sessionId: sessionId.slice(0, 128),
          device,
          browser: typeof body.browser === 'string' && body.browser.trim() ? body.browser.trim().slice(0, 64) : 'Chrome',
          os: typeof body.os === 'string' && body.os.trim() ? body.os.trim().slice(0, 64) : 'Android',
          path: typeof body.path === 'string' && body.path.trim() ? body.path.trim().slice(0, 128) : '/dashboard',
          title: typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 160) : 'مشاهده صفحه',
          eventType: typeof body.eventType === 'string' && body.eventType.trim() ? body.eventType.trim().slice(0, 64) : 'pageview',
          referrer: typeof body.referrer === 'string' ? body.referrer.trim().slice(0, 256) : '',
        },
        env.DB
      );

      return new Response(
        JSON.stringify({ ok: true, onlineUsersCount: workerAnalyticsManager.getOnlineCount() }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
      );
    }

    if (url.pathname === '/api/analytics/stats') {
      if (request.method !== 'GET') {
        return new Response(
          JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
          {
            status: 405,
            headers: {
              'Content-Type': 'application/json',
              'Allow': 'GET',
              'Cache-Control': 'no-store',
            },
          }
        );
      }

      const { workerAnalyticsManager, verifyAdminAnalyticsAccess } = await import('./analytics.ts');
      const access = await verifyAdminAnalyticsAccess(request, env);

      const detailedParam = (url.searchParams.get('detailed') || '').toLowerCase();
      const scopeParam = (url.searchParams.get('scope') || url.searchParams.get('view') || '').toLowerCase();
      const headerScope = (request.headers.get('X-Analytics-Scope') || '').toLowerCase();
      const explicitlyRequestedDetailed =
        detailedParam === 'true' ||
        detailedParam === '1' ||
        scopeParam === 'admin' ||
        scopeParam === 'detailed' ||
        headerScope === 'admin' ||
        headerScope === 'detailed';

      if (explicitlyRequestedDetailed) {
        if (!access.isAuthenticated) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: 'Unauthorized: Verified administrator session is required for detailed analytics.',
            }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }
        if (!access.isAdmin) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: 'Forbidden: Verified administrator privileges are required for detailed analytics.',
            }),
            { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }
      }

      const stats = await workerAnalyticsManager.getStats({
        isAdmin: access.isAdmin,
        db: env.DB,
      });

      return new Response(
        JSON.stringify(stats),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
      );
    }

    if (url.pathname === '/api/reports/student-summary') {
      if (request.method !== 'POST') {
        return new Response(
          JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
          {
            status: 405,
            headers: {
              'Content-Type': 'application/json',
              'Allow': 'POST',
              'Cache-Control': 'no-store',
            },
          }
        );
      }

      const {
        validateRequestOrigin,
        extractBearerToken,
        extractGuestToken,
        hashSessionToken,
      } = await import('./auth.ts');

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
          JSON.stringify({ ok: false, error: 'Forbidden: Cross-origin request rejected' }),
          { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return new Response(
          JSON.stringify({ ok: false, error: 'Invalid JSON payload' }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Invalid report payload' }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      const { buildStudentSummaryReport } = await import('./analytics.ts');
      let verifiedContext: {
        user: import('./db/schema.ts').SyncedUserProfile;
        verifiedCompletedStages: Set<number>;
      } | null = null;

      const requestedUserId = typeof body.userId === 'string' ? body.userId.trim() : '';

      if (env.DB) {
        const { D1UserRepository } = await import('./db/userRepository.ts');
        const userRepo = new D1UserRepository(env.DB);
        const rawBearer = extractBearerToken(request);
        const rawGuest = extractGuestToken(request, body);
        const rawToken = rawBearer || rawGuest;

        if (rawToken) {
          const tokenHash = await hashSessionToken(rawToken);
          const sessionResult = await userRepo.validateSession(tokenHash);
          if (!sessionResult) {
            return new Response(
              JSON.stringify({ ok: false, error: 'Unauthorized: Invalid or expired session token' }),
              { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
            );
          }
          if (requestedUserId && requestedUserId !== sessionResult.user.userId) {
            return new Response(
              JSON.stringify({ ok: false, error: 'Forbidden: Cannot generate verified report for another user' }),
              { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
            );
          }
          const verifiedCompletedStages = await userRepo.getVerifiedCompletedStageNumbers(
            sessionResult.user.userId
          );
          verifiedContext = {
            user: sessionResult.user,
            verifiedCompletedStages,
          };
        } else if (requestedUserId) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Unauthorized: Session token required to request user report by userId' }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }
      }

      const report = buildStudentSummaryReport(body, verifiedContext);

      return new Response(
        JSON.stringify({ ok: true, verified: report.verified, report }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
      );
    }

    // ==============================================================
    // Phase 10B: Advanced Entrance Exam Simulator Endpoints (/api/exams/*)
    // ==============================================================

    if (url.pathname.startsWith('/api/exams/')) {
      if (!env.DB) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Database service is unavailable' }),
          { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      const { D1ExamRepository } = await import('./db/examRepository.ts');
      const { D1UserRepository } = await import('./db/userRepository.ts');
      const {
        validateRequestOrigin,
        extractBearerToken,
        extractGuestToken,
        hashSessionToken,
      } = await import('./auth.ts');

      const examRepo = new D1ExamRepository(env.DB);
      const userRepo = new D1UserRepository(env.DB);

      // Validate Origin / Referer / Sec-Fetch-Site on state-changing exam requests
      if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
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
            JSON.stringify({ ok: false, error: 'Forbidden: Cross-origin request rejected' }),
            { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }
      }

      // 1. GET /api/exams/blueprints
      if (url.pathname === '/api/exams/blueprints') {
        if (request.method !== 'GET') {
          return new Response(
            JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
            {
              status: 405,
              headers: {
                'Content-Type': 'application/json',
                'Allow': 'GET',
                'Cache-Control': 'no-store',
              },
            }
          );
        }

        try {
          const blueprints = await examRepo.listBlueprints();
          return new Response(
            JSON.stringify({ ok: true, blueprints }),
            { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        } catch (err: unknown) {
          console.error('Error listing exam blueprints in worker:', err);
          return new Response(
            JSON.stringify({ ok: false, error: 'خطا در بازیابی فهرست آزمون‌ها.' }),
            { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }
      }

      // Helper to resolve authenticated user (Google session or active guest session)
      const resolveAuthenticatedExamUser = async (body?: Record<string, unknown>) => {
        const rawBearer = extractBearerToken(request);
        const rawGuest = extractGuestToken(request, body);
        const rawToken = rawBearer || rawGuest;
        if (!rawToken) return null;
        const tokenHash = await hashSessionToken(rawToken);
        return userRepo.validateSession(tokenHash);
      };

      // 2. POST /api/exams/attempts/start
      if (url.pathname === '/api/exams/attempts/start') {
        if (request.method !== 'POST') {
          return new Response(
            JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
            {
              status: 405,
              headers: {
                'Content-Type': 'application/json',
                'Allow': 'POST',
                'Cache-Control': 'no-store',
              },
            }
          );
        }

        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response(
            JSON.stringify({ ok: false, error: 'ساختار درخواست نامعتبر است.' }),
            { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const sessionResult = await resolveAuthenticatedExamUser(body);
        if (!sessionResult) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Unauthorized: Active session token is required to start an exam' }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const requestedUserId = typeof body.userId === 'string' ? body.userId.trim() : '';
        if (requestedUserId && requestedUserId !== sessionResult.user.userId) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Forbidden: Cannot start exam attempt for another user' }),
            { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const blueprintId = typeof body.blueprintId === 'string' ? body.blueprintId.trim() : '';
        const idempotencyKey =
          typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : undefined;

        const result = await examRepo.startAttempt({
          userId: sessionResult.user.userId,
          blueprintId,
          idempotencyKey,
        });

        if (!result.ok) {
          return new Response(
            JSON.stringify({ ok: false, error: result.error }),
            { status: result.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        return new Response(
          JSON.stringify({
            ok: true,
            mode: 'active',
            ...result.data,
          }),
          { status: result.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      // 3. GET /api/exams/history
      if (url.pathname === '/api/exams/history') {
        if (request.method !== 'GET') {
          return new Response(
            JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
            {
              status: 405,
              headers: {
                'Content-Type': 'application/json',
                'Allow': 'GET',
                'Cache-Control': 'no-store',
              },
            }
          );
        }

        const sessionResult = await resolveAuthenticatedExamUser();
        if (!sessionResult) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Unauthorized: Active session required to view exam history' }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const requestedUserId = url.searchParams.get('userId')?.trim() || '';
        if (requestedUserId && requestedUserId !== sessionResult.user.userId) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Forbidden: Cannot view another user exam history' }),
            { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const rawLimit = url.searchParams.get('limit');
        const limit = rawLimit !== null ? Number(rawLimit) : 20;
        const history = await examRepo.getUserExamHistory(
          sessionResult.user.userId,
          Number.isFinite(limit) ? limit : 20
        );

        return new Response(
          JSON.stringify({ ok: true, ...history }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      // 4. Attempt-specific routes:
      //    - GET /api/exams/attempts/:attemptId
      //    - PUT/POST /api/exams/attempts/:attemptId/answer
      //    - POST /api/exams/attempts/:attemptId/submit
      const answerMatch = /^\/api\/exams\/attempts\/([^/]+)\/answer$/.exec(url.pathname);
      if (answerMatch) {
        if (request.method !== 'PUT' && request.method !== 'POST') {
          return new Response(
            JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
            {
              status: 405,
              headers: {
                'Content-Type': 'application/json',
                'Allow': 'PUT, POST',
                'Cache-Control': 'no-store',
              },
            }
          );
        }

        const attemptId = decodeURIComponent(answerMatch[1]).trim();
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response(
            JSON.stringify({ ok: false, error: 'ساختار درخواست نامعتبر است.' }),
            { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const sessionResult = await resolveAuthenticatedExamUser(body);
        if (!sessionResult) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const questionId = typeof body.questionId === 'string' ? body.questionId.trim() : '';
        const selectedIndex =
          body.selectedIndex === null
            ? null
            : typeof body.selectedIndex === 'number'
            ? body.selectedIndex
            : undefined;
        const isFlagged = typeof body.isFlagged === 'boolean' ? body.isFlagged : undefined;
        const timeSpentSeconds =
          typeof body.timeSpentSeconds === 'number' ? body.timeSpentSeconds : undefined;
        const clientUpdatedAt =
          typeof body.clientUpdatedAt === 'string' && body.clientUpdatedAt.trim()
            ? body.clientUpdatedAt.trim()
            : undefined;

        const saveResult = await examRepo.saveAnswer({
          attemptId,
          userId: sessionResult.user.userId,
          questionId,
          selectedIndex,
          isFlagged,
          timeSpentSeconds,
          clientUpdatedAt,
        });

        if (!saveResult.ok) {
          return new Response(
            JSON.stringify({ ok: false, code: saveResult.code, error: saveResult.error }),
            { status: saveResult.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        return new Response(
          JSON.stringify({
            ok: true,
            answer: saveResult.answer,
            remainingSeconds: saveResult.remainingSeconds,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      const submitMatch = /^\/api\/exams\/attempts\/([^/]+)\/submit$/.exec(url.pathname);
      if (submitMatch) {
        if (request.method !== 'POST') {
          return new Response(
            JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
            {
              status: 405,
              headers: {
                'Content-Type': 'application/json',
                'Allow': 'POST',
                'Cache-Control': 'no-store',
              },
            }
          );
        }

        const attemptId = decodeURIComponent(submitMatch[1]).trim();
        let body: Record<string, unknown> = {};
        try {
          const text = await request.text();
          if (text && text.trim()) {
            body = JSON.parse(text) as Record<string, unknown>;
          }
        } catch {
          return new Response(
            JSON.stringify({ ok: false, error: 'ساختار درخواست نامعتبر است.' }),
            { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const sessionResult = await resolveAuthenticatedExamUser(body);
        if (!sessionResult) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const submitResult = await examRepo.submitAttempt({
          attemptId,
          userId: sessionResult.user.userId,
          answers: Array.isArray(body.answers) ? (body.answers as any) : undefined,
          durationSecondsUsed:
            typeof body.durationSecondsUsed === 'number' ? body.durationSecondsUsed : undefined,
        });

        if (!submitResult.ok) {
          return new Response(
            JSON.stringify({ ok: false, error: submitResult.error }),
            { status: submitResult.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        return new Response(
          JSON.stringify({
            ok: true,
            mode: 'submitted',
            ...submitResult.data,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      const getAttemptMatch = /^\/api\/exams\/attempts\/([^/]+)$/.exec(url.pathname);
      if (getAttemptMatch && getAttemptMatch[1] !== 'start') {
        if (request.method !== 'GET') {
          return new Response(
            JSON.stringify({ ok: false, error: 'Method Not Allowed' }),
            {
              status: 405,
              headers: {
                'Content-Type': 'application/json',
                'Allow': 'GET',
                'Cache-Control': 'no-store',
              },
            }
          );
        }

        const attemptId = decodeURIComponent(getAttemptMatch[1]).trim();
        const sessionResult = await resolveAuthenticatedExamUser();
        if (!sessionResult) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        const loaded = await examRepo.getAttemptForUser(attemptId, sessionResult.user.userId);
        if (!loaded.ok) {
          return new Response(
            JSON.stringify({ ok: false, error: loaded.error }),
            { status: loaded.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
          );
        }

        return new Response(
          JSON.stringify({
            ok: true,
            mode: loaded.mode,
            ...loaded.data,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      return new Response(
        JSON.stringify({ ok: false, error: 'Not Found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
      );
    }

    // Explicit JSON 404 for any unmatched /api/* route (never fall through to SPA HTML)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Not Found' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    // Pass-through to static assets (SPA) if ASSETS binding is present
    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (
        assetResponse.status === 404 &&
        request.method === 'GET' &&
        !url.pathname.split('/').pop()?.includes('.')
      ) {
        const indexUrl = new URL('/index.html', url.origin);
        return env.ASSETS.fetch(new Request(indexUrl.toString(), request));
      }
      return assetResponse;
    }

    // Default info response for worker entry point
    return new Response(
      JSON.stringify({
        name: 'psychomaster-worker',
        version: 'phase-10b',
        endpoints: [
          '/api/health',
          '/api/d1/health',
          '/api/d1-health',
          '/api/auth/nonce',
          '/api/auth/google',
          '/api/auth/me',
          '/api/auth/merge',
          '/api/auth/logout',
          '/api/auth/profile',
          '/api/user/sync',
          '/api/leaderboard',
          '/api/leaderboard/submit',
          '/api/quiz/bank',
          '/api/quiz/bank/generate',
          '/api/exams/blueprints',
          '/api/exams/attempts/start',
          '/api/exams/attempts/:attemptId',
          '/api/exams/attempts/:attemptId/answer',
          '/api/exams/attempts/:attemptId/submit',
          '/api/exams/history',
          '/api/ai/mentor',
          '/api/ai/mentor/stream',
          '/api/ai/adaptive-plan',
          '/api/analytics/ping',
          '/api/analytics/track',
          '/api/analytics/stats',
          '/api/reports/student-summary',
        ],
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  },
};
