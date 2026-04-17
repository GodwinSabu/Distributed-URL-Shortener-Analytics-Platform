"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { format, parseISO } from "date-fns";

interface Props {
  data: Array<{ minute: string; click_count: number; cache_hits: number }>;
}

export default function ClicksChart({ data }: Props) {
  const formatted = data.map((d) => ({
    ...d,
    time: format(parseISO(d.minute.replace(" ", "T")), "HH:mm"),
  }));

  return (
    <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
      <h2 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">
        Clicks over time
      </h2>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="time"
            tick={{ fill: "#64748b", fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: "#0f172a",
              border:     "1px solid #1e293b",
              borderRadius: "8px",
              color:      "#f1f5f9",
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="click_count"
            name="Total clicks"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="cache_hits"
            name="Cache hits"
            stroke="#06b6d4"
            strokeWidth={2}
            dot={false}
            strokeDasharray="4 2"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}