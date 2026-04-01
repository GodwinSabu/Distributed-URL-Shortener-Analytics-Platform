import type { Context, Next } from "hono";
import { geolocate }          from "../lib/geoip";
import { selectRegionForGeo } from "../lib/regionRouter";
import type { GeoLocation }   from "../lib/geoip";
import type { RegionDecision } from "../lib/regionRouter";

// Shape stored in Hono context for downstream handlers
export interface GeoContext {
  geo:      GeoLocation;
  routing:  RegionDecision;
}

// Extract real client IP from request headers
function extractIP(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0].trim() ??
    c.req.header("x-real-ip")                             ??
    c.req.header("cf-connecting-ip")                      ??  // Cloudflare
    "127.0.0.1"
  );
}

/**
 * Geo middleware — runs before redirect handlers.
 * 1. Extracts real client IP
 * 2. Geolocates it (cached LRU — fast after first hit)
 * 3. Selects nearest region
 * 4. Attaches GeoContext to c.set("geo") for downstream use
 * 5. Sets response headers: X-Geo-Country, X-Geo-Region
 *
 * Never throws — geo failure is non-fatal, redirect always proceeds.
 */
export async function geoMiddleware(c: Context, next: Next): Promise<Response | void> {
  const ip  = extractIP(c);
  const geo = await geolocate(ip);
  const routing = selectRegionForGeo(geo);

  // Store in context for redirect.ts to use
  c.set("geo",     geo);
  c.set("routing", routing);

  // Informational headers — visible in browser DevTools / curl -v
  c.header("X-Geo-Country",  geo.countryCode);
  c.header("X-Geo-City",     geo.city);
  c.header("X-Geo-Region",   routing.region.id);
  c.header("X-Served-By",    process.env.NODE_ID ?? "node-1");

  await next();
}