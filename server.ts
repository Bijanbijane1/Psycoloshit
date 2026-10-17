import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { analyticsManager } from './src/server/analyticsStore';
import { createRateLimiter } from './src/server/rateLimiter';
import { aiCache } from './src/server/aiCache';
import { userSyncManager, SEEDED_COMPETITOR_IDS } from './src/server/userStore';
import { questionBankRepo } from './src/server/questionBank';
import {
  hashSessionToken,
  generateSessionToken,
  generateAuthNonce,
  verifyGoogleIdToken,
  GoogleAuthError,
  extractCookieValue,
  buildCookieHeader,
  validateRequestOrigin,
} from './src/worker/auth';
import {
  isValidUserIdFormat,
  verifyRewardSubmission,
} from './src/worker/rewards';
import type { JWTVerifyGetKey } from 'jose';

dotenv.config();

if (process.env.DISABLE_HMR === undefined) {
  process.env.DISABLE_HMR = 'true';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const port = parseInt(process.env.PORT || '3000', 10);
const isProduction = process.env.NODE_ENV === 'production';

// Optional DI hook for isolated cryptographic tests against Express routes
let testGoogleJwksOverride: JWTVerifyGetKey | undefined;
let testGoogleClientIdOverride: string | undefined;

export function setExpressAuthTestOverrides(opts?: {
  jwks?: JWTVerifyGetKey;
  clientId?: string;
}) {
  testGoogleJwksOverride = opts?.jwks;
  testGoogleClientIdOverride = opts?.clientId;
}

app.use(express.json());

// Apply rate limiting middleware
const generalLimiter = createRateLimiter(60000, 150);
const aiLimiter = createRateLimiter(
  60000,
  35,
  'تعداد درخواست‌های هوش مصنوعی در این دقیقه به سقف مجاز رسید. لطفاً ۳۰ ثانیه دیگر تلاش فرمایید.'
);

app.use('/api/', generalLimiter);
app.use('/api/ai/', aiLimiter);

// Initialize Google GenAI
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getMentorSystemInstruction() {
  return `شما یک استاد تمام و منتور ارشد روان‌شناسی آکادمیک (PsychoMaster Mentor) هستید. 
به پرسش‌های دانشجویان و داوطلبان درباره مفاهیم روان‌شناسی، مکاتب، سبب‌شناسی اختلالات، نظریه‌های رشد، روش تحقیق و نوروپسیکولوژی پاسخ می‌دهید.
قواعد پاسخگویی:
۱. پاسخ دقیق، مستند به منابع معتبر (مانند اتکینسون و هیلگارد، کاپلان و سادوک، دی‌اس‌ام ۵-TR، شولتز و نظریه‌های شخصیت).
۲. در صورت لزوم، تفاوت ظریف اصطلاحات گیج‌کننده (مانند OCPD در برابر OCD یا دپلاریزاسیون در برابر هایپرپلاریزاسیون) را با مثال‌های شهودی و ملموس تفکیک کن.
۳. ادبیات علمی، صمیمی، انگیزاننده و به زبان فارسی روان.
۴. در پایان، یک نکته کنکوری یا سوال تفکرانگیز کوتاه برای سنجش درک کاربر ارائه بده.`;
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    aiAvailable: !!ai,
    cacheStats: aiCache.getStats(),
    questionBankSize: questionBankRepo.getTotalCount(),
    timestamp: new Date().toISOString(),
  });
});

// Honest Local Database Health Check (Express Development Backend)
// Reports local Node SQLite status truthfully and never claims remote Cloudflare D1 connectivity.
const handleD1Health = (req: express.Request, res: express.Response) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const startTime = Date.now();
  const dbCheck = userSyncManager.checkDatabaseHealth();
  const latencyMs = Math.max(1, Date.now() - startTime);

  return res.json({
    ok: dbCheck.ok,
    status: dbCheck.ok ? 'local_sqlite_connected' : 'unavailable',
    environment: 'express-development',
    d1Connected: false,
    engine: dbCheck.engine,
    storagePath: 'data/psychomaster.sqlite',
    note: 'Express development server inspects local Node SQLite storage, not remote Cloudflare D1.',
    latencyMs,
    server_utc: new Date().toISOString(),
  });
};

app.get('/api/d1/health', handleD1Health);
app.get('/api/d1-health', handleD1Health);
app.all('/api/d1/health', handleD1Health);
app.all('/api/d1-health', handleD1Health);

// ==============================================================
// 1. SITE VISITOR & REAL-TIME TRAFFIC ANALYTICS ENDPOINTS
// ==============================================================

// Real-time ping/heartbeat endpoint
app.post('/api/analytics/ping', (req, res) => {
  try {
    const { visitorId, sessionId, device, browser, os, path: currentPath, title } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const result = analyticsManager.ping({
      sessionId: String(sessionId),
      visitorId: String(visitorId || 'v_unknown'),
      device: (device || 'mobile') as 'mobile' | 'desktop' | 'tablet',
      browser: String(browser || 'Chrome'),
      os: String(os || 'Android'),
      path: String(currentPath || '/dashboard'),
      title: String(title || 'صفحه اصلی'),
      ip: req.ip,
    });

    return res.json(result);
  } catch (err) {
    console.error('Analytics ping error:', err);
    return res.status(500).json({ error: 'Failed to record ping' });
  }
});

// Track pageviews and learning activity events
app.post('/api/analytics/track', (req, res) => {
  try {
    const {
      visitorId,
      sessionId,
      device,
      browser,
      os,
      path: currentPath,
      title,
      eventType,
      referrer,
    } = req.body;

    if (!visitorId || !sessionId) {
      return res.status(400).json({ error: 'visitorId and sessionId are required' });
    }

    analyticsManager.track({
      visitorId: String(visitorId),
      sessionId: String(sessionId),
      device: (device || 'mobile') as 'mobile' | 'desktop' | 'tablet',
      browser: String(browser || 'Chrome'),
      os: String(os || 'Android'),
      path: String(currentPath || '/dashboard'),
      title: String(title || 'صفحه اصلی'),
      eventType: String(eventType || 'pageview'),
      referrer: String(referrer || ''),
      ip: req.ip,
    });

    return res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Analytics track error:', err);
    return res.status(500).json({ error: 'Failed to record tracking event' });
  }
});

// Retrieve comprehensive site traffic analytics
app.get('/api/analytics/stats', (req, res) => {
  try {
    const visitorId = req.query.visitorId ? String(req.query.visitorId) : undefined;
    const sessionId = req.query.sessionId ? String(req.query.sessionId) : undefined;

    const stats = analyticsManager.getStats(visitorId, sessionId);
    return res.json(stats);
  } catch (err) {
    console.error('Analytics stats error:', err);
    return res.status(500).json({ error: 'Failed to retrieve analytics stats' });
  }
});

// ==============================================================
// 2. AI MENTOR (STREAMING SSE + SMART CACHING + OFFLINE FALLBACK)
// ==============================================================

