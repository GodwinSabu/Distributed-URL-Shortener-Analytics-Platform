// We use ClickHouse's HTTP interface directly — no heavy SDK needed.
// POST queries as plain SQL text, parse JSON responses.

const CH_URL      = process.env.CLICKHOUSE_URL  ?? "http://localhost:8123";
const CH_DB       = process.env.CLICKHOUSE_DB   ?? "analytics";
const CH_USER     = process.env.CLICKHOUSE_USER ?? "chuser";
const CH_PASSWORD = process.env.CLICKHOUSE_PASSWORD ?? "chpass";

// ── ClickEvent row shape (matches the table schema below) ─────────────────────
export interface ClickRow {
  short_code:   string;
  original_url: string;
  ip_address:   string;
  user_agent:   string;
  referrer:     string;
  device_type:  string;
  country:      string;
  clicked_at:   string;   // DateTime string: "2024-01-01 12:00:00"
  cache_hit:    number;   // 0 or 1 (ClickHouse UInt8)
  node_id:      string;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function chRequest(
  query: string,
  method: "GET" | "POST" = "POST"
): Promise<string> {
  const url = new URL(CH_URL);
  url.searchParams.set("database", CH_DB);
  url.searchParams.set("user",     CH_USER);
  url.searchParams.set("password", CH_PASSWORD);

  const response = await fetch(url.toString(), {
    method,
    body:    method === "POST" ? query : undefined,
    headers: { "Content-Type": "text/plain" },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ClickHouse error ${response.status}: ${text}`);
  }

  return response.text();
}

// ── Schema setup — run once on startup ───────────────────────────────────────
export async function initClickHouse(): Promise<void> {
  // Create DB if not exists
  await chRequest(`CREATE DATABASE IF NOT EXISTS ${CH_DB}`);

  // Main analytics table
  // MergeTree — ClickHouse's primary engine, columnar storage
  // Partition by month — keeps queries fast by pruning old partitions
  // Order by (short_code, clicked_at) — optimal for per-link time queries
  await chRequest(`
    CREATE TABLE IF NOT EXISTS ${CH_DB}.clicks_analytics (
      short_code   LowCardinality(String),
      original_url String,
      ip_address   String,
      user_agent   String,
      referrer     LowCardinality(String),
      device_type  LowCardinality(String),
      country      LowCardinality(String),
      clicked_at   DateTime,
      cache_hit    UInt8,
      node_id      LowCardinality(String)
    )
    ENGINE = MergeTree()
    PARTITION BY toYYYYMM(clicked_at)
    ORDER BY (short_code, clicked_at)
    SETTINGS index_granularity = 8192
  `);

  // Materialised view: per-minute click counts (pre-aggregated)
  // This makes the "clicks over time" query instant — no scanning raw rows
  await chRequest(`
    CREATE TABLE IF NOT EXISTS ${CH_DB}.clicks_per_minute (
      short_code  LowCardinality(String),
      minute      DateTime,
      click_count UInt64,
      cache_hits  UInt64
    )
    ENGINE = SummingMergeTree()
    ORDER BY (short_code, minute)
  `);

  await chRequest(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS ${CH_DB}.clicks_per_minute_mv
    TO ${CH_DB}.clicks_per_minute AS
    SELECT
      short_code,
      toStartOfMinute(clicked_at) AS minute,
      count()                     AS click_count,
      sum(cache_hit)              AS cache_hits
    FROM ${CH_DB}.clicks_analytics
    GROUP BY short_code, minute
  `);

  console.log("✅ ClickHouse schema initialised");
}

// ── Bulk insert ───────────────────────────────────────────────────────────────
/**
 * Insert a batch of click rows using ClickHouse's JSONEachRow format.
 * Much faster than individual inserts — ClickHouse is optimised for bulk writes.
 */
export async function insertClickBatch(rows: ClickRow[]): Promise<void> {
  if (rows.length === 0) return;

  // JSONEachRow: one JSON object per line, no array wrapper
  const body = rows.map((r) => JSON.stringify(r)).join("\n");

  await chRequest(
    `INSERT INTO ${CH_DB}.clicks_analytics FORMAT JSONEachRow\n${body}`
  );
}

// ── Analytics queries ─────────────────────────────────────────────────────────

/** Clicks per minute for the last N hours */
export async function queryClicksOverTime(
  shortCode: string,
  hours = 24
): Promise<Array<{ minute: string; click_count: number; cache_hits: number }>> {
  const sql = `
    SELECT
      toString(minute)   AS minute,
      sum(click_count)   AS click_count,
      sum(cache_hits)    AS cache_hits
    FROM ${CH_DB}.clicks_per_minute
    WHERE
      short_code = '${shortCode}'
      AND minute >= now() - INTERVAL ${hours} HOUR
    GROUP BY minute
    ORDER BY minute ASC
    FORMAT JSON
  `;

  const raw  = await chRequest(sql);
  const data = JSON.parse(raw);
  return data.data ?? [];
}

/** Top referrers for a short code */
export async function queryTopReferrers(
  shortCode: string,
  limit = 10
): Promise<Array<{ referrer: string; clicks: number }>> {
  const sql = `
    SELECT
      if(referrer = '', 'Direct', referrer) AS referrer,
      count() AS clicks
    FROM ${CH_DB}.clicks_analytics
    WHERE short_code = '${shortCode}'
    GROUP BY referrer
    ORDER BY clicks DESC
    LIMIT ${limit}
    FORMAT JSON
  `;

  const raw  = await chRequest(sql);
  const data = JSON.parse(raw);
  return data.data ?? [];
}

/** Device type breakdown */
export async function queryDeviceBreakdown(
  shortCode: string
): Promise<Array<{ device_type: string; clicks: number; percentage: number }>> {
  const sql = `
    SELECT
      device_type,
      count()                                           AS clicks,
      round(count() * 100.0 / sum(count()) OVER (), 2) AS percentage
    FROM ${CH_DB}.clicks_analytics
    WHERE short_code = '${shortCode}'
    GROUP BY device_type
    ORDER BY clicks DESC
    FORMAT JSON
  `;

  const raw  = await chRequest(sql);
  const data = JSON.parse(raw);
  return data.data ?? [];
}

/** Total click count (fast — reads from pre-aggregated table) */
export async function queryTotalClicks(shortCode: string): Promise<number> {
  const sql = `
    SELECT sum(click_count) AS total
    FROM ${CH_DB}.clicks_per_minute
    WHERE short_code = '${shortCode}'
    FORMAT JSON
  `;

  const raw  = await chRequest(sql);
  const data = JSON.parse(raw);
  return Number(data.data?.[0]?.total ?? 0);
}

/** Ping ClickHouse — for health check */
export async function pingClickHouse(): Promise<boolean> {
  try {
    await chRequest("SELECT 1", "GET");
    return true;
  } catch {
    return false;
  }
}