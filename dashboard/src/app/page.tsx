import Link           from "next/link";
import CreateLinkForm from "@/components/CreateLinkForm";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

async function getLinks() {
  try {
    const res = await fetch(`${API}/api/links?limit=50`, {
      next: { revalidate: 5 },
    });
    const data = await res.json();
    return data.links ?? [];
  } catch {
    return [];
  }
}

interface Link_ {
  id:           number;
  short_code:   string;
  original_url: string;
  is_active:    boolean;
  click_count:  number;
  created_at:   string;
}

function CopyButton({ text }: { text: string }) {
  // Client component for copy interaction
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text)}
      className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-2
                 py-1 rounded hover:bg-slate-700"
    >
      Copy
    </button>
  );
}

export default async function HomePage() {
  const links: Link_[] = await getLinks();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">
          Your short links
        </h1>
        <p className="text-slate-400 text-sm">
          Distributed across 3 regions · Real-time analytics
        </p>
      </div>

      <CreateLinkForm />

      {links.length === 0 ? (
        <div className="text-center py-20 text-slate-600">
          No links yet — create your first one above
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <div
              key={link.id}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4
                         flex items-center gap-4 hover:border-slate-700 transition-colors"
            >
              {/* Short code badge */}
              <div className="shrink-0 font-mono text-indigo-400 font-medium
                              bg-indigo-950 px-3 py-1.5 rounded-lg text-sm">
                /{link.short_code}
              </div>

              {/* URL */}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm truncate">{link.original_url}</p>
                <p className="text-slate-500 text-xs mt-0.5">
                  {new Date(link.created_at).toLocaleDateString()}
                </p>
              </div>

              {/* Click count */}
              <div className="shrink-0 text-center">
                <p className="text-white font-semibold">
                  {link.click_count.toLocaleString()}
                </p>
                <p className="text-slate-500 text-xs">clicks</p>
              </div>

              {/* Actions */}
              <div className="shrink-0 flex gap-2">
                <a
                  href={`${API}/${link.short_code}`}
                  target="_blank"
                  className="text-xs text-slate-500 hover:text-slate-300
                             transition-colors px-2 py-1 rounded hover:bg-slate-700"
                >
                  Visit ↗
                </a>
                <Link
                  href={`/dashboard/${link.short_code}`}
                  className="text-xs text-indigo-400 hover:text-indigo-300
                             transition-colors px-2 py-1 rounded hover:bg-indigo-950"
                >
                  Analytics →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}