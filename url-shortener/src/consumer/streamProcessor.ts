import "dotenv/config";
import { kafka } from "../lib/kafka";
import { insertClickBatch, initClickHouse, type ClickRow } from "../lib/clickhouse";
import type { ClickEvent } from "../lib/kafka";

const CONSUMER_GROUP = process.env.KAFKA_CONSUMER_GROUP ?? "click-processor";
const TOPIC          = process.env.KAFKA_TOPIC_CLICKS   ?? "click-events";

// ── Batch config ──────────────────────────────────────────────────────────────
const BATCH_SIZE     = 100;   // flush when we accumulate 100 events
const FLUSH_INTERVAL = 5000;  // or flush every 5 seconds, whichever comes first

// ── UA parsing — lightweight, no library needed ───────────────────────────────
function parseUserAgent(ua: string): {
  deviceType: "mobile" | "desktop" | "bot";
  browser:    string;
  os:         string;
} {
  const lower = ua.toLowerCase();

  let deviceType: "mobile" | "desktop" | "bot" = "desktop";
  if (/bot|crawl|spider|slurp|wget|curl|python|go-http/.test(lower)) {
    deviceType = "bot";
  } else if (/mobile|android|iphone|ipad|ipod|windows phone/.test(lower)) {
    deviceType = "mobile";
  }

  let browser = "Other";
  if (lower.includes("chrome") && !lower.includes("edg"))  browser = "Chrome";
  else if (lower.includes("firefox"))                        browser = "Firefox";
  else if (lower.includes("safari") && !lower.includes("chrome")) browser = "Safari";
  else if (lower.includes("edg"))                            browser = "Edge";

  let os = "Other";
  if (lower.includes("windows"))    os = "Windows";
  else if (lower.includes("mac"))   os = "macOS";
  else if (lower.includes("linux")) os = "Linux";
  else if (lower.includes("android")) os = "Android";
  else if (lower.includes("ios") || lower.includes("iphone")) os = "iOS";

  return { deviceType, browser, os };
}

/** Convert a ClickEvent (from Kafka) into a ClickRow (for ClickHouse) */
// Update the enrichEvent function to map new geo fields:
export function enrichEvent(event: ClickEvent): ClickRow {
    const { deviceType } = parseUserAgent(event.userAgent);
    const dt = new Date(event.clickedAt);
    const clickedAt = dt.toISOString().replace("T", " ").substring(0, 19);
  
    return {
      short_code:   event.shortCode,
      original_url: event.originalUrl,
      ip_address:   event.ipAddress,
      user_agent:   event.userAgent,
      referrer:     event.referrer  ?? "",
      device_type:  deviceType,
      country:      event.country   ?? "",
      city:         event.city      ?? "",        // ← new
      lat:          event.lat       ?? 0,         // ← new
      lon:          event.lon       ?? 0,         // ← new
      clicked_at:   clickedAt,
      cache_hit:    event.cacheHit ? 1 : 0,
      node_id:      event.nodeId,
      region_id:    event.regionId  ?? "",        // ← new
    };
  }

// ── Consumer ──────────────────────────────────────────────────────────────────
async function startConsumer(): Promise<void> {
  // Initialise ClickHouse tables before consuming
  await initClickHouse();

  const consumer = kafka.consumer({
    groupId:                     CONSUMER_GROUP,
    sessionTimeout:              30000,
    heartbeatInterval:           3000,
    maxBytesPerPartition:        1048576,  // 1MB per partition per fetch
  });

  await consumer.connect();
  console.log("✅ Kafka consumer connected");

  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  console.log(`📡 Subscribed to topic: ${TOPIC}`);

  // ── Batch buffer ────────────────────────────────────────────────────────────
  let buffer: ClickRow[] = [];
  let lastFlush = Date.now();

  async function flushBuffer(): Promise<void> {
    if (buffer.length === 0) return;

    const toFlush = [...buffer];
    buffer = [];
    lastFlush = Date.now();

    try {
      await insertClickBatch(toFlush);
      console.log(`✅ Flushed ${toFlush.length} click events to ClickHouse`);
    } catch (err) {
      console.error("❌ ClickHouse insert failed — events lost:", err);
      // In production: write to dead-letter queue or S3 for replay
    }
  }

  // Periodic flush — ensures events don't sit in buffer too long during quiet periods
  const flushTimer = setInterval(async () => {
    if (Date.now() - lastFlush >= FLUSH_INTERVAL) {
      await flushBuffer();
    }
  }, 1000);

  // ── Message processing ──────────────────────────────────────────────────────
  await consumer.run({
    // eachBatch gives us control over commits — safer for at-least-once delivery
    eachBatchAutoResolve: true,
    eachBatch: async ({ batch, resolveOffset, heartbeat }) => {
      for (const message of batch.messages) {
        if (!message.value) continue;

        try {
          const event = JSON.parse(message.value.toString()) as ClickEvent;
          const row   = enrichEvent(event);
          buffer.push(row);

          // Flush when batch size reached
          if (buffer.length >= BATCH_SIZE) {
            await flushBuffer();
          }

          resolveOffset(message.offset);

          // Heartbeat every 10 messages to prevent session timeout
          if (batch.messages.indexOf(message) % 10 === 0) {
            await heartbeat();
          }
        } catch (err) {
          console.error("Failed to process message:", err, message.value?.toString());
          // Skip bad messages — don't let one bad event crash the consumer
          resolveOffset(message.offset);
        }
      }
    },
  });

  // ── Graceful shutdown ───────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} — flushing buffer and shutting down...`);
    clearInterval(flushTimer);
    await flushBuffer();       // flush remaining events
    await consumer.disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

// ── Entry point ───────────────────────────────────────────────────────────────
startConsumer().catch((err) => {
  console.error("Consumer startup failed:", err);
  process.exit(1);
});