// Real-time Streaming SSE AI Mentor Endpoint
app.post(['/api/ai/mentor/stream', '/api/ai/ask-mentor/stream'], async (req, res) => {
  const { question, chapterTitle, chapterContext, sectionTitle, userLevel } = req.body;
  if (!question) {
    return res.status(400).json({ error: 'سوال کاربر الزامی است.' });
  }

  const context = chapterTitle || chapterContext || 'کلیات روان‌شناسی آکادمیک';

  // 1. Check AI Cache first
  const cached = aiCache.get(question, context);
  if (cached) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ text: cached.response, cached: true })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  // 2. Offline fallback if Gemini is not configured
  if (!ai) {
    const fallbackText = `پاسخ آفلاین پایگاه دانش: درباره "${question}"، مبحث مربوطه در سرفصل "${context}" به دقت در متون آکادمیک و ساده کتابخانه تدوین شده است. پیشنهاد می‌شود بخش نکات کلیدی و مقایسه مفاهیم را در کتابخانه مرور فرمایید.`;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ text: fallbackText, offline: true })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  // 3. Stream from Gemini 3.8 Flash
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const prompt = `دانشجو در حال مطالعه سرفصل زیر است:
- بخش: ${sectionTitle || 'عمومی'}
- مبحث/فصل: ${context}
- سطح علمی کاربر: ${userLevel || 'متوسط'}

پرسش یا اشکال دانشجو:
"${question}"

لطفاً به جامع‌ترین و شیواترین شکل ممکن پاسخ دهید و اشکال او را برطرف کنید.`;

    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: getMentorSystemInstruction(),
      },
    });

    let fullText = '';
    for await (const chunk of responseStream) {
      const text = chunk.text || '';
      fullText += text;
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }

    if (fullText) {
      aiCache.set(question, fullText, context, 'gemini');
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: any) {
    console.error('Streaming mentor error:', err);
    res.write(
      `data: ${JSON.stringify({
        error: 'خطا در ارتباط زنده با هوش مصنوعی. سیستم به پاسخ آفلاین سوئیچ کرد.',
      })}\n\n`
    );
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// Standard Non-streaming AI Mentor Endpoint (with Caching)
app.post(['/api/ai/mentor', '/api/ai/ask-mentor'], async (req, res) => {
  try {
    const { question, chapterTitle, chapterContext, sectionTitle, userLevel } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'سوال کاربر الزامی است.' });
    }

    const context = chapterTitle || chapterContext || 'کلیات روان‌شناسی';

    // Check cache
    const cached = aiCache.get(question, context);
    if (cached) {
      return res.json({
        reply: cached.response,
        source: 'cache',
        hitCount: cached.hitCount,
      });
    }

    if (!ai) {
      return res.json({
        reply: `پاسخ آفلاین پایگاه دانش: درباره "${question}"، مبحث مربوطه در سرفصل "${context}" به دقت در متون آکادمیک و ساده کتابخانه تدوین شده است. پیشنهاد می‌شود بخش نکات کلیدی و مقایسه مفاهیم را در کتابخانه مرور فرمایید.`,
        source: 'offline-fallback',
      });
    }

    const prompt = `دانشجو در حال مطالعه سرفصل زیر است:
- بخش: ${sectionTitle || 'عمومی'}
- مبحث/فصل: ${context}
- سطح علمی کاربر: ${userLevel || 'متوسط'}

پرسش یا اشکال دانشجو:
"${question}"

لطفاً به جامع‌ترین و شیواترین شکل ممکن پاسخ دهید و اشکال او را برطرف کنید.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: getMentorSystemInstruction(),
      },
    });

    const reply = response.text || 'پاسخی دریافت نشد.';
    aiCache.set(question, reply, context, 'gemini');

    return res.json({
      reply,
      source: 'gemini',
    });
  } catch (error: any) {
    console.error('Mentor error:', error);
    return res.status(500).json({
      error: 'خطا در برقراری ارتباط با منتور هوش مصنوعی',
      fallback: 'سیستم در حال حاضر به پاسخ‌گوی آفلاین سوئیچ کرد. می‌توانید متن ساده کتاب را مطالعه کنید.',
    });
  }
});

// AI Adaptive Study Recommendation endpoint
app.post('/api/ai/adaptive-plan', async (req, res) => {
  try {
    const { stats, weakChapters } = req.body;

    if (!ai) {
      return res.json({
        plan: 'برنامه مطالعه پیشنهادی بر اساس الگوهای یادگیری: پیشنهاد می‌شود ۳۰ دقیقه روی فصول با تسلط زیر ۶۰٪ متمرکز شوید، ابتدا متن ساده و سپس سوالات تشریحی بالینی را حل نمایید.',
        levelRecommendation: 'متوسط رو به پیشرفته',
      });
    }

    const prompt = `با توجه به کارنامه تحصیلی زیر از کاربر در سامانه آموزش روان‌شناسی:
- درصد کلی تسلط: ${stats?.overallMastery || 50}%
- تعداد پاسخ‌های درست: ${stats?.correctCount || 0}
- تعداد پاسخ‌های نادرست: ${stats?.incorrectCount || 0}
- فصول نیازمند تقویت: ${JSON.stringify(weakChapters || [])}

لطفاً در ۳ بخش کوتاه و کاربردی به زبان فارسی تحلیل و راهکار بده:
۱. تحلیل سرعت و دقت یادگیری
۲. سطح دشواری پیشنهادی برای مرحله بعد (آسان، استاندارد، پیشرفته و چرایی آن)
۳. نقشه راه اختصاصی ۳ روز آینده برای تسلط کامل`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: 'شما مشاور تحصیلی تخصصی دکتری روان‌شناسی هستید که برنامه‌های مطالعه تطبیقی تنظیم می‌کنید.',
      },
    });

    return res.json({
      plan: response.text || '',
    });
  } catch (error) {
    console.error('Adaptive plan error:', error);
    return res.json({
      plan: 'پیشنهاد می‌کنیم فصول دارای خطای پرتکرار را مجدداً با سوییچ به حالت متن ساده مرور فرمایید.',
    });
  }
});

// ==============================================================
// 3. DYNAMIC QUESTION BANK & AI GENERATION REPOSITORY
// ==============================================================

app.get('/api/quiz/bank', (req, res) => {
  try {
    const chapterId = req.query.chapterId ? String(req.query.chapterId) : undefined;
    const difficulty = req.query.difficulty ? String(req.query.difficulty) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 5;

    const questions = questionBankRepo.getQuestions(chapterId, difficulty, limit);
    return res.json({
      count: questions.length,
      totalBankSize: questionBankRepo.getTotalCount(),
      questions,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch question bank' });
  }
});

app.post('/api/quiz/bank/generate', async (req, res) => {
  try {
    const { chapterId, chapterTitle, difficulty = 'medium' } = req.body;

    if (!ai) {
      return res.status(503).json({ error: 'سرویس هوش مصنوعی برای تولید سوال فعال نیست.' });
    }

    const prompt = `برای سرفصل روان‌شناسی "${chapterTitle || 'کلیات'}" با سطح دشواری "${difficulty}"، یک سوال چهارگزینه‌ای مفهومی کنکوری جدید با این ساختار JSON تولید کن:
{
  "question": "متن سوال با جزئیات دقیق علمی",
  "options": ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
  "correctIndex": 0,
  "explanation": "تحلیل تشریحی درستی این گزینه و رد سایر گزینه‌ها"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    if (parsed.question && Array.isArray(parsed.options)) {
      const saved = questionBankRepo.addQuestion({
        chapterId: chapterId || 'general',
        chapterTitle: chapterTitle || 'عمومی',
        difficulty: difficulty as any,
        question: parsed.question,
        options: parsed.options,
        correctIndex: parsed.correctIndex || 0,
        explanation: parsed.explanation || '',
        source: 'ai-generated',
      });
      return res.json({ success: true, question: saved });
    }

    return res.status(400).json({ error: 'ساختار سوال نامعتبر بود.' });
  } catch (err) {
    console.error('Question generation error:', err);
    return res.status(500).json({ error: 'خطا در تولید سوال تعاملی.' });
  }
});

