// ── Types ─────────────────────────────────────────────────────────────────────
export interface GeoLocation {
    ip:          string;
    country:     string;       // "India"
    countryCode: string;       // "IN"
    region:      string;       // "Kerala"
    city:        string;       // "Thrissur"
    lat:         number;
    lon:         number;
    isp:         string;
    isPrivate:   boolean;      // true for 127.x, 192.168.x, 10.x etc.
  }
  
  // Returned when geo lookup fails — safe fallback
  const UNKNOWN_GEO: GeoLocation = {
    ip:          "unknown",
    country:     "Unknown",
    countryCode: "XX",
    region:      "Unknown",
    city:        "Unknown",
    lat:         0,
    lon:         0,
    isp:         "Unknown",
    isPrivate:   false,
  };
  
  // ── Private IP detection ──────────────────────────────────────────────────────
  // These ranges are RFC1918 private / loopback — never route to external API
  const PRIVATE_RANGES = [
    /^127\./,                          // loopback
    /^10\./,                           // Class A private
    /^192\.168\./,                     // Class C private
    /^172\.(1[6-9]|2\d|3[01])\./,     // Class B private
    /^::1$/,                           // IPv6 loopback
    /^fc00:/,                          // IPv6 unique local
    /^unknown$/i,
  ];
  
  export function isPrivateIP(ip: string): boolean {
    return PRIVATE_RANGES.some((pattern) => pattern.test(ip));
  }
  
  // ── Simple LRU Cache (no external library) ────────────────────────────────────
  // Caches geo results per IP — avoids hammering ip-api.com for repeated hits
  class LRUCache<K, V> {
    private map  = new Map<K, V>();
    private readonly max: number;
  
    constructor(maxSize: number) { this.max = maxSize; }
  
    get(key: K): V | undefined {
      if (!this.map.has(key)) return undefined;
      // Move to end (most recently used)
      const val = this.map.get(key)!;
      this.map.delete(key);
      this.map.set(key, val);
      return val;
    }
  
    set(key: K, val: V): void {
      if (this.map.has(key)) this.map.delete(key);
      else if (this.map.size >= this.max) {
        // Evict least recently used (first entry)
        const first = this.map.keys().next();
        if (!first.done) this.map.delete(first.value);
      }
      this.map.set(key, val);
    }
  
    get size(): number { return this.map.size; }
  }
  
  // Store up to 10,000 unique IPs in memory
  const geoCache = new LRUCache<string, GeoLocation>(10_000);
  
  // ── Geo lookup ────────────────────────────────────────────────────────────────
  const GEO_API_TIMEOUT_MS = 3000;   // Never block a redirect for more than 3s
  
  /**
   * Look up geolocation for an IP address.
   * - Private IPs return immediately with isPrivate: true
   * - Results are cached in LRU — same IP never hits the API twice
   * - On timeout or failure, returns UNKNOWN_GEO (never throws)
   */
  export async function geolocate(ip: string): Promise<GeoLocation> {
    // Return private IPs immediately — no external call
    if (isPrivateIP(ip)) {
      return {
        ...UNKNOWN_GEO,
        ip,
        country:     "Local",
        countryCode: "LO",
        isPrivate:   true,
      };
    }
  
    // Check cache first
    const cached = geoCache.get(ip);
    if (cached) return cached;
  
    // Hit the free ip-api.com endpoint
    // Fields param reduces response size — only fetch what we need
    const url = `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,lat,lon,isp`;
  
    try {
      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), GEO_API_TIMEOUT_MS);
  
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
  
      if (!response.ok) throw new Error(`ip-api HTTP ${response.status}`);
  
      const data = await response.json() as {
        status:      string;
        country:     string;
        countryCode: string;
        regionName:  string;
        city:        string;
        lat:         number;
        lon:         number;
        isp:         string;
      };
  
      if (data.status !== "success") throw new Error("ip-api returned failure");
  
      const result: GeoLocation = {
        ip,
        country:     data.country,
        countryCode: data.countryCode,
        region:      data.regionName,
        city:        data.city,
        lat:         data.lat,
        lon:         data.lon,
        isp:         data.isp,
        isPrivate:   false,
      };
  
      // Cache for next time
      geoCache.set(ip, result);
      return result;
  
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        console.warn(`Geo lookup timed out for ${ip}`);
      } else {
        console.warn(`Geo lookup failed for ${ip}:`, (err as Error).message);
      }
      // Return safe fallback — never throw, never block the redirect
      return { ...UNKNOWN_GEO, ip };
    }
  }
  
  /** Stats for /debug/geo endpoint */
  export function getGeoCacheStats() {
    return { cachedIPs: geoCache.size, maxSize: 10_000 };
  }