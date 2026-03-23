import "dotenv/config";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { connectDB, disconnectDB, db } from "./db";
import { connectCache, disconnectCache, pingCache } from "./cache";
import { shortenRouter } from "./routes/shorten";
import { redirectRouter } from "./routes/redirect";
import { linksRouter } from "./routes/links";

const app = new Hono();

// ── Global middleware ──────────────────────────────────────────────────────────
app.use("*", logger());
app.use("*", cors({ origin: "*" }));

// ── Health check ───────────────────────────────────────────────────────────────
app.get("/health", async (c) => {
  let dbOk = false;
  let cacheOk = false;

  try {
    await db.query("SELECT 1");
    dbOk = true;
  } catch {}

  cacheOk = await pingCache();

  const status = dbOk && cacheOk ? 200 : 503;
  return c.json(
    {
      status: status === 200 ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk    ? "ok" : "down",
        cache:    cacheOk ? "ok" : "down",
      },
    },
    status
  );
});

// ── Routes ─────────────────────────────────────────────────────────────────────
app.route("/", shortenRouter);   // POST /shorten
app.route("/", linksRouter);     // GET/DELETE /api/links
app.route("/", redirectRouter);  // GET /:code  ← must be last (catch-all)

// ── 404 fallback ───────────────────────────────────────────────────────────────
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// ── Startup ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3000);

async function start() {
  try {
    await connectDB();
    await connectCache();
    console.log(`🚀 URL Shortener running on http://localhost:${PORT}`);
  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }
}

// ── Graceful shutdown ──────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down gracefully...`);
  await disconnectDB();
  await disconnectCache();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

start();

export default {
  port: PORT,
  fetch: app.fetch,
};