// ==============================================================
// 3.5. PRODUCTION-READY GOOGLE AUTH & HASHED SESSIONS (PHASE 6B)
// ==============================================================

function extractRequestToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const t = authHeader.substring(7).trim();
    if (t) return t;
  }
  return extractCookieValue(req.headers.cookie, 'session_token');
}

function extractExpressGuestToken(req: express.Request): string | null {
  const cookieToken = extractCookieValue(req.headers.cookie, 'guest_session_token');
  if (cookieToken && /^[a-zA-Z0-9_-]+$/.test(cookieToken)) {
    return cookieToken;
  }
  const headerVal = req.headers['x-guest-token'];
  const headerToken = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (headerToken && /^[a-zA-Z0-9_-]+$/.test(headerToken.trim())) {
    return headerToken.trim();
  }
  const bodyToken = req.body && typeof req.body.guestToken === 'string' ? req.body.guestToken.trim() : '';
  if (bodyToken && /^[a-zA-Z0-9_-]+$/.test(bodyToken)) {
    return bodyToken;
  }
  return null;
}

function isSecureRequest(req: express.Request): boolean {
  return (
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production'
  );
}

function buildSessionCookieHeader(req: express.Request, rawToken: string, maxAge: number): string {
  return buildCookieHeader('session_token', rawToken, maxAge, isSecureRequest(req));
}

function buildNonceCookieHeader(req: express.Request, nonce: string, maxAge: number): string {
  return buildCookieHeader('oauth_nonce', nonce, maxAge, isSecureRequest(req));
}

function buildGuestCookieHeader(req: express.Request, rawToken: string, maxAge: number): string {
  return buildCookieHeader('guest_session_token', rawToken, maxAge, isSecureRequest(req));
}

let testGoogleJwks: JWTVerifyGetKey | null = null;
export function setTestGoogleJwks(jwks: JWTVerifyGetKey | null) {
  testGoogleJwks = jwks;
}

function validateExpressOrigin(req: express.Request): boolean {
  const originHeader = req.headers.origin !== undefined ? String(req.headers.origin) : null;
  const refererHeader = req.headers.referer !== undefined ? String(req.headers.referer) : null;
  const secFetchSiteRaw = req.headers['sec-fetch-site'];
  const secFetchSiteHeader = Array.isArray(secFetchSiteRaw)
    ? secFetchSiteRaw[0]
    : secFetchSiteRaw !== undefined
    ? String(secFetchSiteRaw)
    : null;

  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${port}`;
  const proto = isSecureRequest(req) ? 'https' : 'http';
  const expectedHostOrigin = `${proto}://${host}`;
  return validateRequestOrigin(
    originHeader,
    [
      expectedHostOrigin,
      `http://localhost:${port}`,
      'http://localhost:3000',
      process.env.APP_URL,
    ],
    {
      refererHeader,
      secFetchSiteHeader,
    }
  );
}

app.all('/api/auth/accounts', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(404).json({ ok: false, error: 'Not Found' });
});

app.get('/api/auth/nonce', async (req, res) => {
  const configuredClientId = (
    testGoogleClientIdOverride ||
    process.env.GOOGLE_CLIENT_ID ||
    process.env.VITE_GOOGLE_CLIENT_ID ||
    ''
  ).trim();
  const clientIdConfigured = Boolean(
    configuredClientId &&
      configuredClientId !== 'MY_GOOGLE_CLIENT_ID' &&
      configuredClientId !== 'YOUR_GOOGLE_CLIENT_ID'
  );
  const nonce = generateAuthNonce();
  const nonceHash = await hashSessionToken(nonce);
  userSyncManager.createAuthNonce(nonceHash, 600);

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', buildNonceCookieHeader(req, nonce, 600));
  return res.json({
    ok: true,
    nonce,
    clientIdConfigured,
    googleAuthConfigured: clientIdConfigured,
  });
});

