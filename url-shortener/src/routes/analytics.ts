import { Hono } from "hono";
import {
  queryClicksOverTime,
  queryTopReferrers,
  queryDeviceBreakdown,
  queryTotalClicks,
} from "../lib/clickhouse";

export const analyticsRouter = new Hono();

/**
 * GET /api/analytics/:code
 * Returns full analytics for a short link:
 *   - total clicks
 *   - clicks over time (per minute, last 24h)
 *   - top referrers
 *   - device breakdown
 */
analyticsRouter.get("/api/analytics/:code", async (c) => {
  const code  = c.req.param("code");
  const hours = Number(c.req.query("hours") ?? 24);

  try {
    // Run all queries in parallel — ClickHouse handles concurrent reads well
    const [total, overTime, referrers, devices] = await Promise.all([
      queryTotalClicks(code),
      queryClicksOverTime(code, hours),
      queryTopReferrers(code, 10),
      queryDeviceBreakdown(code),
    ]);

    return c.json({
      shortCode: code,
      summary: {
        totalClicks: total,
        windowHours: hours,
      },
      clicksOverTime: overTime,
      topReferrers:   referrers,
      deviceBreakdown: devices,
    });
  } catch (err) {
    console.error("Analytics query error:", err);
    return c.json({ error: "Analytics query failed" }, 500);
  }
});

/**
 * GET /api/analytics/:code/realtime
 * Last 60 minutes in 1-minute buckets — for the live dashboard in Phase 5
 */
analyticsRouter.get("/api/analytics/:code/realtime", async (c) => {
  const code = c.req.param("code");

  try {
    const [overTime, total] = await Promise.all([
      queryClicksOverTime(code, 1),   // last 60 minutes
      queryTotalClicks(code),
    ]);

    return c.json({
      shortCode:   code,
      totalClicks: total,
      lastHour:    overTime,
      updatedAt:   new Date().toISOString(),
    });
  } catch (err) {
    return c.json({ error: "Realtime query failed" }, 500);
  }
});