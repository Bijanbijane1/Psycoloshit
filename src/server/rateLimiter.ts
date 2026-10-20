import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

/**
 * Hardened rate limiter middleware for Express (dev/Node runtime).
 * Never allows client-supplied `x-visitor-id` headers to split an IP-based rate-limit bucket.
 */
export function createRateLimiter(
  windowMs: number = 60000,
  maxRequests: number = 60,
  message: string = 'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً چند لحظه صبر کنید.'
) {
  const requestLogs = new Map<string, RateLimitRecord>();

  return (req: Request, res: Response, next: NextFunction) => {
    const cfIp = String(req.headers['cf-connecting-ip'] || '').trim();
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
    const rawIp = cfIp || xff || (req.ip ? String(req.ip).trim() : '');
    const key = rawIp || String(req.headers['x-visitor-id'] || 'anonymous').trim().slice(0, 64);
    const now = Date.now();

    if (requestLogs.size > 500) {
      for (const [k, rec] of requestLogs.entries()) {
        if (now > rec.resetTime) {
          requestLogs.delete(k);
        }
      }
    }

    const record = requestLogs.get(key);

    if (!record || now > record.resetTime) {
      requestLogs.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (record.count >= maxRequests) {
      const waitSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      res.setHeader('Retry-After', String(waitSeconds));
      return res.status(429).json({
        ok: false,
        error: message,
        retryAfterSeconds: waitSeconds,
      });
    }

    record.count++;
    next();
  };
}