app.post('/api/auth/google', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');

    if (!validateExpressOrigin(req)) {
      return res.status(403).json({
        ok: false,
        code: 'INVALID_ORIGIN',
        error: 'درخواست از مبدا غیرمجاز رد شد.',
      });
    }

    const configuredClientId = (
      testGoogleClientIdOverride ||
      process.env.GOOGLE_CLIENT_ID ||
      process.env.VITE_GOOGLE_CLIENT_ID ||
      ''
    ).trim();

    if (
      !configuredClientId ||
      configuredClientId === 'MY_GOOGLE_CLIENT_ID' ||
      configuredClientId === 'YOUR_GOOGLE_CLIENT_ID'
    ) {
      return res.status(503).json({
        ok: false,
        code: 'GOOGLE_CLIENT_ID_MISSING',
        error: 'احراز هویت گوگل روی سرور پیکربندی نشده است (GOOGLE_CLIENT_ID الزامی است).',
      });
    }

    const { credential, expectedNonce: bodyExpectedNonce, nonce: bodyNonce } = req.body || {};
    if (typeof credential !== 'string' || !credential.trim()) {
      return res.status(400).json({
        ok: false,
        code: 'MISSING_CREDENTIAL',
        error: 'توکن رسمی احراز هویت گوگل (credential) الزامی است.',
      });
    }

    const cookieNonce = extractCookieValue(req.headers.cookie, 'oauth_nonce');
    const explicitBodyNonce =
      typeof bodyExpectedNonce === 'string' && bodyExpectedNonce.trim()
        ? bodyExpectedNonce.trim()
        : typeof bodyNonce === 'string' && bodyNonce.trim()
        ? bodyNonce.trim()
        : undefined;

    const verifiedIdentity = await verifyGoogleIdToken(credential, {
      clientId: configuredClientId,
      expectedNonce: cookieNonce || explicitBodyNonce,
      jwks: testGoogleJwks || testGoogleJwksOverride || undefined,
    });

    if (!cookieNonce || (explicitBodyNonce && explicitBodyNonce !== cookieNonce)) {
      res.setHeader('Set-Cookie', buildNonceCookieHeader(req, '', 0));
      return res.status(401).json({
        ok: false,
        code: 'INVALID_NONCE',
        error: 'چالش امنیتی (oauth_nonce) در کوکی درخواست وجود ندارد یا مطابقت ندارد.',
      });
    }

    if (!verifiedIdentity.nonce || verifiedIdentity.nonce !== cookieNonce) {
      res.setHeader('Set-Cookie', buildNonceCookieHeader(req, '', 0));
      return res.status(401).json({
        ok: false,
        code: 'INVALID_NONCE',
        error: 'چالش امنیتی (nonce) در توکن گوگل وجود ندارد یا مطابقت ندارد.',
      });
    }

    const nonceHash = await hashSessionToken(cookieNonce);
    const nonceConsumed = userSyncManager.consumeAuthNonce(nonceHash);
    if (!nonceConsumed) {
      res.setHeader('Set-Cookie', buildNonceCookieHeader(req, '', 0));
      return res.status(401).json({
        ok: false,
        code: 'INVALID_NONCE',
        error: 'چالش امنیتی (nonce) نامعتبر، منقضی یا قبلاً استفاده شده است.',
      });
    }

    // Preserve guest progress until an explicit, authenticated /api/auth/merge request.
    const { user, isNew } = userSyncManager.createOrUpdateGoogleUser({
      googleId: verifiedIdentity.sub,
      email: verifiedIdentity.email,
      name: verifiedIdentity.name || 'دانشجوی روان‌شناسی',
      picture: verifiedIdentity.picture,
      mode: 'signin',
    });

    const rawToken = generateSessionToken();
    const tokenHash = await hashSessionToken(rawToken);
    userSyncManager.createSession(user.userId, tokenHash);

    res.setHeader('Set-Cookie', [
      buildSessionCookieHeader(req, rawToken, 2592000),
      buildNonceCookieHeader(req, '', 0),
    ]);

    return res.json({
      ok: true,
      user,
      isNew,
    });
  } catch (err) {
    res.setHeader('Set-Cookie', buildNonceCookieHeader(req, '', 0));
    if (err instanceof GoogleAuthError) {
      return res.status(err.status).json({
        ok: false,
        code: err.code,
        error: err.message,
      });
    }
    console.error('Google auth error in server:', err);
    return res.status(500).json({ ok: false, error: 'خطا در احراز هویت با گوگل.' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const token = extractRequestToken(req);

    if (!token) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const tokenHash = await hashSessionToken(token);
    const sessionResult = userSyncManager.validateSession(tokenHash);
    if (!sessionResult) {
      return res.status(401).json({ ok: false, error: 'نشست کاربری نامعتبر یا منقضی شده است.' });
    }

    return res.json({ ok: true, user: sessionResult.user });
  } catch (err) {
    console.error('Auth check error:', err);
    return res.status(500).json({ ok: false, error: 'خطا در اعتبارسنجی نشست.' });
  }
});

