import { Hono }          from "hono";
import { db }            from "../db";
import { getCached, setCached } from "../cache";
import { recordClick }   from "../middleware/clickTracker";
import { getOwnerNode, forwardToOwner } from "../lib/nodeRouter";
import { CURRENT_REGION_ID } from "../lib/regionRouter";
import type { GeoContext } from "../middleware/geoMiddleware";

export const redirectRouter = new Hono<{ Variables: GeoContext }>();

redirectRouter.get("/:code", async (c) => {
  const code = c.req.param("code");

  // ── Consistent hash routing ─────────────────────────────────────────────────
  const hashRouting = getOwnerNode(code);
  c.header("X-Hash-Node", hashRouting.nodeId);

  const forwarded = await forwardToOwner(code, c.req.raw);
  if (forwarded) return forwarded;

  // ── Geo-routing ─────────────────────────────────────────────────────────────
  // Geo context was attached by geoMiddleware in index.ts
  const geo     = c.get("geo")     as GeoContext["geo"]     | undefined;
  const routing = c.get("routing") as GeoContext["routing"] | undefined;

  // If the nearest region is NOT this server, redirect to the correct region.
  // Use 302 (temporary) not 301 — geo decisions can change as infra scales.
  if (routing && !routing.isCurrent) {
    const regionalUrl = `${routing.region.endpoint}/${code}`;

    console.log(
      `[Geo] ${geo?.countryCode ?? "??"} → ${routing.region.id} ` +
      `(${routing.distanceKm}km) — redirecting to ${regionalUrl}`
    );

    c.header("X-Geo-Redirect",      "true");
    c.header("X-Geo-Target-Region", routing.region.id);
    c.header("X-Geo-Distance-Km",   String(routing.distanceKm));

    // In dev: all regions point to localhost:3000 so this won't loop.
    // In production K8s: each region has its own Ingress IP.
    return c.redirect(regionalUrl, 302);
  }

  // ── Serve locally — this is the right region ────────────────────────────────
  c.header("X-Cache-Status", "");

  // 1. Redis cache hit — fastest path (~1ms)
  const cached = await getCached(code);
  if (cached) {
    c.header("X-Cache-Status", "HIT");
    recordClick(c.req.raw, code, "cache", cached, geo).catch(() => {});
    return c.redirect(cached, 301);
  }

  // 2. Cache miss — PostgreSQL lookup (~5-15ms)
  try {
    const result = await db.query<{
      id:           string;
      original_url: string;
      expires_at:   string | null;
    }>(
      `SELECT id, original_url, expires_at
       FROM urls
       WHERE short_code = $1 AND is_active = TRUE`,
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
    recordClick(c.req.raw, code, "db", row.original_url, geo).catch(() => {});

    return c.redirect(row.original_url, 301);
  } catch (err) {
    console.error("Redirect error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});