/**
 * Free road routing via the public OSRM API with deterministic Haversine fallback.
 * OSRM does not provide live traffic; traffic ETA uses a transparent Bengaluru
 * time-of-day multiplier until a live-traffic provider is configured.
 */
import { distanceKm } from "@chalo/protocol";
import type { LatLon } from "./types.ts";
import { logger } from "./logger.ts";

export interface RoadRoute {
  distanceKm: number;
  durationMin: number;
  freeFlowDurationMin: number;
  trafficLevel: "LOW" | "MODERATE" | "HEAVY";
  source: "OSRM" | "HAVERSINE_FALLBACK";
}

const cache = new Map<string, { route: RoadRoute; expiresAt: number }>();

export async function getRoadRoute(pickup: LatLon, drop: LatLon): Promise<RoadRoute> {
  const key = `${pickup.lat.toFixed(4)},${pickup.lng.toFixed(4)}:${drop.lat.toFixed(4)},${drop.lng.toFixed(4)}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.route;

  let distance = Math.max(0.5, distanceKm(pickup, drop) * 1.35);
  let freeFlowMin = Math.max(2, distance * 2.2);
  let source: RoadRoute["source"] = "HAVERSINE_FALLBACK";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${pickup.lng},${pickup.lat};${drop.lng},${drop.lat}` +
      `?overview=false&steps=false&alternatives=false`;
    const response = await fetch(url, { signal: controller.signal });
    if (response.ok) {
      const data = (await response.json()) as {
        code?: string;
        routes?: Array<{ distance: number; duration: number }>;
      };
      const best = data.routes?.[0];
      if (data.code === "Ok" && best && best.distance > 0 && best.duration > 0) {
        distance = best.distance / 1000;
        freeFlowMin = best.duration / 60;
        source = "OSRM";
      }
    }
  } catch (err) {
    logger.warn("ROUTING", "OSRM unavailable; using Haversine fallback", err);
  } finally {
    clearTimeout(timeout);
  }

  const { multiplier, level } = trafficAdjustment(new Date());
  const route: RoadRoute = {
    distanceKm: Math.round(distance * 10) / 10,
    freeFlowDurationMin: Math.max(1, Math.round(freeFlowMin)),
    durationMin: Math.max(1, Math.round(freeFlowMin * multiplier)),
    trafficLevel: level,
    source,
  };
  cache.set(key, { route, expiresAt: Date.now() + 60_000 });
  return route;
}

function trafficAdjustment(now: Date): {
  multiplier: number;
  level: RoadRoute["trafficLevel"];
} {
  // Convert UTC/local server time into India Standard Time.
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const hour = ist.getHours();
  const day = ist.getDay();
  const weekday = day >= 1 && day <= 5;

  if (weekday && ((hour >= 8 && hour < 11) || (hour >= 17 && hour < 21))) {
    return { multiplier: 1.55, level: "HEAVY" };
  }
  if ((hour >= 7 && hour < 12) || (hour >= 16 && hour < 22)) {
    return { multiplier: 1.25, level: "MODERATE" };
  }
  return { multiplier: 1.05, level: "LOW" };
}

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) if (entry.expiresAt <= now) cache.delete(key);
}, 60_000);
cleanup.unref();
