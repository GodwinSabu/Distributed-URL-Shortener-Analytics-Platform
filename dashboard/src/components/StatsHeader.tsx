interface Props {
    shortCode:   string;
    totalClicks: number;
    windowHours: number;
    shortUrl:    string;
  }
  
  export default function StatsHeader({
    shortCode, totalClicks, windowHours, shortUrl,
  }: Props) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-white">
            /{shortCode}
          </h1>
          <a
            href={shortUrl}
            target="_blank"
            className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            {shortUrl} ↗
          </a>
        </div>
  
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          {[
            { label: "Total clicks",  value: totalClicks.toLocaleString() },
            { label: "Window",        value: `${windowHours}h`            },
            { label: "Short code",    value: `/${shortCode}`              },
            { label: "Status",        value: "Active"                     },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4"
            >
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                {label}
              </p>
              <p className="text-xl font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }