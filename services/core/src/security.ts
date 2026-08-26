/** Single-node rate limiting and fraud controls. Move state to Redis before horizontal scale. */
import type { LatLon, SqlRowClient } from "./types.ts";

export class SecurityError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
  }
}

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();
const lastGps = new Map<string, { pos: LatLon; at: number }>();

export function enforceRateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count++;
  if (current.count > max) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    throw new SecurityError(429, "RATE_LIMITED", `Too many requests. Retry in ${retryAfter}s`);
  }
}

export async function validateRideRequest(
  sql: SqlRowClient,
  riderId: string,
  body: { offerPaise?: number; platformFeePaise?: number; paymentMethod?: string; pickup: LatLon; drop: LatLon },
): Promise<void> {
  enforceRateLimit(`ride:${riderId}`, 12, 60_000);
  if (body.offerPaise !== undefined && body.offerPaise > 10_000_000) {
    throw new SecurityError(400, "OFFER_TOO_HIGH", "Driver offer exceeds ₹1,00,000 fraud limit");
  }
  if (body.platformFeePaise !== undefined && body.platformFeePaise > 1_000_000) {
    throw new SecurityError(400, "PLATFORM_FEE_TOO_HIGH", "Platform contribution exceeds ₹10,000 fraud limit");
  }
  validateCoordinates(body.pickup, "pickup");
  validateCoordinates(body.drop, "drop");

  // Cash rides bill the rider-side platform fee to user:<id>:POSTPAID with no
  // digital collection rail yet. SOFT cap of ₹200 outstanding debt: checked
  // outside any lock, so concurrent CASH bookings can briefly exceed it —
  // acceptable for an advisory guard until the collection rail exists.
  if (body.paymentMethod === "CASH") {
    const postpaid = await sql.query<{ net: string }>(
      `SELECT COALESCE(SUM(CASE WHEN credit_account=$1 THEN amount_paise ELSE 0 END),0)
         - COALESCE(SUM(CASE WHEN debit_account=$1 THEN amount_paise ELSE 0 END),0) AS net
       FROM journal_entries`,
      [`user:${riderId}:POSTPAID`],
    );
    const owed = -Number(postpaid.rows[0]?.net ?? 0);
    if (owed >= 20_000) {
      throw new SecurityError(
        402,
        "POSTPAID_LIMIT",
        `₹${(owed / 100).toFixed(2)} in cash-ride fees is pending — pay a digital ride first`,
      );
    }
  }

  const active = await sql.query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM ride_requests
     WHERE rider_id=$1 AND state IN ('MATCHING','NEGOTIATING')
       AND created_at > now() - interval '3 minutes'`,
    [riderId],
  );
  if (Number(active.rows[0]?.n ?? 0) >= 2) {
    throw new SecurityError(409, "TOO_MANY_ACTIVE_RIDES", "Cancel an existing request before booking another");
  }
}

export function validateDriverGps(driverId: string, next: LatLon): void {
  validateCoordinates(next, "driver position");
  const now = Date.now();
  const previous = lastGps.get(driverId);
  if (previous) {
    const elapsedHours = Math.max((now - previous.at) / 3_600_000, 1 / 3600);
    const distance = haversineKm(previous.pos, next);
    if (now - previous.at < 30_000 && distance > 2 && distance / elapsedHours > 300) {
      throw new SecurityError(400, "GPS_TELEPORT", "Implausible location jump rejected");
    }
  }
  lastGps.set(driverId, { pos: next, at: now });
}

function validateCoordinates(pos: LatLon, name: string): void {
  if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lng) || pos.lat < -90 || pos.lat > 90 || pos.lng < -180 || pos.lng > 180) {
    throw new SecurityError(400, "INVALID_COORDINATES", `Invalid ${name} coordinates`);
  }
}

function haversineKm(a: LatLon, b: LatLon): number {
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, 60_000);
cleanup.unref();
