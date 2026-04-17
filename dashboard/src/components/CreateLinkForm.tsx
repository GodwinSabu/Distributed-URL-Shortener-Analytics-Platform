"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateLinkForm() {
  const [url,        setUrl]        = useState("");
  const [customCode, setCustomCode] = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit() {
    if (!url) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/links", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          url,
          ...(customCode ? { customCode } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create link");
        return;
      }

      setUrl("");
      setCustomCode("");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8">
      <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
        Create short link
      </h2>

      <div className="flex gap-3 flex-wrap">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-long-url.com/..."
          className="flex-1 min-w-[260px] bg-slate-800 border border-slate-700
                     rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500
                     focus:outline-none focus:border-indigo-500 transition-colors"
        />
        <input
          type="text"
          value={customCode}
          onChange={(e) => setCustomCode(e.target.value)}
          placeholder="custom-code (optional)"
          className="w-48 bg-slate-800 border border-slate-700 rounded-lg px-4
                     py-2.5 text-sm text-white placeholder-slate-500
                     focus:outline-none focus:border-indigo-500 transition-colors"
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !url}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50
                     disabled:cursor-not-allowed text-white text-sm font-medium
                     rounded-lg transition-colors"
        >
          {loading ? "Creating…" : "Shorten ↗"}
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm mt-3">{error}</p>
      )}
    </div>
  );
}