app.post('/api/auth/merge', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (!validateExpressOrigin(req)) {
      return res.status(403).json({ ok: false, error: 'درخواست از مبدا غیرمجاز رد شد.' });
    }

    const token = extractRequestToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const tokenHash = await hashSessionToken(token);
    const sessionResult = userSyncManager.validateSession(tokenHash);
    if (!sessionResult) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const { guestUserId: rawGuestId, guestProgress } = req.body || {};
    const guestUserId = typeof rawGuestId === 'string' ? rawGuestId.trim() : '';
    if (!guestUserId) {
      return res.status(400).json({ ok: false, error: 'guestUserId الزامی است.' });
    }

    if (
      guestUserId === sessionResult.user.userId ||
      guestUserId.startsWith('usr_g_') ||
      SEEDED_COMPETITOR_IDS.has(guestUserId)
    ) {
      return res.status(403).json({ ok: false, error: 'Forbidden: حساب انتخاب‌شده قابل ادغام به عنوان مهمان نیست.' });
    }

    const existingGuest = userSyncManager.getUser(guestUserId);
    if (existingGuest && existingGuest.googleId) {
      return res.status(403).json({ ok: false, error: 'Forbidden: حساب کاربری گوگل به عنوان مهمان قابل ادغام نیست.' });
    }

    if (existingGuest) {
      const rawGuestToken = extractExpressGuestToken(req);
      let verifiedGuestOwnerId: string | null = null;
      if (rawGuestToken) {
        const guestTokenHash = await hashSessionToken(rawGuestToken);
        const guestSession = userSyncManager.validateSession(guestTokenHash);
        if (guestSession) {
          verifiedGuestOwnerId = guestSession.user.userId;
        }
      }
      if (verifiedGuestOwnerId !== guestUserId) {
        return res.status(403).json({
          ok: false,
          error: 'Forbidden: مالکیت نشست مهمان برای ادغام تایید نشد.',
        });
      }
    }

    const mergedUser = userSyncManager.mergeGuestIntoUser(
      sessionResult.user.userId,
      guestUserId,
      guestProgress
    );

    userSyncManager.deleteUserSessions(guestUserId);
    res.setHeader('Set-Cookie', buildGuestCookieHeader(req, '', 0));

    return res.json({ ok: true, user: mergedUser });
  } catch (err) {
    console.error('Merge error in server:', err);
    return res.status(500).json({ ok: false, error: 'خطا در ادغام پیشرفت کاربر.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (!validateExpressOrigin(req)) {
      return res.status(403).json({ ok: false, error: 'درخواست از مبدا غیرمجاز رد شد.' });
    }

    const token = extractRequestToken(req);
    if (token) {
      const tokenHash = await hashSessionToken(token);
      userSyncManager.deleteSession(tokenHash);
    }

    res.setHeader('Set-Cookie', buildSessionCookieHeader(req, '', 0));
    return res.json({ ok: true, message: 'از حساب کاربری خارج شدید.' });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ ok: false, error: 'خطا در خروج از حساب.' });
  }
});

const handleExpressProfileUpdate = async (req: express.Request, res: express.Response) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (!validateExpressOrigin(req)) {
      return res.status(403).json({ ok: false, error: 'درخواست از مبدا غیرمجاز رد شد.' });
    }

    const token = extractRequestToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const tokenHash = await hashSessionToken(token);
    const sessionResult = userSyncManager.validateSession(tokenHash);
    if (!sessionResult) {
      return res.status(401).json({ ok: false, error: 'نشست کاربری نامعتبر است.' });
    }

    const { name, avatar } = req.body || {};
    const updated = userSyncManager.updateProfile(sessionResult.user.userId, { name, avatar });
    return res.json({ ok: true, user: updated });
  } catch (err) {
    console.error('Profile update error:', err);
    return res.status(500).json({ ok: false, error: 'خطا در ذخیره مشخصات کاربر.' });
  }
};

app.post('/api/auth/profile', handleExpressProfileUpdate);
app.put('/api/auth/profile', handleExpressProfileUpdate);

// ==============================================================
// 4. USER CLOUD SYNC & MULTI-DEVICE PROGRESS PERSISTENCE
// ==============================================================

