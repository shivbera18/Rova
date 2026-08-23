/**
 * Dispatch & WS fanout — plan §7.3. v1 single-node: live driver presence in a
 * Record + haversine ring search; offers pushed over the driver's WebSocket.
 * The plan's Redis GEO + Lua atomic-claim becomes an in-process claim map with
 * identical semantics (first claim wins, losers silently ignored).
 */
import type { DriverOfferPayload, DriverWsMessage, Paise } from "@chalo/protocol";
import { distanceKm } from "@chalo/protocol";
import { publish } from "./bus.ts";
import { logger } from "./logger.ts";
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
  logger.dispatch(`Driver registered: id=${d.driverId.slice(0, 8)} class=${d.vehicleClass} pos=(${d.pos.lat.toFixed(4)},${d.pos.lng.toFixed(4)}) online=${d.online}`);
}

export function unregisterDriver(driverId: string): void {
  if (liveDrivers[driverId]) {
    delete liveDrivers[driverId];
    logger.dispatch(`Driver unregistered: id=${driverId.slice(0, 8)}`);
  }
}

export function getLiveDriver(driverId: string): LiveDriver | null {
  return liveDrivers[driverId] ?? null;
}

export function setDriverPos(driverId: string, pos: LatLon): void {
  const d = liveDrivers[driverId];
  if (d) {
    d.pos = pos;
    logger.dispatch(`Driver position updated: id=${driverId.slice(0, 8)} pos=(${pos.lat.toFixed(4)},${pos.lng.toFixed(4)})`);
  }
}


export function claimRequest(requestId: string, driverId: string): boolean {
  if (claims[requestId]) return false;
  claims[requestId] = driverId;
  logger.dispatch(`Request claimed: req=${requestId.slice(0, 8)} driver=${driverId.slice(0, 8)}`);
  return true;
}

export function claimedDriver(requestId: string): string | null {
  return claims[requestId] ?? null;
}

export function releaseClaim(requestId: string): void {
  delete claims[requestId];
  logger.dispatch(`Claim released: req=${requestId.slice(0, 8)}`);
}

export interface BroadcastOffer {
  requestId: string;
  negotiationId?: string;
  takeHomePaise: Paise;
  paymentMethod: string;
  /** only push to drivers of this class (or ALL in dev mode) */
  vehicleClass: string;
  /** optional side channel (Web Push) after socket delivery */
  notify?: (driverId: string) => void;
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
 * Ring broadcast per §7.3: inner ring first (~1.5 km), widening to ~20 km for local testing.
 * Returns how many drivers received it.
 */
export async function broadcastOffer(offer: BroadcastOffer): Promise<number> {
  let delivered = 0;
  const allDrivers = Object.values(liveDrivers);
  logger.dispatch(
    `Broadcasting offer: req=${offer.requestId.slice(0, 8)} class=${offer.vehicleClass} pay=₹${(offer.takeHomePaise / 100).toFixed(0)} pickup=(${offer.pickup.lat.toFixed(4)},${offer.pickup.lng.toFixed(4)}) | Total live drivers: ${allDrivers.length}`,
  );

  for (const d of allDrivers) {
    if (d.vehicleClass !== offer.vehicleClass) {
      logger.dispatch(
        `  -> Driver ${d.driverId.slice(0, 8)} (${d.name}) SKIPPED: vehicle class mismatch (driver=${d.vehicleClass}, requested=${offer.vehicleClass})`,
      );
      continue;
    }
    if (!d.online) {
      logger.dispatch(`  -> Driver ${d.driverId.slice(0, 8)} (${d.name}) SKIPPED: driver is OFFLINE`);
      continue;
    }
    if (d.onTrip) {
      logger.dispatch(`  -> Driver ${d.driverId.slice(0, 8)} (${d.name}) SKIPPED: driver is busy on a trip`);
      continue;
    }
    const km = distanceKm(d.pos, offer.pickup);
    if (km > 20) {
      logger.dispatch(`  -> Driver ${d.driverId.slice(0, 8)} (${d.name}) SKIPPED: too far (${km.toFixed(1)} km > 20 km)`);
      continue;
    }

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
    const sent = d.push({ t: "dispatch.offer", offer: payload });
    if (sent) {
      delivered++;
      offer.notify?.(d.driverId);
      logger.dispatch(`  -> Driver ${d.driverId.slice(0, 8)} (${d.name}, ${d.vehicleClass}) DELIVERED (dist=${km.toFixed(1)} km)`);
    } else {
      logger.dispatch(`  -> Driver ${d.driverId.slice(0, 8)} (${d.name}) FAILED: socket not ready`);
    }
  }

  logger.dispatch(`Broadcast summary: req=${offer.requestId.slice(0, 8)} delivered to ${delivered} driver(s)`);
  return delivered;
}

export async function cancelBroadcast(requestId: string): Promise<void> {
  for (const d of Object.values(liveDrivers)) {
    d.push({ t: "dispatch.cancel", requestId });
  }
  logger.dispatch(`Broadcast cancelled: req=${requestId.slice(0, 8)}`);
  await publish("dispatch.cancelled", { requestId });
}
