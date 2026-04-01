import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { encode } from "../encoder";
import { setCached } from "../cache";
import { shortenRateLimitMiddleware } from "../middleware/rateLimitMiddleware";

export const shortenRouter = new Hono();

const ShortenSchema = z.object({
  url:        z.string().url("Must be a valid URL"),
  customCode: z.string().min(3).max(12).regex(/^[a-zA-Z0-9]+$/).optional(),
  expiresAt:  z.string().datetime().optional(),
});

// Apply stricter rate limit specifically on this route
shortenRouter.post("/shorten", shortenRateLimitMiddleware, async (c) => {
  let body: unknown;

  try {
    const raw = await c.req.text();
    console.log("RAW:", raw); // debug
  
    body = JSON.parse(raw);
  } catch (err) {
    console.error("PARSE ERROR:", err);
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = ShortenSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { url, customCode, expiresAt } = parsed.data;

  try {
    if (customCode) {
      const existing = await db.query(
        "SELECT id FROM urls WHERE short_code = $1", [customCode]
      );
      if (existing.rows.length > 0) {
        return c.json({ error: "Custom code already taken" }, 409);
      }
    }

    const result = await db.query<{ id: string }>(
      `INSERT INTO urls (short_code, original_url, expires_at)
       VALUES ($1, $2, $3) RETURNING id`,
      // Keep temp code <= varchar(12) when customCode is absent.
      [customCode ?? "__tmp__", url, expiresAt ?? null]
    );

    const id        = BigInt(result.rows[0].id);
    const shortCode = customCode ?? encode(id);

    if (!customCode) {
      await db.query("UPDATE urls SET short_code = $1 WHERE id = $2", [
        shortCode, id.toString(),
      ]);
    }

    await setCached(shortCode, url);

    const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
    return c.json({
      shortCode,
      shortUrl:    `${baseUrl}/${shortCode}`,
      originalUrl: url,
      expiresAt:   expiresAt ?? null,
    }, 201);
  } catch (err) {
    console.error("Shorten error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});