import { NextRequest, NextResponse } from "next/server";

const CH_URL  = process.env.CLICKHOUSE_URL      ?? "http://localhost:8123";
const CH_DB   = process.env.CLICKHOUSE_DB       ?? "analytics";
const CH_USER = process.env.CLICKHOUSE_USER     ?? "chuser";
const CH_PASS = process.env.CLICKHOUSE_PASSWORD ?? "chpass";

async function chQuery(sql: string): Promise<unknown[]> {
  const url = new URL(CH_URL);
  url.searchParams.set("database", CH_DB);
  url.searchParams.set("user",     CH_USER);
  url.searchParams.set("password", CH_PASS);

  const res  = await fetch(url.toString(), {
    method:  "POST",
    body:    sql + " FORMAT JSON",
    headers: { "Content-Type": "text/plain" },
  });

  if (!res.ok) throw new Error(`ClickHouse ${res.status}: ${await res.text()}`);
  const data = await res.json() as { data: unknown[] };
  return data.data ?? [];
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const hours    = Number(req.nextUrl.searchParams.get("hours") ?? 24);

  try {
    const [overTime, referrers, devices, totals, geoPoints] = await Promise.all([
      // Clicks per minute
      chQuery(`
        SELECT toString(minute) AS minute,
               sum(click_count) AS click_count,
               sum(cache_hits)  AS cache_hits
        FROM clicks_per_minute
        WHERE short_code = '${code}'
          AND minute >= now() - INTERVAL ${hours} HOUR
        GROUP BY minute ORDER BY minute ASC
      `),

      // Top referrers
      chQuery(`
        SELECT if(referrer='','Direct',referrer) AS referrer,
               count() AS clicks
        FROM clicks_analytics
        WHERE short_code = '${code}'
        GROUP BY referrer
        ORDER BY clicks DESC LIMIT 10
      `),

      // Device breakdown
      chQuery(`
        SELECT device_type,
               count() AS clicks,
               round(count()*100.0/sum(count()) OVER(),1) AS percentage
        FROM clicks_analytics
        WHERE short_code = '${code}'
        GROUP BY device_type
        ORDER BY clicks DESC
      `),

      // Total clicks
      chQuery(`
        SELECT sum(click_count) AS total
        FROM clicks_per_minute
        WHERE short_code = '${code}'
      `),

      // Geo points for world map (last 500 clicks)
      chQuery(`
        SELECT lat, lon, country, city, toString(clicked_at) AS clicked_at
        FROM clicks_analytics
        WHERE short_code = '${code}'
          AND lat != 0 AND lon != 0
        ORDER BY clicked_at DESC LIMIT 500
      `),
    ]);

    const total = (totals[0] as { total: number })?.total ?? 0;

    return NextResponse.json({
      shortCode: code,
      summary:   { totalClicks: Number(total), windowHours: hours },
      clicksOverTime:   overTime,
      topReferrers:     referrers,
      deviceBreakdown:  devices,
      geoPoints,
    });
  } catch (err) {
    console.error("Analytics error:", err);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}