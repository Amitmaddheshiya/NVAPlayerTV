import { Request, Response, NextFunction } from 'express';
import env from '../config/env';

// Simple in-memory rate limiter (for production, use Redis)
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export const rateLimit = (windowMs: number = env.RATE_LIMIT_WINDOW_MS, maxRequests: number = env.RATE_LIMIT_MAX_REQUESTS) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Disable rate limiting in development mode
    if (env.NODE_ENV === 'development') {
      return next();
    }

    // These routes authenticate a device token in their route middleware.
    // A shared office/venue NAT can carry thousands of TVs, so an IP-wide
    // quota would incorrectly block healthy heartbeats and media-list reads.
    // Activation is public for first-time pairing, so rate-limit it by device
    // ID instead of putting every device behind one shared IP counter.
    const pathname = req.path;
    if (/^\/devices\/[^/]+\/heartbeat$/.test(pathname) || pathname === '/media/media-list') {
      return next();
    }
    const activationMatch = pathname.match(/^\/devices\/([^/]+)\/activation$/);
    const identity = activationMatch ? `device:${decodeURIComponent(activationMatch[1])}` : (req.ip || 'unknown');
    const key = `${identity}:${pathname}`;
    const now = Date.now();

    // Get or create rate limit entry for this IP
    let entry = requestCounts.get(key);

    // Reset if window expired
    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + windowMs };
      requestCounts.set(key, entry);
    }

    // Increment count
    entry.count++;

    // Check if limit exceeded
    if (entry.count > maxRequests) {
      const resetTime = new Date(entry.resetTime).toISOString();
      res.setHeader('Retry-After', Math.ceil((entry.resetTime - now) / 1000).toString());
      res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again after ${resetTime}`,
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
      return;
    }

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', (maxRequests - entry.count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());

    next();
  };
};

// Clean up expired entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requestCounts.entries()) {
    if (now > entry.resetTime) {
      requestCounts.delete(key);
    }
  }
}, 5 * 60 * 1000);
