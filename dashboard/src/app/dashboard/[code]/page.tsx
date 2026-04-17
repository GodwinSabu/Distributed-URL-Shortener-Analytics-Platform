import { Suspense }      from "react";
import StatsHeader       from "@/components/StatsHeader";
import ClicksChart       from "@/components/ClicksChart";
import DeviceBreakdown   from "@/components/DeviceBreakdown";
import TopReferrers      from "@/components/TopReferrers";
import WorldMap          from "@/components/WorldMap";
import RealtimeCounter   from "@/components/RealtimeCounter";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

async function getAnalytics(code: string) {
  const res = await fetch(
    `http://localhost:3001/api/analytics/${code}?hours=24`,
    { next: { revalidate: 10 } }   // ISR: revalidate every 10s
  );
  if (!res.ok) throw new Error("Failed to fetch analytics");
  return res.json();
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const data = await getAnalytics(code);

  const shortUrl = `${API}/${code}`;

  return (
    <div>
      <div className="flex items-start justify-between mb-2">
        <StatsHeader
          shortCode={code}
          totalClicks={data.summary.totalClicks}
          windowHours={data.summary.windowHours}
          shortUrl={shortUrl}
        />
        <Suspense fallback={<div className="text-slate-500 text-sm">Loading…</div>}>
          <RealtimeCounter code={code} />
        </Suspense>
      </div>

      {/* World map — full width */}
      <div className="mb-6">
        <WorldMap geoPoints={data.geoPoints ?? []} />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="lg:col-span-2">
          <ClicksChart data={data.clicksOverTime} />
        </div>
        <DeviceBreakdown data={data.deviceBreakdown} />
        <TopReferrers    data={data.topReferrers}    />
      </div>

      {/* Back link */}
      <a
        href="/"
        className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
      >
        ← All links
      </a>
    </div>
  );
}