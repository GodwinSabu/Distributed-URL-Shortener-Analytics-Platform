import { Hono } from "hono";
import { db } from "../db";
import { getCached, setCached } from "../cache";
import { recordClick } from "../middleware/clickTracker";

export const redirectRouter = new Hono();

redirectRouter.get("/:code", async (c) => {
  const code = c.req.param("code");

  // 1. Try cache first — this is the hot path
  const cached = await getCached(code);
  if (cached) {
    // Fire click tracking async — don't await it
    recordClick(c.req.raw, code, "cache").catch(() => {});
    return c.redirect(cached, 301);
  }

  // 2. Cache miss — hit the database
  try {
    const result = await db.query<{ id: string; original_url: string; expires_at: string | null }>(
      `SELECT id, original_url, expires_at
       FROM urls
       WHERE short_code = $1 AND is_active = TRUE`,
      [code]
    );

    if (result.rows.length === 0) {
      return c.json({ error: "Short link not found" }, 404);
    }

    const row = result.rows[0];

    // Check expiry
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return c.json({ error: "Short link has expired" }, 410);
    }

    // Warm cache for next time
    await setCached(code, row.original_url);

    // Fire click tracking async
    recordClick(c.req.raw, code, "db").catch(() => {});

    return c.redirect(row.original_url, 301);
  } catch (err) {
    console.error("Redirect error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});