app.post('/api/user/sync', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (!validateExpressOrigin(req)) {
      return res.status(403).json({ error: 'Forbidden: Cross-origin request rejected' });
    }

    const token = extractRequestToken(req);
    let authUserId: string | null = null;
    if (token) {
      const tokenHash = await hashSessionToken(token);
      const sessionResult = userSyncManager.validateSession(tokenHash);
      if (sessionResult) {
        authUserId = sessionResult.user.userId;
      }
    }

    const guestToken = extractExpressGuestToken(req);
    let guestAuthUserId: string | null = null;
    if (guestToken) {
      const guestTokenHash = await hashSessionToken(guestToken);
      const guestSession = userSyncManager.validateSession(guestTokenHash);
      if (guestSession) {
        guestAuthUserId = guestSession.user.userId;
      }
    }

    const { userId, ...rest } = req.body || {};
    const requestedUserId = userId ? String(userId).trim() : '';

    if (authUserId && requestedUserId && requestedUserId !== authUserId) {
      return res.status(403).json({ error: 'Forbidden: Cannot sync profile for another user' });
    }

    if (!authUserId && guestAuthUserId && requestedUserId && requestedUserId !== guestAuthUserId) {
      return res.status(403).json({ error: 'Forbidden: Guest session does not match requested userId' });
    }

    const targetUserId = authUserId || guestAuthUserId || requestedUserId || '';
    if (!targetUserId || !isValidUserIdFormat(targetUserId)) {
      return res.status(400).json({ error: 'Valid userId is required' });
    }

    if (SEEDED_COMPETITOR_IDS.has(targetUserId)) {
      return res.status(403).json({ error: 'Forbidden: Seeded competitor profiles cannot be modified' });
    }

    const existingUser = userSyncManager.getUser(targetUserId);
    if (
      (targetUserId.startsWith('usr_g_') || (existingUser && existingUser.googleId)) &&
      authUserId !== targetUserId
    ) {
      return res.status(401).json({ error: 'Unauthorized: Google-authenticated accounts require a valid session' });
    }

    const isGuestAccount = !targetUserId.startsWith('usr_g_') && !(existingUser && existingUser.googleId);
    if (isGuestAccount && existingUser && guestAuthUserId !== targetUserId && authUserId !== targetUserId) {
      return res.status(401).json({ error: 'Unauthorized: Active guest accounts require a valid guest session token' });
    }

    const profile = userSyncManager.syncUser({ userId: targetUserId, ...rest });

    let issuedGuestToken: string | undefined;
    if (isGuestAccount && guestAuthUserId !== targetUserId && authUserId !== targetUserId) {
      issuedGuestToken = generateSessionToken();
      const issuedHash = await hashSessionToken(issuedGuestToken);
      userSyncManager.createSession(targetUserId, issuedHash);
      res.setHeader('Set-Cookie', buildGuestCookieHeader(req, issuedGuestToken, 2592000));
    }

    return res.json({
      success: true,
      profile,
      ...(issuedGuestToken ? { guestToken: issuedGuestToken } : {}),
    });
  } catch (err) {
    console.error('User sync error:', err);
    return res.status(500).json({ error: 'Failed to sync user data' });
  }
});

app.get('/api/user/sync/:userId', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const targetUserId = String(req.params.userId || '').trim();
    const profile = userSyncManager.getUser(targetUserId);
    if (!profile) {
      return res.status(404).json({ error: 'کاربر در فضای ابری یافت نشد.' });
    }

    const token = extractRequestToken(req);
    let authUserId: string | null = null;
    if (token) {
      const tokenHash = await hashSessionToken(token);
      const sessionResult = userSyncManager.validateSession(tokenHash);
      if (sessionResult) {
        authUserId = sessionResult.user.userId;
      }
    }

    const guestToken = extractExpressGuestToken(req);
    let guestAuthUserId: string | null = null;
    if (guestToken) {
      const guestTokenHash = await hashSessionToken(guestToken);
      const guestSession = userSyncManager.validateSession(guestTokenHash);
      if (guestSession) {
        guestAuthUserId = guestSession.user.userId;
      }
    }

    if (profile.googleId || targetUserId.startsWith('usr_g_')) {
      if (authUserId !== profile.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    } else {
      if (authUserId !== profile.userId && guestAuthUserId !== profile.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    return res.json(profile);
  } catch (err) {
    return res.status(500).json({ error: 'خطا در بارگذاری اطلاعات کاربر' });
  }
});

// ==============================================================
// 5. REAL MULTI-PLAYER LEADERBOARD & XP SCORE SUBMISSION
// ==============================================================

app.get('/api/leaderboard', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    let currentUserId = req.query.userId ? String(req.query.userId) : undefined;
    const token = extractRequestToken(req);
    if (token) {
      const tokenHash = await hashSessionToken(token);
      const sessionResult = userSyncManager.validateSession(tokenHash);
      if (sessionResult) {
        currentUserId = sessionResult.user.userId;
      }
    }
    const data = userSyncManager.getLeaderboard(currentUserId);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve leaderboard' });
  }
});

