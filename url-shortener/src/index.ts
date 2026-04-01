import "dotenv/config";
import { Hono }                from "hono";
import { logger }              from "hono/logger";
import { cors }                from "hono/cors";
import { connectDB, disconnectDB, db } from "./db";
import { connectCache, disconnectCache, pingCache } from "./cache";
import { connectProducer, disconnectProducer } from "./lib/kafka";
import { initClickHouse, pingClickHouse } from "./lib/clickhouse";
import { shortenRouter }       from "./routes/shorten";
import { redirectRouter }      from "./routes/redirect";
import { linksRouter }         from "./routes/links";
import { analyticsRouter }     from "./routes/analytics";
import { rateLimitMiddleware }  from "./middleware/rateLimitMiddleware";
import { geoMiddleware }        from "./middleware/geoMiddleware";   // ← new
import { getRingStatus }        from "./lib/nodeRouter";
import { getGeoCacheStats }     from "./lib/geoip";                 // ← new
import { REGIONS, CURRENT_REGION } from "./lib/regionRouter";       // ← new

const app = new Hono();

// ── Global middleware ──────────────────────────────────────────────────────────
app.use("*", logger());
app.use("*", cors({ origin: "*" }));
app.use("*", rateLimitMiddleware);

// Geo middleware ONLY on redirect routes — skip for API/health routes
// (no point geolocating health check pings)
app.use("/:code", geoMiddleware);    // ← new

// ── Health check ───────────────────────────────────────────────────────────────
app.get("/health", async (c) => {
  const [dbOk, cacheOk, chOk] = await Promise.all([
    db.query("SELECT 1").then(() => true).catch(() => false),
    pingCache(),
    pingClickHouse(),
  ]);

  const allOk = dbOk && cacheOk && chOk;
  return c.json({
    status:    allOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    region:    CURRENT_REGION.id,              // ← new: which region is this?
    services: {
      database:   dbOk    ? "ok" : "down",
      cache:      cacheOk ? "ok" : "down",
      clickhouse: chOk    ? "ok" : "down",
    },
  }, allOk ? 200 : 503);
});

// ── Debug endpoints ────────────────────────────────────────────────────────────
app.get("/debug/ring", (c) => c.json(getRingStatus()));

app.get("/debug/geo",  (c) => c.json({
  currentRegion: CURRENT_REGION,
  allRegions:    REGIONS,
  geoCache:      getGeoCacheStats(),
}));

// ── Geo test endpoint — spoof any IP to test routing ──────────────────────────
app.get("/api/geo/test", async (c) => {
  const ip = c.req.query("ip") ?? c.req.header("x-forwarded-for") ?? "127.0.0.1";

  const { geolocate }          = await import("./lib/geoip");
  const { selectRegionForGeo } = await import("./lib/regionRouter");

  const geo     = await geolocate(ip);
  const routing = selectRegionForGeo(geo);

  return c.json({
    ip,
    geo,
    routing: {
      selectedRegion: routing.region,
      distanceKm:     routing.distanceKm,
      isCurrent:      routing.isCurrent,
      wouldRedirectTo: routing.isCurrent
        ? null
        : routing.region.endpoint,
      allRegions: routing.allRegions,
    },
  });
});
console.log("Shorten router:", shortenRouter);

// ── Routes ─────────────────────────────────────────────────────────────────────
app.route("/", shortenRouter);
app.route("/", linksRouter);
app.route("/", analyticsRouter);
app.route("/", redirectRouter);    // catch-all last

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error("Unhandled:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// ── Startup ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3005);

async function start() {
  try {
    await connectDB();
    await connectCache();
    await connectProducer();
    await initClickHouse();
    console.log(`🚀 URL Shortener [Phase 4] — region: ${CURRENT_REGION.name}`);
    console.log(`   Running on http://localhost:${PORT}`);
  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  console.log(`\n${signal} — shutting down...`);
  await disconnectProducer();
  await disconnectDB();
  await disconnectCache();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

start();
export default { port: PORT, fetch: app.fetch };