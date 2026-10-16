import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { analyticsManager } from './src/server/analyticsStore';
import { createRateLimiter } from './src/server/rateLimiter';
import { aiCache } from './src/server/aiCache';
import { userSyncManager } from './src/server/userStore';
import { questionBankRepo } from './src/server/questionBank';

dotenv.config();

if (process.env.DISABLE_HMR === undefined) {
  process.env.DISABLE_HMR = 'true';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);
const isProduction = process.env.NODE_ENV === 'production';

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
// 4. USER CLOUD SYNC & MULTI-DEVICE PROGRESS PERSISTENCE
// ==============================================================

app.post('/api/user/sync', (req, res) => {
  try {
    const { userId, ...rest } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const profile = userSyncManager.syncUser({ userId, ...rest });
    return res.json({ success: true, profile });
  } catch (err) {
    console.error('User sync error:', err);
    return res.status(500).json({ error: 'Failed to sync user data' });
  }
});

app.get('/api/user/sync/:userId', (req, res) => {
  try {
    const profile = userSyncManager.getUser(req.params.userId);
    if (!profile) {
      return res.status(404).json({ error: 'کاربر در فضای ابری یافت نشد.' });
    }
    return res.json(profile);
  } catch (err) {
    return res.status(500).json({ error: 'خطا در بارگذاری اطلاعات کاربر' });
  }
});

// ==============================================================
// 5. REAL MULTI-PLAYER LEADERBOARD & XP SCORE SUBMISSION
// ==============================================================

app.get('/api/leaderboard', (req, res) => {
  try {
    const currentUserId = req.query.userId ? String(req.query.userId) : undefined;
    const data = userSyncManager.getLeaderboard(currentUserId);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve leaderboard' });
  }
});

app.post('/api/leaderboard/submit', (req, res) => {
  try {
    const { userId, xpEarned, streakDays, name, avatar } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const existing = userSyncManager.getUser(userId);
    const newXp = (existing?.xp || 0) + (Number(xpEarned) || 0);

    const updated = userSyncManager.syncUser({
      userId,
      xp: newXp,
      streakDays: streakDays || existing?.streakDays || 1,
      name: name || existing?.name,
      avatar: avatar || existing?.avatar,
    });

    return res.json({ success: true, updatedXp: newXp, profile: updated });
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

startServer();
