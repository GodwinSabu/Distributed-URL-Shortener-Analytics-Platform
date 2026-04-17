import { NextRequest } from "next/server";

const CH_URL  = process.env.CLICKHOUSE_URL      ?? "http://localhost:8123";
const CH_DB   = process.env.CLICKHOUSE_DB       ?? "analytics";
const CH_USER = process.env.CLICKHOUSE_USER     ?? "chuser";
const CH_PASS = process.env.CLICKHOUSE_PASSWORD ?? "chpass";

async function getClicksLastMinute(code: string): Promise<number> {
  const url = new URL(CH_URL);
  url.searchParams.set("database", CH_DB);
  url.searchParams.set("user",     CH_USER);
  url.searchParams.set("password", CH_PASS);

  const sql = `
    SELECT count() AS cnt
    FROM ${CH_DB}.clicks_analytics
    WHERE short_code = '${code}'
      AND clicked_at >= now() - INTERVAL 1 MINUTE
    FORMAT JSON
  `;

  const res  = await fetch(url.toString(), {
    method: "POST", body: sql,
    headers: { "Content-Type": "text/plain" },
  });

  const data = await res.json() as { data: Array<{ cnt: number }> };
  return Number(data.data?.[0]?.cnt ?? 0);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Send event every 3 seconds
      const interval = setInterval(async () => {
        try {
          const cpm = await getClicksLastMinute(code);
          const payload = JSON.stringify({
            code,
            clicksPerMinute: cpm,
            timestamp:       new Date().toISOString(),
          });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          // ClickHouse might be temporarily unavailable
        }
      }, 3000);

      // Clean up when client disconnects
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });

      // Send initial event immediately
      const cpm     = await getClicksLastMinute(code);
      const initial = JSON.stringify({
        code,
        clicksPerMinute: cpm,
        timestamp:       new Date().toISOString(),
      });
      controller.enqueue(encoder.encode(`data: ${initial}\n\n`));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}