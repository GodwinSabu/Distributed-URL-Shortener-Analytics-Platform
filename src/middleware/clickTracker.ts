import { db } from "../db";

type Source = "cache" | "db";

/** Parse user-agent string into device type */
function detectDevice(ua: string): "mobile" | "desktop" | "bot" {
  const lower = ua.toLowerCase();
  if (/bot|crawl|spider|slurp|wget|curl/.test(lower)) return "bot";
  if (/mobile|android|iphone|ipad|ipod/.test(lower)) return "mobile";
  return "desktop";
}

/** Extract real IP — handles proxy headers */
function extractIP(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Record a click event in the database.
 * Called as fire-and-forget — never blocks the redirect response.
 */
export async function recordClick(
  req: Request,
  shortCode: string,
  _source: Source
): Promise<void> {
  const ip        = extractIP(req);
  const userAgent = req.headers.get("user-agent") ?? "";
  const referrer  = req.headers.get("referer") ?? null;
  const device    = detectDevice(userAgent);

  try {
    // Get url_id from short_code (we need the FK)
    const urlResult = await db.query<{ id: string }>(
      "SELECT id FROM urls WHERE short_code = $1",
      [shortCode]
    );
    if (urlResult.rows.length === 0) return;

    await db.query(
      `INSERT INTO clicks (url_id, short_code, ip_address, user_agent, referrer, device_type)
       VALUES ($1, $2, $3::inet, $4, $5, $6)`,
      [urlResult.rows[0].id, shortCode, ip, userAgent, referrer, device]
    );
  } catch (err) {
    // Non-fatal — analytics loss is acceptable, redirect must never fail
    console.error("Click tracking failed:", err);
  }
}