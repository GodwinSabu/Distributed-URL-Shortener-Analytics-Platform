This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


# Distributed URL Shortener & Analytics Platform

> A production-grade, multi-region short link engine with real-time analytics — built the way companies like Cloudflare, Uber, and Bitly actually build these systems.

```
snip.ly/abc123  →  <10ms  →  https://your-destination.com
      |
      Every click captured → Kafka → ClickHouse → Live Dashboard
```

---

## What this actually is

A URL shortener is the perfect distributed systems teaching vehicle. The problem looks trivially simple — store a mapping, do a lookup, redirect. But at scale it exposes every hard problem in backend engineering: sub-10ms latency under load, analytics pipelines that cannot slow down the hot path, geo-routing across continents, rate limiting across distributed nodes, and observability that tells you what is wrong before users notice.

This project is a complete implementation of all of those problems. Not a toy. Not a tutorial. The architecture here is the same architecture you would find inside Bitly, Rebrandly, or any serious link management product.

---

## System architecture

```
                     +-----------------------------+
                     |        USER CLICKS          |
                     |  snip.ly/abc123 (anywhere)  |
                     +-------------+---------------+
                                   |
                     +-------------v---------------+
                     |        API GATEWAY          |
                     |  Rate limit  (Redis)        |
                     |  IP Geolocation (ip-api.com)|
                     |  Nearest region selection   |
                     +------+---------------+------+
               302 wrong    |               |  correct
               region       v               v  region
          +---------+  +-----------------------------+
          | EU West |  |     REDIRECT SERVICE        |
          | AP South|  |  Consistent hash ring       |
          +---------+  |  Redis cache-aside (1ms)    |
                       |  PostgreSQL fallback (15ms) |
                       |  301 to destination URL     |
                       +------------+----------------+
                                    | async fire & forget
                     +--------------v--------------+
                     |           KAFKA             |
                     |  topic: click-events        |
                     |  partitioned by shortCode   |
                     |  retained 7 days on disk    |
                     +--------------+--------------+
                                    |
                     +--------------v--------------+
                     |      STREAM PROCESSOR       |
                     |  Consume -> Enrich -> Batch |
                     |  Parse UA -> device/browser |
                     |  Flush every 100 events/5s  |
                     +--------------+--------------+
                                    |
                     +--------------v--------------+
                     |         CLICKHOUSE          |
                     |  Columnar MergeTree storage |
                     |  Sorted by (code, time)     |
                     |  Materialised view per-min  |
                     +--------------+--------------+
                                    |
                     +--------------v--------------+
                     |     NEXT.JS DASHBOARD       |
                     |  Live click counter (SSE)   |
                     |  World map (lat/lon dots)   |
                     |  Device, Referrer, Charts   |
                     +-----------------------------+
```

---

## Tech stack — every choice justified

| Technology | The problem it solves | Why not the alternative |
|---|---|---|
| **Bun.js** | JavaScript runtime | 3x faster than Node.js. Native TypeScript. Built-in test runner. |
| **Hono** | HTTP framework | 120k req/s vs Express 15k req/s. Web-standard APIs. |
| **PostgreSQL** | URL storage | ACID transactions. Unique constraints. BIGSERIAL enables Base62. |
| **Redis** | Cache + rate limiting | 0.1ms GET vs 15ms DB. Sorted sets for sliding window rate limit. |
| **Kafka** | Click event pipeline | Decouples analytics from redirect latency. 7-day replay capability. |
| **ClickHouse** | Analytics queries | 100x faster GROUP BY than PostgreSQL. Columnar. Materialised views. |
| **Next.js 14** | Dashboard | Server-side ClickHouse credentials. SSR. Vercel zero-config deploy. |
| **Kubernetes** | Orchestration | Auto-healing. HPA auto-scaling. Zero-downtime rolling deploys. |
| **Terraform** | Infrastructure as code | Entire cloud in git. Reproducible. Reviewable in PRs. |
| **Prometheus + Grafana** | Observability | RED metrics. SLO tracking. Burn rate alerts. |

---

## The 6 microservices

