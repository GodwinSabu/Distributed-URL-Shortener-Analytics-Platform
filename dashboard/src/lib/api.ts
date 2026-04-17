const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export interface ShortLink {
  id:           number;
  short_code:   string;
  original_url: string;
  is_active:    boolean;
  click_count:  number;
  created_at:   string;
  expires_at:   string | null;
}

export interface AnalyticsData {
  shortCode: string;
  summary: {
    totalClicks: number;
    windowHours: number;
  };
  clicksOverTime: Array<{
    minute:      string;
    click_count: number;
    cache_hits:  number;
  }>;
  topReferrers: Array<{
    referrer: string;
    clicks:   number;
  }>;
  deviceBreakdown: Array<{
    device_type: string;
    clicks:      number;
    percentage:  number;
  }>;
}

export interface ClickPoint {
  lat:         number;
  lon:         number;
  country:     string;
  city:        string;
  clicked_at:  string;
  short_code:  string;
}

export async function fetchLinks(): Promise<ShortLink[]> {
  const res = await fetch(`${API}/api/links?limit=50`);
  const data = await res.json();
  return data.links ?? [];
}

export async function fetchAnalytics(
  code: string,
  hours = 24
): Promise<AnalyticsData> {
  const res = await fetch(`${API}/api/analytics/${code}?hours=${hours}`);
  return res.json();
}

export async function fetchClickPoints(code: string): Promise<ClickPoint[]> {
  const res = await fetch(`/api/analytics/${code}/geo`);
  return res.json();
}

export async function createLink(
  url: string,
  customCode?: string
): Promise<{ shortCode: string; shortUrl: string }> {
  const res = await fetch(`${API}/shorten`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ url, customCode }),
  });
  return res.json();
}