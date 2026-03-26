import type { Context, Next } from "hono";
import { limitByIP, limitByUser, limitShorten } from "../lib/rateLimiter";

/** Extract real client IP, respecting proxy headers */
function getClientIP(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0].trim() ??
    c.req.header("x-real-ip") ??
    "unknown"
  );
}

/** Attach rate limit headers to every response */
function setRateLimitHeaders(
  c: Context,
  limit: number,
  remaining: number,
  resetAt: number
): void {
  c.header("X-RateLimit-Limit",     String(limit));
  c.header("X-RateLimit-Remaining", String(remaining));
  c.header("X-RateLimit-Reset",     String(Math.ceil(resetAt / 1000))); // Unix seconds
}

/**
 * General rate limiter middleware — applies to all routes.
 * 100 req/min per IP, or 1000/min if a valid API key is provided.
 */
export async function rateLimitMiddleware(c: Context, next: Next) {
  const ip     = getClientIP(c);
  const apiKey = c.req.header("x-api-key");

  let result;

  if (apiKey) {
    // Authenticated users get a much higher limit
    result = await limitByUser(apiKey);
  } else {
    result = await limitByIP(ip);
  }

  setRateLimitHeaders(c, result.limit, result.remaining, result.resetAt);

  if (!result.allowed) {
    const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
    c.header("Retry-After", String(retryAfterSeconds));

    return c.json(
      {
        error:      "Too many requests",
        retryAfter: retryAfterSeconds,
        resetAt:    new Date(result.resetAt).toISOString(),
      },
      429
    );
  }

  await next();
}

/**
 * Stricter middleware specifically for POST /shorten.
 * 20 creates/min per IP — prevents bulk spam link creation.
 */
export async function shortenRateLimitMiddleware(c: Context, next: Next) {
  const ip = getClientIP(c);
  const result = await limitShorten(ip);

  setRateLimitHeaders(c, result.limit, result.remaining, result.resetAt);

  if (!result.allowed) {
    const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
    c.header("Retry-After", String(retryAfterSeconds));

    return c.json(
      {
        error:      "Too many shortening requests. Slow down.",
        retryAfter: retryAfterSeconds,
        resetAt:    new Date(result.resetAt).toISOString(),
      },
      429
    );
  }

  await next();
}