import { Kafka, Producer, CompressionTypes, logLevel } from "kafkajs";

// ── ClickEvent shape — everything we capture per redirect ─────────────────────
// Add these fields to the existing ClickEvent interface
export interface ClickEvent {
    shortCode:   string;
    originalUrl: string;
    ipAddress:   string;
    userAgent:   string;
    referrer:    string | null;
    deviceType:  "mobile" | "desktop" | "bot";
    country:     string | null;
    city:        string | null;       // ← new
    lat:         number | null;       // ← new
    lon:         number | null;       // ← new
    clickedAt:   string;
    cacheHit:    boolean;
    nodeId:      string;
    regionId:    string;              // ← new
  }

// ── Kafka client (singleton) ───────────────────────────────────────────────────
const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID ?? "url-shortener",
  brokers:  (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
  logLevel: logLevel.WARN,      // suppress INFO noise in dev
  retry: {
    initialRetryTime: 300,
    retries: 5,
  },
});

const TOPIC = process.env.KAFKA_TOPIC_CLICKS ?? "click-events";

// ── Producer singleton ────────────────────────────────────────────────────────
let producer: Producer | null = null;

export async function connectProducer(): Promise<void> {
  producer = kafka.producer({
    // Wait for leader acknowledgement only (not all replicas)
    // Good balance of speed vs durability for analytics data
    allowAutoTopicCreation: true,
    transactionTimeout: 30000,
  });

  await producer.connect();
  console.log("✅ Kafka producer connected");
}

export async function disconnectProducer(): Promise<void> {
  await producer?.disconnect();
  producer = null;
  console.log("🔌 Kafka producer disconnected");
}

/**
 * Publish a click event to the Kafka topic.
 * Called fire-and-forget from the redirect handler — never awaited.
 *
 * If Kafka is down, we log and move on. Analytics loss is acceptable.
 * The redirect MUST succeed regardless.
 */
export async function publishClickEvent(event: ClickEvent): Promise<void> {
  if (!producer) {
    console.warn("Kafka producer not connected — skipping click event");
    return;
  }

  try {
    await producer.send({
      topic: TOPIC,
      compression: CompressionTypes.GZIP,
      messages: [
        {
          // Partition by shortCode so all clicks for the same link
          // go to the same partition — preserves ordering per link
          key:   event.shortCode,
          value: JSON.stringify(event),
          headers: {
            "event-type":    "click",
            "schema-version": "1",
            "produced-at":   Date.now().toString(),
          },
        },
      ],
    });
  } catch (err) {
    // Non-fatal — analytics pipeline failure never affects redirect latency
    console.error("Failed to publish click event to Kafka:", err);
  }
}

// Export raw kafka instance for the consumer
export { kafka };