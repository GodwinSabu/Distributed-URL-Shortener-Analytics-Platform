"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const COLORS: Record<string, string> = {
  desktop: "#6366f1",
  mobile:  "#06b6d4",
  bot:     "#f59e0b",
};

interface Props {
  data: Array<{ device_type: string; clicks: number; percentage: number }>;
}

export default function DeviceBreakdown({ data }: Props) {
  return (
    <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
      <h2 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">
        Device breakdown
      </h2>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="clicks"
            nameKey="device_type"
            cx="50%"
            cy="50%"
            outerRadius={80}
            innerRadius={45}
            paddingAngle={3}
          >
            {data.map((entry) => (
              <Cell
                key={entry.device_type}
                fill={COLORS[entry.device_type] ?? "#94a3b8"}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background:   "#0f172a",
              border:       "1px solid #1e293b",
              borderRadius: "8px",
              color:        "#f1f5f9",
            }}
            formatter={(val, name) => [`${val} clicks`, name]}
          />
          <Legend
            formatter={(val) => (
              <span style={{ color: "#94a3b8", fontSize: 12 }}>{val}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}