app.post('/api/leaderboard/submit', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (!validateExpressOrigin(req)) {
      return res.status(403).json({ error: 'Forbidden: Cross-origin request rejected' });
    }

    const token = extractRequestToken(req);
    let authUserId: string | null = null;
    if (token) {
      const tokenHash = await hashSessionToken(token);
      const sessionResult = userSyncManager.validateSession(tokenHash);
      if (sessionResult) {
        authUserId = sessionResult.user.userId;
      }
    }

    const guestToken = extractExpressGuestToken(req);
    let guestAuthUserId: string | null = null;
    if (guestToken) {
      const guestTokenHash = await hashSessionToken(guestToken);
      const guestSession = userSyncManager.validateSession(guestTokenHash);
      if (guestSession) {
        guestAuthUserId = guestSession.user.userId;
      }
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const requestedUserId = typeof body.userId === 'string' ? body.userId.trim() : '';

    if (authUserId && requestedUserId && requestedUserId !== authUserId) {
      return res.status(403).json({ error: 'Forbidden: Cannot submit XP for another user' });
    }

    if (!authUserId && guestAuthUserId && requestedUserId && requestedUserId !== guestAuthUserId) {
      return res.status(403).json({ error: 'Forbidden: Guest session does not match requested userId' });
    }

    const targetUserId = authUserId || guestAuthUserId || requestedUserId || '';
    if (!targetUserId || !isValidUserIdFormat(targetUserId)) {
      return res.status(400).json({ error: 'Valid userId is required' });
    }

    if (SEEDED_COMPETITOR_IDS.has(targetUserId)) {
      return res.status(403).json({ error: 'Forbidden: Seeded competitor profiles cannot be modified' });
    }

    const existingUser = userSyncManager.getUser(targetUserId);
    if (
      (targetUserId.startsWith('usr_g_') || (existingUser && existingUser.googleId)) &&
      authUserId !== targetUserId
    ) {
      return res.status(401).json({ error: 'Unauthorized: Google-authenticated accounts require a valid session' });
    }

    const isGuestAccount = !targetUserId.startsWith('usr_g_') && !(existingUser && existingUser.googleId);
    // Require every XP submission to come from an already-synced account with a valid session
    if (!existingUser || (isGuestAccount && guestAuthUserId !== targetUserId && authUserId !== targetUserId)) {
      return res.status(401).json({ error: 'Unauthorized: Active session token is required to submit rewards' });
    }

    const verifiedCompletedStages = userSyncManager.getVerifiedCompletedStageNumbers(targetUserId);
    const verification = verifyRewardSubmission(body, { verifiedCompletedStages });
    if (!verification.ok) {
      return res.status(verification.status).json({ error: verification.error });
    }

    const updated = userSyncManager.awardXp({
      userId: targetUserId,
      xpEarned: verification.amount,
      reason: verification.reason,
      stageRecord: verification.stageRecord,
      streakDays: typeof body.streakDays === 'number' ? body.streakDays : undefined,
      name: typeof body.name === 'string' ? body.name : undefined,
      avatar: typeof body.avatar === 'string' ? body.avatar : undefined,
      idempotencyKey: verification.idempotencyKey,
    });

    return res.json({
      success: true,
      awardedXp: verification.amount,
      updatedXp: updated.xp,
      profile: updated,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to submit score' });
  }
});

// ==============================================================
// 6. ACADEMIC TRANSCRIPT & REPORT EXPORT ENDPOINT
// ==============================================================

app.post('/api/reports/student-summary', (req, res) => {
  try {
    const { userName, stats, progress, weakestChapters } = req.body;

    const summary = {
      studentName: userName || 'دانشجوی ممتاز روان‌لینگو',
      generatedAt: new Date().toLocaleDateString('fa-IR'),
      overallMastery: `${stats?.overallMastery || 0}٪`,
      accuracyRate: `${stats?.accuracyRate || 0}٪`,
      totalStudyMinutes: progress?.totalStudyMinutes || 0,
      streakDays: progress?.streakDays || 0,
      completedChaptersCount: (progress?.completedChapters || []).length,
      unlockedBadgesCount: (progress?.unlockedBadgeIds || []).length,
      levelStatus:
        (stats?.accuracyRate || 0) >= 80
          ? 'ممتاز و تسلط جامع'
          : (stats?.accuracyRate || 0) >= 60
          ? 'متوسط رو به رشد'
          : 'نیازمند مرور مبانی',
      weakestChapters: weakestChapters || [],
      recommendation:
        (stats?.accuracyRate || 0) >= 80
          ? 'تسلط شما در سرفصل‌های پایه عالی است. پیشنهاد می‌شود تست‌های سرعتی و ترکیبی را شروع نمایید.'
          : 'پیشنهاد می‌شود پیش از شرکت مجدد در آزمون‌ها، متون خلاصه و نکات کلیدی کتابچه را مرور فرمایید.',
      verificationStamp: 'تأییدیه رسمی سامانه هوشمند آموزش روان‌شناسی (PsychoMaster Academic Certification)',
    };

    return res.json(summary);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate student report' });
  }
});

// ==============================================================
// SERVER INITIALIZATION & STATIC/VITE SERVING
// ==============================================================

async function startServer() {
  const httpServer = http.createServer(app);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    // In AI Studio preview proxy, WebSockets are redirected (HTTP 302 to cookie-check),
    // which prevents HMR WebSocket connection. HMR is explicitly disabled by default.
    // Environments with proxy WebSocket support can opt-in via ENABLE_HMR=true or DISABLE_HMR=false.
    const isHmrExplicitlyEnabled =
      process.env.ENABLE_HMR === 'true' || process.env.DISABLE_HMR === 'false';

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrExplicitlyEnabled,
        ...(isHmrExplicitlyEnabled
          ? { ws: { server: httpServer } }
          : { ws: false }),
        forwardConsole: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(
      `PsychoMaster Server listening on port ${port} (mode: ${isProduction ? 'prod' : 'dev'})`
    );
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}
