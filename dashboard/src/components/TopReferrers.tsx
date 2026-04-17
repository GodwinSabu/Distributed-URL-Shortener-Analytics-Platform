"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

interface Props {
  data: Array<{ referrer: string; clicks: number }>;
}

export default function TopReferrers({ data }: Props) {
  // Truncate long referrer URLs for display
  const formatted = data.map((d) => ({
    ...d,
    label: d.referrer.length > 30
      ? d.referrer.substring(0, 30) + "…"
      : d.referrer,
  }));

  return (
    <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
      <h2 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">
        Top referrers
      </h2>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={formatted} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
          <XAxis type="number" tick={{ fill: "#64748b", fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            width={120}
          />
          <Tooltip
            contentStyle={{
              background:   "#0f172a",
              border:       "1px solid #1e293b",
              borderRadius: "8px",
              color:        "#f1f5f9",
            }}
            formatter={(val) => [`${val} clicks`, "Clicks"]}
          />
          <Bar dataKey="clicks" fill="#6366f1" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}