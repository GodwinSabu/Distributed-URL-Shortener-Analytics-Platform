import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { encode, randomCode } from "../encoder";
import { setCached } from "../cache";

export const shortenRouter = new Hono();

const ShortenSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  customCode: z.string().min(3).max(12).regex(/^[a-zA-Z0-9]+$/).optional(),
  expiresAt: z.string().datetime().optional(),
});

shortenRouter.post("/shorten", async (c) => {
  // Parse + validate body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = ShortenSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { url, customCode, expiresAt } = parsed.data;

  try {
    // If custom code provided, check it's not taken
    if (customCode) {
      const existing = await db.query(
        "SELECT id FROM urls WHERE short_code = $1",
        [customCode]
      );
      if (existing.rows.length > 0) {
        return c.json({ error: "Custom code already taken" }, 409);
      }
    }

    // Insert URL — get auto-generated ID back
    const result = await db.query<{ id: string }>(
      `INSERT INTO urls (short_code, original_url, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [customCode ?? "__PLACEHOLDER__", url, expiresAt ?? null]
    );

    const id = BigInt(result.rows[0].id);
    const shortCode = customCode ?? encode(id);

    // If we used auto-increment encoding, update the row with the real code
    if (!customCode) {
      await db.query("UPDATE urls SET short_code = $1 WHERE id = $2", [
        shortCode,
        id.toString(),
      ]);
    }

    // Warm the cache immediately
    await setCached(shortCode, url);

    const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
    return c.json(
      {
        shortCode,
        shortUrl: `${baseUrl}/${shortCode}`,
        originalUrl: url,
        expiresAt: expiresAt ?? null,
      },
      201
    );
  } catch (err) {
    console.error("Shorten error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});