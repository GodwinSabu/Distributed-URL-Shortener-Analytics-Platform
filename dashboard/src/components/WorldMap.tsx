"use client";

interface GeoPoint {
  country?: string;
  city?: string;
  lat?: number;
  lon?: number;
  clicks: number;
}

interface Props {
  geoPoints: GeoPoint[];
}

export default function WorldMap({ geoPoints }: Props) {
  const total = geoPoints.reduce((sum, p) => sum + Number(p.clicks ?? 0), 0);
  const top = [...geoPoints].sort((a, b) => b.clicks - a.clicks).slice(0, 8);

  return (
    <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
      <h2 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">
        Geographic distribution
      </h2>

      {top.length === 0 ? (
        <p className="text-sm text-slate-500">No location data yet.</p>
      ) : (
        <div className="space-y-3">
          {top.map((point, idx) => {
            const pct = total > 0 ? (point.clicks / total) * 100 : 0;
            const label = point.city || point.country || "Unknown";
            return (
              <div key={`${label}-${idx}`}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-slate-200 truncate pr-3">{label}</span>
                  <span className="text-slate-400 tabular-nums">
                    {point.clicks.toLocaleString()} ({pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 rounded bg-slate-800 overflow-hidden">
                  <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}