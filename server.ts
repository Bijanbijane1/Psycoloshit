import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { analyticsManager } from './src/server/analyticsStore';

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

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    aiAvailable: !!ai,
    timestamp: new Date().toISOString(),
  });
});

// ==============================================================
// SITE VISITOR & REAL-TIME TRAFFIC ANALYTICS ENDPOINTS
// ==============================================================

// Real-time ping/heartbeat endpoint (keeps active sessions alive)
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

// AI Psychology Mentor endpoint
app.post('/api/ai/mentor', async (req, res) => {
  try {
    const { question, chapterTitle, sectionTitle, userLevel } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'سوال کاربر الزامی است.' });
    }

    if (!ai) {
      return res.json({
        reply: `پاسخ آفلاین پایگاه دانش: درباره "${question}"، مبحث مربوطه در سرفصل "${chapterTitle || 'روان‌شناسی'}" به دقت در متون آکادمیک و ساده کتابخانه تدوین شده است. پیشنهاد می‌شود بخش نکات کلیدی و مقایسه مفاهیم را در کتابخانه مرور فرمایید. برای فعال‌سازی گفتگوی پویا با منتور هوش مصنوعی، تنظیم کلید در تنظیمات برنامه را بررسی کنید.`,
        source: 'offline-fallback',
      });
    }

    const systemInstruction = `شما یک استاد تمام و منتور ارشد روان‌شناسی آکادمیک (PsychoMaster Mentor) هستید. 
به پرسش‌های دانشجویان و داوطلبان درباره مفاهیم روان‌شناسی، مکاتب، سبب‌شناسی اختلالات، نظریه‌های رشد، روش تحقیق و نوروپسیکولوژی پاسخ می‌دهید.
قواعد پاسخگویی:
۱. پاسخ دقیق، مستند به منابع معتبر (مانند اتکینسون و هیلگارد، کاپلان و سادوک، دی‌اس‌ام ۵-TR، شولتز و نظریه‌های شخصیت).
۲. در صورت لزوم، تفاوت ظریف اصطلاحات گیج‌کننده (مانند OCPD در برابر OCD یا دپلاریزاسیون در برابر هایپرپلاریزاسیون) را با مثال‌های شهودی و ملموس تفکیک کن.
۳. ادبیات علمی، صمیمی، انگیزاننده و به زبان فارسی روان.
۴. در پایان، یک نکته کنکوری یا سوال تفکرانگیز کوتاه برای سنجش درک کاربر ارائه بده.`;

    const prompt = `دانشجو در حال مطالعه سرفصل زیر است:
- بخش: ${sectionTitle || 'عمومی'}
- مبحث/فصل: ${chapterTitle || 'کلیات روان‌شناسی'}
- سطح علمی کاربر: ${userLevel || 'متوسط'}

پرسش یا اشکال دانشجو:
"${question}"

لطفاً به جامع‌ترین و شیواترین شکل ممکن پاسخ دهید و اشکال او را برطرف کنید.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction,
      },
    });

    return res.json({
      reply: response.text || 'پاسخی دریافت نشد.',
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

// AI Question Generator endpoint
app.post('/api/ai/generate-question', async (req, res) => {
  try {
    const { chapterTitle, difficulty } = req.body;

    if (!ai) {
      return res.json({
        question: null,
        message: 'تولید زنده سوال نیازمند اتصال هوش مصنوعی است.',
      });
    }

    const prompt = `برای سرفصل "${chapterTitle || 'روان‌شناسی عمومی'}" در سطح دشواری "${difficulty || 'متوسط'}"، یک سوال چهارگزینه‌ای مفهومی و کنکوری با ساختار JSON زیر تولید کن:
{
  "question": "متن سوال با جزئیات دقیق",
  "options": ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
  "correctIndex": 0,
  "explanation": "تحلیل تشریحی علت درستی گزینه و چرایی رد سایر گزینه‌ها"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ question: parsed });
  } catch (err) {
    console.error('Question generation error:', err);
    return res.status(500).json({ error: 'خطا در تولید سوال تعاملی.' });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
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

  app.listen(port, '0.0.0.0', () => {
    console.log(`PsychoMaster Server listening on port ${port} (mode: ${isProduction ? 'prod' : 'dev'})`);
  });
}

startServer();
