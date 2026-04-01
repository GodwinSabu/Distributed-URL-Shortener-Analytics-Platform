import Redis from "ioredis";

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL environment variable is required");
}

export const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableOfflineQueue: false, // fail fast if redis is down
});

redis.on("error", (err) => {
  // Log but don't crash — app degrades gracefully without cache
  console.error("Redis error:", err.message);
});

export async function connectCache(): Promise<void> {
  await redis.connect();
  console.log("✅ Redis connected");
}

export async function disconnectCache(): Promise<void> {
  await redis.quit();
  console.log("🔌 Redis disconnected");
}

const TTL = Number(process.env.CACHE_TTL_SECONDS ?? 3600);
const PREFIX = "url:";

/** Get cached original URL for a short code. Returns null on miss. */
export async function getCached(shortCode: string): Promise<string | null> {
  try {
    return await redis.get(PREFIX + shortCode);
  } catch {
    return null; // cache miss — fall through to DB
  }
}

/** Store original URL in cache with TTL. */
export async function setCached(shortCode: string, originalUrl: string): Promise<void> {
  try {
    await redis.setex(PREFIX + shortCode, TTL, originalUrl);
  } catch {
    // Non-fatal — just means next request will hit DB again
  }
}

/** Remove a URL from cache (called on delete). */
export async function invalidateCache(shortCode: string): Promise<void> {
  try {
    await redis.del(PREFIX + shortCode);
  } catch {
    // Ignore
  }
}

/** Check if Redis is alive — used by health endpoint. */
export async function pingCache(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}