/**
 * Pricing Engine — fare-card computation plus signed quote tokens.
 * Road distance and duration come from free OSRM routing with a deterministic fallback.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Paise, VehicleClass } from "@chalo/protocol";
import { distanceKm, platformFee } from "@chalo/protocol";
import { getFareCard } from "./config.ts";
import { getRoadRoute, type RoadRoute } from "./routing.ts";
import type { LatLon, SqlRowClient } from "./types.ts";
import type { FareCardRow } from "./db/rows.ts";

const secretKey = process.env.JWT_SECRET ?? "dev-only-secret-rotate-in-prod";

export interface Quote {
  vehicleClass: VehicleClass;
  etaMin: number;
  freeFlowEtaMin: number;
  trafficLevel: RoadRoute["trafficLevel"];
  routeSource: RoadRoute["source"];
  distanceKm: number;
  listPrice: Paise;
  tripFare: Paise;
  platformFeePaise: Paise;
  softFloor: Paise;
}

/** Fast synchronous approximation retained for dispatch-card distance display. */
export function estimateDistanceKm(a: LatLon, b: LatLon): number {
  return Math.max(0.5, distanceKm(a, b) * 1.35);
}

export function quoteFromCard(
  card: FareCardRow,
  km: number,
  surgeMultiplier = 1,
  durationMin = 12,
): { listPrice: Paise; tripFare: Paise; platformFeePaise: Paise } {
  const pct = Number(card.platform_fee_pct);
  const nightMult = Number(card.night_multiplier);
  const hour = new Date().getHours();
  const night = hour >= 23 || hour < 5 ? nightMult : 1;
  const metered = Math.round(
    (card.base_paise + km * card.per_km_paise + durationMin * card.per_min_paise) *
      surgeMultiplier *
      night,
  );
  const tripFare = Math.max(card.min_fare_paise, metered) as Paise;
  const platformFeePaise = platformFee(
    tripFare,
    pct,
    card.platform_fee_min_paise as Paise,
    card.platform_fee_cap_paise as Paise,
  );
  return { listPrice: (tripFare + platformFeePaise) as Paise, tripFare, platformFeePaise };
}

export async function quoteTrip(
  sql: SqlRowClient,
  cityId: number,
  vehicleClass: VehicleClass,
  pickup: LatLon,
  drop: LatLon,
): Promise<Quote> {
  const [card, route] = await Promise.all([
    getFareCard(sql, cityId, vehicleClass),
    getRoadRoute(pickup, drop),
  ]);
  const { listPrice, tripFare, platformFeePaise } = quoteFromCard(
    card,
    route.distanceKm,
    1,
    route.durationMin,
  );
  return {
    vehicleClass,
    etaMin: route.durationMin,
    freeFlowEtaMin: route.freeFlowDurationMin,
    trafficLevel: route.trafficLevel,
    routeSource: route.source,
    distanceKm: route.distanceKm,
    listPrice,
    tripFare,
    platformFeePaise,
    softFloor: Math.round(listPrice * 0.6) as Paise,
  };
}

// ---- signed quote tokens ---------------------------------------------------

interface QuoteTokenPayload {
  c: number;
  v: VehicleClass;
  lp: number;
  tf: number;
  pf: number;
  km: number;
  exp: number;
}

function sign(body: string): string {
  return createHmac("sha256", secretKey).update(body).digest("base64url");
}

export function issueQuoteToken(q: Quote, cityId: number, ttlS = 300): string {
  const payload: QuoteTokenPayload = {
    c: cityId,
    v: q.vehicleClass,
    lp: q.listPrice,
    tf: q.tripFare,
    pf: q.platformFeePaise,
    km: q.distanceKm,
    exp: Date.now() + ttlS * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyQuoteToken(token: string): QuoteTokenPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  if (!(expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig)))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as QuoteTokenPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
