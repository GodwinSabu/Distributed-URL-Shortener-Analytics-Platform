import { publishClickEvent, type ClickEvent } from "../lib/kafka";
import type { GeoLocation } from "../lib/geoip";

type Source = "cache" | "db";

function detectDevice(ua: string): "mobile" | "desktop" | "bot" {
  const lower = ua.toLowerCase();
  if (/bot|crawl|spider|slurp|wget|curl/.test(lower)) return "bot";
  if (/mobile|android|iphone|ipad|ipod/.test(lower))  return "mobile";
  return "desktop";
}

function extractIP(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip")                             ??
    "127.0.0.1"
  );
}

/**
 * Publish click to Kafka — now includes country from geo context.
 * Country flows all the way to ClickHouse for the world map in Phase 5.
 */
export async function recordClick(
  req:         Request,
  shortCode:   string,
  source:      Source,
  originalUrl  = "",
  geo?:        GeoLocation          // ← new — passed from redirect.ts
): Promise<void> {
  const ip        = extractIP(req);
  const userAgent = req.headers.get("user-agent") ?? "";
  const referrer  = req.headers.get("referer")    ?? null;

  const event: ClickEvent = {
    shortCode,
    originalUrl,
    ipAddress:   ip,
    userAgent,
    referrer,
    deviceType:  detectDevice(userAgent),
    country:     geo?.countryCode ?? null,   // ← now populated from real geo
    city:        geo?.city        ?? null,
    lat:         geo?.lat         ?? null,
    lon:         geo?.lon         ?? null,
    clickedAt:   new Date().toISOString(),
    cacheHit:    source === "cache",
    nodeId:      process.env.NODE_ID   ?? "node-1",
    regionId:    process.env.REGION_ID ?? "us-east",
  };

  await publishClickEvent(event);
}