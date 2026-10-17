import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const requestLogs = new Map<string, RateLimitRecord>();

/**
 * Lightweight in-memory rate limiter middleware
 * @param windowMs Time window in milliseconds
 * @param maxRequests Maximum allowed requests in the time window
 * @param message Custom message returned when limit is exceeded
 */
export function createRateLimiter(
  windowMs: number = 60000,
  maxRequests: number = 60,
  message: string = 'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً چند لحظه صبر کنید.'
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = (req.ip || 'anonymous') + '_' + (req.headers['x-visitor-id'] || '');
    const now = Date.now();

    const record = requestLogs.get(key);

    if (!record || now > record.resetTime) {
      requestLogs.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (record.count >= maxRequests) {
      const waitSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', waitSeconds);
      return res.status(429).json({
        error: message,
        retryAfterSeconds: waitSeconds,
      });
    }

    record.count++;
    next();
  };
}

// Periodic cleanup of expired records every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of requestLogs.entries()) {
    if (now > record.resetTime) {
      requestLogs.delete(key);
    }
  }
}, 300000);