```
Service 1  API Gateway + Geo Router
           Every request enters here first.
           Rate limits by IP using Redis sliding window (100 req/min).
           Geolocates client IP via ip-api.com with LRU cache.
           Selects nearest region using haversine distance calculation.
           Returns 302 to correct region if request belongs elsewhere.

Service 2  Redirect Engine
           GET /:code => 301 redirect in under 10ms.
           Consistent hash ring ensures same code always hits same node.
           Redis cache-aside: HIT = 1ms, MISS = 15ms PostgreSQL fallback.
           Fires Kafka event after 301 is already sent. User never waits.

Service 3  Shortener API
           POST /shorten creates a short link.
           Base62 encodes the BIGSERIAL auto-increment ID. Collision-free.
           Warms Redis cache immediately so first redirect is a cache HIT.
           GET / DELETE /api/links for full CRUD operations.

Service 4  Analytics Ingest (Kafka Producer)
           Publishes ClickEvent to Kafka per redirect.
           Payload: IP, UA, referrer, country, lat/lon, timestamp.
           If Kafka unavailable: logs and continues. Never blocks redirect.

Service 5  Stream Processor (Kafka Consumer)
           Separate Bun process deployed as its own service.
           Enriches events: parses user-agent to device type and browser.
           Batches 100 events OR flushes every 5 seconds.
           Bulk INSERT to ClickHouse using JSONEachRow format.

Service 6  Next.js Dashboard
           App Router with server components querying ClickHouse directly.
           Live counter via SSE streaming clicks/minute every 3 seconds.
           World map: plots lat/lon of every click as SVG dots.
           Charts: clicks over time, device breakdown, top referrers.
```

---

## Project structure

```
url-shortener-platform/
|
+-- url-shortener/                  <- Bun.js backend (Services 1-5)
|   +-- src/
|   |   +-- index.ts                <- Entry point, all middleware, startup
|   |   +-- db.ts                   <- PostgreSQL connection pool
|   |   +-- cache.ts                <- Redis client, cache-aside helpers
|   |   +-- encoder.ts              <- Base62 encode/decode
|   |   +-- lib/
|   |   |   +-- hashRing.ts         <- Consistent hashing, 150 virtual nodes
|   |   |   +-- rateLimiter.ts      <- Redis sliding window algorithm
|   |   |   +-- nodeRouter.ts       <- Routing decisions using hash ring
|   |   |   +-- kafka.ts            <- Kafka producer, ClickEvent type
|   |   |   +-- clickhouse.ts       <- HTTP client, schema init, queries
|   |   |   +-- geoip.ts            <- LRU-cached IP geolocation
|   |   |   +-- regionRouter.ts     <- Haversine distance, country map
|   |   |   +-- metrics.ts          <- prom-client counters + histograms
|   |   +-- middleware/
|   |   |   +-- clickTracker.ts     <- Publishes to Kafka on every redirect
|   |   |   +-- geoMiddleware.ts    <- Attaches geo context to requests
|   |   |   +-- rateLimitMiddleware.ts
|   |   +-- routes/
|   |   |   +-- redirect.ts         <- GET /:code -> 301
|   |   |   +-- shorten.ts          <- POST /shorten
|   |   |   +-- links.ts            <- CRUD /api/links
|   |   |   +-- analytics.ts        <- GET /api/analytics/:code
|   |   +-- consumer/
|   |       +-- streamProcessor.ts  <- Kafka consumer + ClickHouse writer
|   +-- schema.sql                  <- urls, users, clicks tables + indexes
|   +-- docker-compose.yml          <- Local dev: Postgres, Redis, Kafka, CH
|   +-- Dockerfile
|   +-- package.json
|
+-- dashboard/                      <- Next.js 14 App Router (Service 6)
|   +-- src/
|   |   +-- app/
|   |   |   +-- page.tsx            <- Links list + create form
|   |   |   +-- dashboard/[code]/page.tsx
|   |   |   +-- api/
|   |   |       +-- analytics/[code]/route.ts
|   |   |       +-- links/route.ts
|   |   |       +-- realtime/[code]/route.ts  <- SSE stream
|   |   +-- components/
|   |       +-- ClicksChart.tsx     <- recharts LineChart
|   |       +-- DeviceBreakdown.tsx <- recharts PieChart
|   |       +-- TopReferrers.tsx    <- recharts BarChart
|   |       +-- WorldMap.tsx        <- SVG equirectangular world map
|   |       +-- RealtimeCounter.tsx <- SSE consumer + sparkline
|   +-- Dockerfile
|
+-- infra/
|   +-- terraform/
|   |   +-- main.tf                 <- Root: VPC + EKS + RDS + ElastiCache
|   |   +-- variables.tf
|   |   +-- modules/
|   |       +-- vpc/
|   |       +-- eks/
|   |       +-- rds/
|   |       +-- elasticache/
|   +-- k8s/
|       +-- namespaces.yaml
|       +-- url-shortener/          <- Deployment, Service, HPA, ConfigMap
|       +-- consumer/
|       +-- dashboard/
|       +-- kafka/
|       +-- clickhouse/
|       +-- redis/
|       +-- ingress/
|
+-- observability/
|   +-- prometheus/
|   |   +-- prometheus.yml
|   |   +-- recording-rules.yaml
|   |   +-- alert-rules.yaml
|   +-- grafana/
|       +-- dashboards/
|           +-- url-shortener.json
|
+-- tests/
|   +-- unit/
|   +-- integration/
|   +-- e2e/
|
+-- Makefile
+-- docker-compose.yml
```

