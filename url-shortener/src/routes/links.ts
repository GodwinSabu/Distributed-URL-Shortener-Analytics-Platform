import { Hono } from "hono";
import { db } from "../db";
import { invalidateCache } from "../cache";

export const linksRouter = new Hono();

// GET /api/links — list all links (paginated)
linksRouter.get("/api/links", async (c) => {
  const page  = Math.max(1, Number(c.req.query("page")  ?? 1));
  const limit = Math.min(100, Number(c.req.query("limit") ?? 20));
  const offset = (page - 1) * limit;

  try {
    const result = await db.query(
      `SELECT u.id, u.short_code, u.original_url, u.is_active,
              u.created_at, u.expires_at,
              COUNT(c.id)::int AS click_count
       FROM urls u
       LEFT JOIN clicks c ON c.url_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await db.query("SELECT COUNT(*) FROM urls");
    const total = Number(countResult.rows[0].count);

    return c.json({
      links: result.rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("List links error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// GET /api/links/:code — single link with click stats
linksRouter.get("/api/links/:code", async (c) => {
  const code = c.req.param("code");
  try {
    const result = await db.query(
      `SELECT u.*, COUNT(c.id)::int AS click_count
       FROM urls u
       LEFT JOIN clicks c ON c.url_id = u.id
       WHERE u.short_code = $1
       GROUP BY u.id`,
      [code]
    );
    if (result.rows.length === 0) return c.json({ error: "Not found" }, 404);
    return c.json(result.rows[0]);
  } catch (err) {
    return c.json({ error: "Internal server error" }, 500);
  }
});

// DELETE /api/links/:code — soft-delete a link
linksRouter.delete("/api/links/:code", async (c) => {
  const code = c.req.param("code");
  try {
    const result = await db.query(
      "UPDATE urls SET is_active = FALSE WHERE short_code = $1 RETURNING id",
      [code]
    );
    if (result.rowCount === 0) return c.json({ error: "Not found" }, 404);

    await invalidateCache(code);
    return c.json({ success: true, message: `/${code} deactivated` });
  } catch (err) {
    return c.json({ error: "Internal server error" }, 500);
  }
});