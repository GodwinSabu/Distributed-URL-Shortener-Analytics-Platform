import { Hono } from "hono";
import { db } from "../db";
import { getCached, setCached } from "../cache";
import { recordClick } from "../middleware/clickTracker";
import { getOwnerNode, forwardToOwner } from "../lib/nodeRouter";

export const redirectRouter = new Hono();

redirectRouter.get("/:code", async (c) => {
  const code = c.req.param("code");

  // Determine which node owns this short code
  const routing = getOwnerNode(code);

  // Set header so clients/load balancers can see routing decisions
  c.header("X-Served-By",    routing.nodeId);
  c.header("X-Cache-Status", "");

  // If another node owns this key, forward to it
  const forwarded = await forwardToOwner(code, c.req.raw);
  if (forwarded) return forwarded;

  // 1. Cache hit — fastest path
  const cached = await getCached(code);
  if (cached) {
    c.header("X-Cache-Status", "HIT");
    recordClick(c.req.raw, code, "cache").catch(() => {});
    return c.redirect(cached, 301);
  }

  // 2. Cache miss — DB lookup
  try {
    const result = await db.query<{
      id: string; original_url: string; expires_at: string | null;
    }>(
      `SELECT id, original_url, expires_at
       FROM urls WHERE short_code = $1 AND is_active = TRUE`,
      [code]
    );

    if (result.rows.length === 0) {
      return c.json({ error: "Short link not found" }, 404);
    }

    const row = result.rows[0];

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return c.json({ error: "Short link has expired" }, 410);
    }

    c.header("X-Cache-Status", "MISS");
    await setCached(code, row.original_url);
    recordClick(c.req.raw, code, "db").catch(() => {});

    return c.redirect(row.original_url, 301);
  } catch (err) {
    console.error("Redirect error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});