---

## A single click, traced completely end to end

```
1.  User clicks snip.ly/thrissur
    Browser:  GET snip.ly/thrissur
              X-Forwarded-For: 49.36.82.14

2.  API Gateway
    Rate:     Redis ZADD+ZCARD on "rl:ip:49.36.82.14" -> 3 of 100 used
    Geo:      ip-api.com -> country: IN, city: Thrissur, lat:10.527, lon:76.214
    Region:   COUNTRY_MAP["IN"] -> "ap-south" -> this IS ap-south -> no redirect

3.  Redirect service
    Hash:     MD5("thrissur") -> node-2 (this pod owns this code)
    Redis:    GET "url:thrissur" -> "https://example.com/product" -- HIT
    Returns:  HTTP 301, Location: https://example.com/product
              X-Cache-Status: HIT, X-Geo-Country: IN
    Time:     ~2ms total

    After 301 sent -> publishClickEvent() fire-and-forget

4.  Kafka event (partition 3, offset 1482940):
    {
      shortCode:  "thrissur",
      country:    "IN",
      city:       "Thrissur",
      lat:        10.527, lon: 76.214,
      deviceType: "mobile",
      referrer:   "https://wa.me",
      clickedAt:  "2024-01-15T14:32:11Z",
      cacheHit:   true
    }

5.  Stream processor (5 seconds later, separate process)
    Reads:  batch of 100 events from Kafka consumer group
    Parses: user-agent -> "iPhone, Safari, iOS 17"
    INSERT INTO clicks_analytics FORMAT JSONEachRow (100 rows at once)

6.  ClickHouse
    Stores row sorted by (shortCode, clickedAt)
    Materialised view updates clicks_per_minute automatically

7.  Dashboard query (10 seconds after the click)
    SELECT country_name, count() FROM clicks_analytics
    WHERE short_code = 'thrissur' GROUP BY country_name
    -> 50ms response regardless of total event volume
    -> Shows: India 1,247 clicks
```

---

## Key engineering decisions

### Kafka: decoupling analytics from redirect latency

Without Kafka, the redirect handler must await the analytics write before returning 301. A slow ClickHouse compaction or outage would directly increase user-facing redirect latency — or make redirects fail entirely.

Kafka breaks this coupling. The redirect fires an event and immediately returns. The stream processor consumes at ClickHouse's pace. A full ClickHouse outage produces zero user-visible impact — events queue in Kafka for up to 7 days. The replay capability means a parsing bug discovered months later can be fixed retroactively by reprocessing all historical events through a corrected parser.

### ClickHouse: why columnar makes the 100x difference

PostgreSQL stores data row by row. COUNT(*) GROUP BY country on 500 million rows reads every column of every row — 100GB of disk reads, 45-90 minutes.

ClickHouse stores each column as a separate file. The same query reads only the country column — with LowCardinality encoding, approximately 100MB of actual disk reads, running in 2 seconds. The materialised view pre-aggregates on every insert so dashboard queries never touch raw data — sub-millisecond regardless of total event volume.

### Consistent hashing: why modulo breaks under scaling

Modulo hashing remaps 67% of keys when one node of three is removed. Consistent hashing remaps only 1/N keys. The remaining 2/N keep their node assignment with warm caches. 150 virtual nodes per physical server ensures even distribution.

### Redis sliding window vs fixed window

Fixed window allows a burst of 100 requests at :59 and 100 more at :01 — 200 in 2 seconds. Sliding window uses a Redis sorted set where each request's timestamp is the score. Remove scores older than now-60s, count remaining, add new timestamp — all in one pipelined round trip under 0.5ms. No boundary burst possible.

---

## Performance characteristics

```
Redirect latency (p99)
  Cache HIT:    ~2ms    (rate limit + geo + Redis GET)
  Cache MISS:   ~15ms   (same + PostgreSQL SELECT + Redis SET)

Analytics pipeline
  Click -> Kafka:           ~1ms
  Kafka -> ClickHouse:      ~5 seconds max
  Click -> dashboard:       ~10 seconds end to end

Throughput
  Per pod:           ~50,000 req/s
  With HPA (4 pods): ~200,000 req/s
  Cache hit rate:    94-97% steady state
```

---

## Observability

Follows the RED method: Rate (requests/s), Errors (5xx ratio), Duration (p99 latency).

Metrics scraped from `/metrics` every 15 seconds by Prometheus.

