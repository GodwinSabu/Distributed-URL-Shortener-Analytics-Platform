import { redis } from "../cache";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;   // requests left in window
  limit: number;       // total allowed
  resetAt: number;     // unix ms when oldest request exits the window
}

interface WindowConfig {
  limit: number;          // max requests
  windowSeconds: number;  // rolling window size
}

// ── Presets ───────────────────────────────────────────────────────────────────
export const RATE_PRESETS = {
  ip:      { limit: 100,  windowSeconds: 60  },  // 100/min per IP
  user:    { limit: 1000, windowSeconds: 60  },  // 1000/min per user
  shorten: { limit: 20,   windowSeconds: 60  },  // 20 creates/min (stricter)
} as const;

/**
 * Sliding window rate limiter using Redis sorted sets.
 *
 * Algorithm:
 *  1. Remove timestamps older than (now - windowMs)  → ZREMRANGEBYSCORE
 *  2. Count remaining entries                         → ZCARD
 *  3. If count < limit: add current timestamp, allow  → ZADD
 *  4. If count >= limit: deny
 *  5. Set TTL so the key auto-expires                 → EXPIRE
 *
 * All 4 operations run in a single pipeline → 1 round trip to Redis.
 */
export async function checkRateLimit(
  key: string,
  config: WindowConfig
): Promise<RateLimitResult> {
  const now       = Date.now();
  const windowMs  = config.windowSeconds * 1000;
  const clearBefore = now - windowMs;
  const redisKey  = `rl:${key}`;

  try {
    const pipeline = redis.pipeline();

    // 1. Remove old entries outside the window
    pipeline.zremrangebyscore(redisKey, "-inf", clearBefore);

    // 2. Count current entries in window
    pipeline.zcard(redisKey);

    // 3. Add current request (score = timestamp, member = unique timestamp+random)
    pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);

    // 4. Set key TTL = window size (auto-cleanup)
    pipeline.expire(redisKey, config.windowSeconds + 1);

    // 5. Get the oldest entry timestamp (to compute resetAt)
    pipeline.zrange(redisKey, 0, 0, "WITHSCORES");

    const results = await pipeline.exec();

    // results[1] is ZCARD result — count BEFORE adding current request
    const currentCount = (results?.[1]?.[1] as number) ?? 0;
    const allowed = currentCount < config.limit;

    // If denied, undo the ZADD we speculatively did
    if (!allowed) {
      await redis.zpopmax(redisKey); // remove the entry we just added
    }

    // Compute when the oldest request exits the window
    const oldestScore = results?.[4]?.[1] as string[] | undefined;
    const oldestTimestamp = oldestScore ? Number(oldestScore[1]) : now;
    const resetAt = oldestTimestamp + windowMs;

    return {
      allowed,
      remaining: Math.max(0, config.limit - currentCount - (allowed ? 1 : 0)),
      limit: config.limit,
      resetAt,
    };
  } catch (err) {
    // If Redis is down, fail open — don't block users for an infra issue
    console.error("Rate limiter error (failing open):", err);
    return {
      allowed: true,
      remaining: config.limit,
      limit: config.limit,
      resetAt: Date.now() + windowMs,
    };
  }
}

/** Convenience: rate limit by IP address */
export async function limitByIP(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(`ip:${ip}`, RATE_PRESETS.ip);
}

/** Convenience: rate limit by user API key */
export async function limitByUser(apiKey: string): Promise<RateLimitResult> {
  return checkRateLimit(`user:${apiKey}`, RATE_PRESETS.user);
}

/** Stricter limit for the /shorten endpoint specifically */
export async function limitShorten(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(`shorten:${ip}`, RATE_PRESETS.shorten);
}