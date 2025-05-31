import type { NextApiRequest, NextApiResponse } from 'next';
import { getRedisClient } from '@/lib/redis'; // Changed to aliased path
import Redis from 'ioredis';

interface RateLimiterOptions {
  windowSeconds: number;
  maxRequests: number;
  keyPrefix: string;
}

export function rateLimiter(options: RateLimiterOptions) {
  const { windowSeconds, maxRequests, keyPrefix } = options;
  let redisClient: Redis | null = null;

  try {
    redisClient = getRedisClient();
  } catch (error) {
    console.error("Failed to get Redis client for rate limiter:", error);
    // If Redis is not available, the rate limiter will effectively be disabled.
    // Or, you could choose to block all requests by throwing an error here.
    // For this exercise, we'll log the error and let requests pass if Redis fails.
  }

  return async (req: NextApiRequest, res: NextApiResponse, next: (result?: any) => void) => {
    if (!redisClient || redisClient.status !== 'ready') {
      // Attempt to reconnect or re-initialize if client is not ready
      try {
        console.warn(`Rate limiter: Redis client not ready (status: ${redisClient?.status}). Attempting to get/reinitialize.`);
        redisClient = getRedisClient(); // This might throw if env var is missing
        if (!redisClient || redisClient.status !== 'ready') {
            // Try to connect explicitly if lazyConnect was used
            if (redisClient && redisClient.status !== 'connected' && redisClient.status !== 'ready') {
                 await redisClient.connect().catch(e => console.error("Rate limiter: explicit redis connect failed", e));
            }
            if (!redisClient || redisClient.status !== 'ready') {
                console.error("Rate limiter: Redis client is not available or not ready. Passing request without rate limiting.");
                return next();
            }
        }
      } catch (error) {
        console.error("Rate limiter: Failed to get/reinitialize Redis client. Passing request without rate limiting.", error);
        return next(); // Pass through if Redis connection fails
      }
    }

    // Use IP address as the primary identifier for rate limiting.
    // Prefer 'x-forwarded-for' if behind a proxy, fallback to req.socket.remoteAddress.
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket?.remoteAddress;

    if (!ip) {
      console.warn("Rate limiter: Could not determine IP address. Passing request without rate limiting.");
      return next(); // Cannot rate limit without an IP
    }

    const key = `${keyPrefix}:${ip}`;

    try {
      const currentCount = await redisClient.incr(key);

      if (currentCount === 1) {
        // If it's the first request in the window, set the expiry
        await redisClient.expire(key, windowSeconds);
      }

      if (currentCount > maxRequests) {
        // Calculate approximate time remaining for user to wait
        const ttl = await redisClient.ttl(key);
        res.setHeader('Retry-After', ttl > 0 ? ttl : windowSeconds); // Provide Retry-After header
        return res.status(429).json({
          message: `Too Many Requests. You have exceeded the limit of ${maxRequests} requests in ${windowSeconds} seconds. Please try again later.`,
          retryAfter: ttl > 0 ? ttl : windowSeconds,
        });
      }

      return next();
    } catch (error) {
      console.error(`Rate limiter: Error interacting with Redis for key "${key}":`, error);
      // If Redis commands fail, allow the request to pass to avoid blocking users due to Redis issues.
      // This is a trade-off: availability vs. strict rate limiting.
      return next();
    }
  };
}

// Helper to run Express-style middleware in Next.js API routes
export function runMiddleware(
  req: NextApiRequest,
  res: NextApiResponse,
  fn: (req: NextApiRequest, res: NextApiResponse, next: (result?: any) => void) => Promise<void> | void
) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}