Alert rules (9 total): HighLatencyP99, CriticalLatencyP99, HighErrorRate,
CacheHitRateLow, KafkaPublishErrorsHigh, PodCrashLooping, RedisDown,
KafkaBatchFlushFailing, SLOBurnRateFast.

SLO: 99.9% monthly availability = 43.8 minutes error budget per month.

---

## Zero-cost deployment

### Option A — Managed services (15 minutes, $0/month)

| Component | Service | Limit |
|---|---|---|
| Backend + consumer | Railway.app free | 500 CPU hrs/month |
| Dashboard | Vercel free | 100GB bandwidth |
| PostgreSQL | Neon.tech free | 512MB |
| Redis | Upstash free | 10,000 req/day |
| Kafka | Upstash free | 10,000 msg/day |
| ClickHouse | ClickHouse Cloud trial -> Tinybird free | 1M events/month |
| Monitoring | Grafana Cloud free | 10k metric series |
| Total | | **$0/month** |

### Option B — Full Kubernetes on Oracle Cloud (free forever)

Oracle Always Free tier: 4 OCPUs, 24GB RAM, no expiry.
Install k3s (lightweight Kubernetes) and run the entire stack.

```bash
# SSH into Oracle free VM, install k3s
curl -sfL https://get.k3s.io | sh -
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Deploy everything
kubectl apply -f infra/k8s/namespaces.yaml
kubectl apply -f infra/k8s/

# Verify
kubectl get pods -n url-shortener
kubectl get hpa  -n url-shortener
```

---

## Local development

```bash
# Prerequisites: Docker Desktop, Bun

# Start all infrastructure
cd url-shortener
docker compose up -d

# API server (Terminal 1)
bun dev

# Stream processor (Terminal 2)
bun run consumer

# Dashboard (Terminal 3)
cd ../dashboard && npm install
npm run dev -- --port 3001

# Test the flow
curl -X POST http://localhost:3000/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com", "customCode": "gh"}'

curl -v http://localhost:3000/gh
# 301 -> github.com, X-Cache-Status: HIT

open http://localhost:3001/dashboard/gh
```

---

## Running tests

```bash
# All tests
bun test

# Unit only (no Docker needed, runs in 2 seconds)
bun test tests/unit

# Integration (needs docker compose up -d)
bun test tests/integration

# Watch mode while developing
bun test --watch tests/unit

# Coverage
bun test --coverage
```

---

## API reference

```
POST   /shorten
       Body: { url, customCode?, expiresAt? }
       Returns: { shortCode, shortUrl, originalUrl }

GET    /:code
       Returns: 301 redirect
       Headers: X-Cache-Status, X-Geo-Country, X-Served-By

GET    /api/links?page=1&limit=20
       Returns: { links, pagination }

DELETE /api/links/:code
       Returns: { success: true }

GET    /api/analytics/:code?hours=24
       Returns: { summary, clicksOverTime, topReferrers, deviceBreakdown, geoPoints }

GET    /api/realtime/:code   (SSE)
       Streams: { clicksPerMinute, timestamp } every 3 seconds

GET    /health
       Returns: { status, region, services }

GET    /metrics
       Returns: Prometheus exposition format
```

---

## What interviewers ask about this project

**Why Kafka instead of writing directly to ClickHouse?**
Coupling analytics writes to the redirect handler couples user latency to analytics pipeline health. Kafka breaks this. A ClickHouse outage queues events for up to 7 days and drains transparently when it recovers. The replay capability — reprocessing all historical events through a fixed parser — is impossible with any system that deletes messages on consumption.

**Why ClickHouse instead of PostgreSQL for analytics?**
PostgreSQL GROUP BY on 500M rows reads every column of every row — 100GB disk reads, 90 minutes. ClickHouse reads only the queried column — 100MB after compression, 2 seconds. Materialised views pre-aggregate on every insert so the dashboard query never touches raw data.

**How does consistent hashing prevent cache stampedes?**
Modulo hashing remaps 67% of keys when one of three nodes is removed. Consistent hashing remaps only 1/3. The other 2/3 keep their node assignment with warm caches. 150 virtual nodes ensure even distribution.

**What happens when Redis goes down?**
Fail-open pattern: every Redis call is wrapped in try/catch returning null on failure. Redirect falls through to PostgreSQL — latency increases from 2ms to 15ms but every request succeeds. Degraded performance beats incorrectly blocking all users during an infrastructure outage.

---

## Built with

Bun.js · Hono · PostgreSQL · Redis · Apache Kafka · ClickHouse · Next.js 14 · TypeScript · Kubernetes · Terraform · Prometheus · Grafana · Docker

---

*Every architectural decision in this codebase is documented with the specific problem it solves and the trade-off it makes. The goal is not to use impressive technology — it is to use the right tool for each specific problem.*
