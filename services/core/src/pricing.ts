/**
 * Pricing Engine — plan §7.4. Pure functions over a fare card; the only IO is reading
 * the card via the config cache. Quote tokens are HMAC-signed so POST /requests can
 * trust list_price without re-quoting. No map vendor in v1: haversine × road factor
 * (upgrade path: plan §7.2 ETA service).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Paise, VehicleClass } from "@chalo/protocol";
import { distanceKm, platformFee } from "@chalo/protocol";
import { getFareCard } from "./config.ts";
import type { LatLon, SqlRowClient } from "./types.ts";
import type { FareCardRow } from "./db/rows.ts";

const secretKey = process.env.JWT_SECRET ?? "dev-only-secret-rotate-in-prod";

export interface Quote {
  vehicleClass: VehicleClass;
  etaMin: number;
  distanceKm: number;
  listPrice: Paise;
  tripFare: Paise;
  platformFeePaise: Paise;
  softFloor: Paise;
}

/** # ponytail: straight-line haversine × 1.35 road factor replaces map APIs until beta */
const ROAD_FACTOR = 1.35;

export function estimateDistanceKm(a: LatLon, b: LatLon): number {
  return Math.max(0.5, distanceKm(a, b) * ROAD_FACTOR);
}

export function quoteFromCard(
  card: FareCardRow,
  km: number,
  surgeMultiplier = 1,
): { listPrice: Paise; tripFare: Paise; platformFeePaise: Paise } {
  const pct = Number(card.platform_fee_pct);
  const nightMult = Number(card.night_multiplier);
  const hour = new Date().getHours();
  const night = hour >= 23 || hour < 5 ? nightMult : 1;

  // ~12 min per trip segment assumption folded into time charge until ETA service exists
  const metered = Math.round(
    (card.base_paise + (km * card.per_km_paise) / 1 + (12 * card.per_min_paise) / 1) *
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
  const card = await getFareCard(sql, cityId, vehicleClass);
  const km = estimateDistanceKm(pickup, drop);
  return buildQuote(card, km, vehicleClass);
}

function buildQuote(card: FareCardRow, km: number, vehicleClass: VehicleClass): Quote {
  const { listPrice, tripFare, platformFeePaise } = quoteFromCard(card, km);
  return {
    vehicleClass,
    etaMin: Math.max(2, Math.round(km * 2.2)),
    distanceKm: Math.round(km * 10) / 10,
    listPrice,
    tripFare,
    platformFeePaise,
    softFloor: Math.round(listPrice * 0.6) as Paise,
  };
}

// ---- signed quote tokens ---------------------------------------------------

interface QuoteTokenPayload {
  c: number; // city id
  v: VehicleClass;
  lp: number; // list price paise
  tf: number; // trip fare paise
  pf: number; // platform fee paise
  km: number;
  exp: number; // epoch ms
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
  if (
    !(
      expected.length === sig.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    )
  ) {
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
