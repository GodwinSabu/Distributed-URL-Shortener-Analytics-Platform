"use client";

import { useEffect, useState, useRef } from "react";

interface Props { code: string; }

export default function RealtimeCounter({ code }: Props) {
  const [cpm,      setCpm]      = useState<number>(0);
  const [history,  setHistory]  = useState<number[]>(Array(20).fill(0));
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    function connect() {
      const es = new EventSource(`/api/realtime/${code}`);
      esRef.current = es;

      es.onopen = () => setConnected(true);

      es.onmessage = (e) => {
        const data = JSON.parse(e.data) as { clicksPerMinute: number };
        setCpm(data.clicksPerMinute);
        setHistory((prev) => [...prev.slice(1), data.clicksPerMinute]);
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        // Auto-reconnect after 3s
        setTimeout(connect, 3000);
      };
    }

    connect();
    return () => esRef.current?.close();
  }, [code]);

  // Sparkline: normalize history to 0–100% for SVG bars
  const maxVal  = Math.max(...history, 1);
  const barW    = 6;
  const barGap  = 2;
  const sparkH  = 40;
  const sparkW  = history.length * (barW + barGap);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 min-w-[180px]">
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`w-2 h-2 rounded-full ${
            connected ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
          }`}
        />
        <span className="text-xs text-slate-500 uppercase tracking-wider">
          Live
        </span>
      </div>

      <div className="text-3xl font-bold text-white tabular-nums">
        {cpm}
      </div>
      <div className="text-xs text-slate-500 mb-3">clicks / min</div>

      {/* Sparkline */}
      <svg width={sparkW} height={sparkH} className="overflow-visible">
        {history.map((val, i) => {
          const barH = Math.max(2, (val / maxVal) * sparkH);
          return (
            <rect
              key={i}
              x={i * (barW + barGap)}
              y={sparkH - barH}
              width={barW}
              height={barH}
              rx={2}
              fill={i === history.length - 1 ? "#6366f1" : "#1e3a5f"}
            />
          );
        })}
      </svg>
    </div>
  );
}