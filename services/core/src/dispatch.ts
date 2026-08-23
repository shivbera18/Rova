/**
 * Dispatch & WS fanout — plan §7.3. v1 single-node: live driver presence in a
 * Record + haversine ring search; offers pushed over the driver's WebSocket.
 * The plan's Redis GEO + Lua atomic-claim becomes an in-process claim map with
 * identical semantics (first claim wins, losers silently ignored).
 */
import type { DriverOfferPayload, DriverWsMessage, Paise } from "@chalo/protocol";
import { distanceKm } from "@chalo/protocol";
import { publish } from "./bus.ts";
import type { LatLon } from "./types.ts";

export interface LiveDriver {
  driverId: string;
  vehicleClass: string;
  pos: LatLon;
  online: boolean;
  onTrip: boolean;
  name: string;
  plate: string;
  rating: number;
  /** send a payload to this driver's open socket; false when offline */
  push(msg: DriverWsMessage): boolean;
}

const liveDrivers: Record<string, LiveDriver> = {};
/** requestId → claimed driverId — atomic within the event loop */
const claims: Record<string, string> = {};

export function registerDriver(d: LiveDriver): void {
  liveDrivers[d.driverId] = d;
}

export function unregisterDriver(driverId: string): void {
  delete liveDrivers[driverId];
}

export function getLiveDriver(driverId: string): LiveDriver | null {
  return liveDrivers[driverId] ?? null;
}

export function setDriverPos(driverId: string, pos: LatLon): void {
  const d = liveDrivers[driverId];
  if (d) d.pos = pos;
}

export function setDriverVehicleClass(driverId: string, vehicleClass: string): void {
  const d = liveDrivers[driverId];
  if (d) d.vehicleClass = vehicleClass;
}

export function claimRequest(requestId: string, driverId: string): boolean {
  if (claims[requestId]) return false;
  claims[requestId] = driverId;
  return true;
}

export function claimedDriver(requestId: string): string | null {
  return claims[requestId] ?? null;
}

export function releaseClaim(requestId: string): void {
  delete claims[requestId];
}

export interface BroadcastOffer {
  requestId: string;
  negotiationId?: string;
  takeHomePaise: Paise;
  paymentMethod: string;
  /** only push to drivers of this class (or ALL in dev mode) */
  vehicleClass: string;
  pickup: LatLon;
  drop: LatLon;
  tripKm: number;
  expiresAt: string;
  round: number;
  isCounter: boolean;
  riderName: string;
  riderRating: number;
}

/**
 * Ring broadcast per §7.3: inner ring first (~1.5 km), widening to ~15 km for local testing.
 * Returns how many drivers received it.
 */
export async function broadcastOffer(offer: BroadcastOffer): Promise<number> {
  let delivered = 0;
  for (const d of Object.values(liveDrivers)) {
    if (d.vehicleClass !== "ALL" && d.vehicleClass !== offer.vehicleClass) continue;
    if (!d.online || d.onTrip) continue;
    const km = distanceKm(d.pos, offer.pickup);
    if (km > 15) continue; // 15 km search radius for city-wide matching

    const payload: DriverOfferPayload = {
      requestId: offer.requestId,
      negotiationId: offer.negotiationId,
      takeHomePaise: offer.takeHomePaise,
      pickupKm: Math.round(km * 10) / 10,
      tripKm: offer.tripKm,
      expiresAt: offer.expiresAt,
      round: offer.round,
      isCounter: offer.isCounter,
      riderName: offer.riderName,
      riderRating: offer.riderRating,
      pickup: offer.pickup,
      drop: offer.drop,
      paymentMethod: offer.paymentMethod as DriverOfferPayload["paymentMethod"],
    };
    if (d.push({ t: "dispatch.offer", offer: payload })) delivered++;
  }
  return delivered;
}

export async function cancelBroadcast(requestId: string): Promise<void> {
  for (const d of Object.values(liveDrivers)) {
    d.push({ t: "dispatch.cancel", requestId });
  }
  await publish("dispatch.cancelled", { requestId });
}
