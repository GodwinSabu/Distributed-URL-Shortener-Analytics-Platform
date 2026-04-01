import type { GeoLocation } from "./geoip";

// ── Region definitions ────────────────────────────────────────────────────────
// Each region has a center lat/lon — we pick the nearest one to the user.
// In K8s (Phase 6), each region is a separate cluster with its own Ingress IP.
export interface Region {
  id:          string;
  name:        string;
  lat:         number;    // geographic center of the region
  lon:         number;
  endpoint:    string;    // URL of the regional server
  flag:        string;    // for display in dashboard
}

export const REGIONS: Region[] = [
  {
    id:       "us-east",
    name:     "US East (Virginia)",
    lat:      38.9072,
    lon:      -77.0369,
    endpoint: process.env.REGION_US_EAST ?? "http://localhost:3000",
    flag:     "🇺🇸",
  },
  {
    id:       "eu-west",
    name:     "EU West (Ireland)",
    lat:      53.3498,
    lon:      -6.2603,
    endpoint: process.env.REGION_EU_WEST ?? "http://localhost:3000",
    flag:     "🇮🇪",
  },
  {
    id:       "ap-south",
    name:     "Asia Pacific (Mumbai)",
    lat:      19.0760,
    lon:      72.8777,
    endpoint: process.env.REGION_AP_SOUTH ?? "http://localhost:3000",
    flag:     "🇮🇳",
  },
];

// Current region this server is deployed in — set via env var in K8s
export const CURRENT_REGION_ID = process.env.REGION_ID ?? "us-east";

export const CURRENT_REGION =
  REGIONS.find((r) => r.id === CURRENT_REGION_ID) ?? REGIONS[0];

// ── Haversine formula ─────────────────────────────────────────────────────────
// Calculates great-circle distance between two lat/lon points in km.
// This is how you measure "nearest" on a sphere — not Euclidean distance.
function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R    = 6371;                          // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ── Region selection ──────────────────────────────────────────────────────────
export interface RegionDecision {
  region:      Region;
  distanceKm:  number;
  isCurrent:   boolean;     // true if nearest region IS this server
  allRegions:  Array<{ region: Region; distanceKm: number }>;
}

/**
 * Given a user's lat/lon, find which region is nearest.
 * Returns full decision object for debugging and header generation.
 */
export function selectNearestRegion(lat: number, lon: number): RegionDecision {
  const ranked = REGIONS
    .map((region) => ({
      region,
      distanceKm: Math.round(haversineKm(lat, lon, region.lat, region.lon)),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const nearest = ranked[0];

  return {
    region:     nearest.region,
    distanceKm: nearest.distanceKm,
    isCurrent:  nearest.region.id === CURRENT_REGION_ID,
    allRegions: ranked,
  };
}

/**
 * For unknown geo (private IPs, failed lookups) — serve locally.
 */
export function getLocalRegionDecision(): RegionDecision {
  return {
    region:     CURRENT_REGION,
    distanceKm: 0,
    isCurrent:  true,
    allRegions: REGIONS.map((r) => ({ region: r, distanceKm: 0 })),
  };
}

// ── Country → Region mapping ──────────────────────────────────────────────────
// Fast path: skip haversine for known country codes.
// These cover ~80% of traffic without a distance calculation.
const COUNTRY_REGION_MAP: Record<string, string> = {
  // North America → us-east
  US: "us-east", CA: "us-east", MX: "us-east",
  // Europe → eu-west
  GB: "eu-west", DE: "eu-west", FR: "eu-west", IE: "eu-west",
  NL: "eu-west", ES: "eu-west", IT: "eu-west", SE: "eu-west",
  NO: "eu-west", DK: "eu-west", FI: "eu-west", PL: "eu-west",
  // Asia Pacific → ap-south
  IN: "ap-south", JP: "ap-south", SG: "ap-south", AU: "ap-south",
  KR: "ap-south", ID: "ap-south", MY: "ap-south", TH: "ap-south",
  PH: "ap-south", BD: "ap-south", PK: "ap-south", LK: "ap-south",
};

/**
 * Select region using country code first (fast),
 * falling back to haversine if country not in map.
 */
export function selectRegionForGeo(geo: GeoLocation): RegionDecision {
  // Private/unknown IPs stay local
  if (geo.isPrivate || geo.countryCode === "XX") {
    return getLocalRegionDecision();
  }

  // Try country map first (no math needed)
  const mappedRegionId = COUNTRY_REGION_MAP[geo.countryCode];
  if (mappedRegionId) {
    const region = REGIONS.find((r) => r.id === mappedRegionId) ?? REGIONS[0];
    return {
      region,
      distanceKm: 0,  // approximate — not calculated for mapped countries
      isCurrent:  region.id === CURRENT_REGION_ID,
      allRegions: REGIONS.map((r) => ({ region: r, distanceKm: 0 })),
    };
  }

  // Fall back to haversine for unmapped countries
  return selectNearestRegion(geo.lat, geo.lon);
}