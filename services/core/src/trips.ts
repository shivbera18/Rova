/**
 * Trip lifecycle — plan §7.6. Legal transitions from @chalo/protocol; every mutation
 * is an optimistic-lock UPDATE + event publish. OTP: 6-digit, hashed at rest (sha256
 * with per-trip salt = trip id), delivered only to rider + assigned driver.
 */
import { createHash, randomInt, randomUUID } from "node:crypto";
import type { Paise, TripState } from "@chalo/protocol";
import { LEGAL_TRIP_TRANSITIONS } from "@chalo/protocol";
import { publish, TOPICS } from "./bus.ts";
import { postTransaction, settlementLines } from "./ledger.ts";
import { releaseClaim } from "./dispatch.ts";
import type { SqlRowClient } from "./types.ts";
import type { TripRow } from "./db/rows.ts";

export interface TripFare {
  mode: "LIST" | "NEGOTIATED";
  agreedPaise: number;
  platformFeePaise: number;
  riderTotalPaise: number;
  listPricePaise: number;
  discountVsListPct: number;
  tollPaise: number;
  tipPaise?: number;
  negotiationId?: string | null;
}

/** PGlite hands jsonb back pre-parsed; pg returns text. Accept both. */
export function readFareJson(raw: unknown): TripFare {
  if (typeof raw === "string") return JSON.parse(raw) as TripFare;
  return raw as TripFare;
}

export class TripError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function hashOtp(tripId: string, otp: string): string {
  return createHash("sha256").update(`${tripId}:${otp}`).digest("hex");
}

export async function createTripFromAgreement(
  sql: SqlRowClient,
  params: {
    requestId: string;
    riderId: string;
    driverId: string;
    cityId: number;
    vehicleClass: string;
    pickupLat: number;
    pickupLng: number;
    dropLat: number;
    dropLng: number;
    agreedPaise: Paise;
    platformFeePaise: Paise;
    listPricePaise: Paise;
    mode: "LIST" | "NEGOTIATED";
    paymentMethod: "WALLET" | "UPI" | "CASH";
    negotiationId?: string;
  },
): Promise<{ trip: TripRow; otp: string }> {
  const id = randomUUID();
  const otp = String(randomInt(100000, 999999));
  const discountPct =
    params.listPricePaise > 0
      ? Math.round(((params.listPricePaise - params.agreedPaise) / params.listPricePaise) * 1000) / 10
      : 0;
  const fare: TripFare = {
    mode: params.mode,
    agreedPaise: params.agreedPaise,
    platformFeePaise: params.platformFeePaise,
    riderTotalPaise: (params.agreedPaise + params.platformFeePaise) as Paise,
    listPricePaise: params.listPricePaise,
    discountVsListPct: discountPct,
    tollPaise: 0,
    tipPaise: 0,
    negotiationId: params.negotiationId ?? null,
  };

  await sql.query(
    `INSERT INTO trips
       (id, request_id, rider_id, driver_id, city_id, vehicle_class, state,
        pickup_lat, pickup_lng, drop_lat, drop_lng, otp_hash, fare_json)
     VALUES ($1,$2,$3,$4,$5,$6,'DRIVER_ASSIGNED',$7,$8,$9,$10,$11,$12)`,
    [
      id,
      params.requestId,
      params.riderId,
      params.driverId,
      params.cityId,
      params.vehicleClass,
      params.pickupLat,
      params.pickupLng,
      params.dropLat,
      params.dropLng,
      hashOtp(id, otp),
      JSON.stringify(fare),
    ],
  );
  await sql.query("UPDATE ride_requests SET state='AGREED', version=version+1 WHERE id=$1", [params.requestId]);
  await sql.query(
    "INSERT INTO otp_codes (trip_id, code_hash, expires_at) VALUES ($1,$2,$3)",
    [id, hashOtp(id, otp), new Date(Date.now() + 6 * 3600_000)],
  );
  releaseClaim(params.requestId);

  const trip = (await getTrip(sql, id))!;
  await publish(TOPICS.tripStateChanged, { tripId: id, state: "DRIVER_ASSIGNED" });
  return { trip, otp };
}

export async function getTrip(sql: SqlRowClient, tripId: string): Promise<TripRow | null> {
  const r = await sql.query<TripRow>("SELECT * FROM trips WHERE id = $1", [tripId]);
  return r.rows[0] ?? null;
}

export async function transitionTrip(
  sql: SqlRowClient,
  tripId: string,
  to: TripState,
): Promise<TripRow> {
  const trip = await getTrip(sql, tripId);
  if (!trip) throw new TripError("NOT_FOUND", "trip does not exist");
  if (!LEGAL_TRIP_TRANSITIONS[trip.state as TripState].includes(to)) {
    throw new TripError("ILLEGAL_TRANSITION", `${trip.state} → ${to}`);
  }

  const stampCols: Partial<Record<TripState, string>> = {
    ONGOING: "started_at",
    COMPLETED: "ended_at",
  };
  const col = stampCols[to];
  const updated = await sql.query<TripRow>(
    col
      ? `UPDATE trips SET state=$2, ${col}=now(), version=version+1 WHERE id=$1 AND version=$3 RETURNING *`
      : `UPDATE trips SET state=$2, version=version+1 WHERE id=$1 AND version=$3 RETURNING *`,
    [tripId, to, trip.version],
  );
  if (updated.rows.length === 0) throw new TripError("CONCURRENT_UPDATE", "retry");

  await publish(TOPICS.tripStateChanged, { tripId, state: to });
  return updated.rows[0]!;
}

/** Rider-read OTP check gates ARRIVED → ONGOING. Max 5 attempts. */
export async function verifyStartOtp(sql: SqlRowClient, tripId: string, otp: string): Promise<boolean> {
  const r = await sql.query<{ code_hash: string; attempts: number }>(
    "SELECT code_hash, attempts FROM otp_codes WHERE trip_id = $1",
    [tripId],
  );
  if (r.rows.length === 0) return false;
  const row = r.rows[0]!;
  if (row.attempts >= 5) throw new TripError("OTP_LOCKED", "too many attempts");
  const ok = row.code_hash === hashOtp(tripId, otp);
  if (!ok) {
    await sql.query("UPDATE otp_codes SET attempts = attempts + 1 WHERE trip_id = $1", [tripId]);
  }
  return ok;
}

/** On-demand OTP re-generation for the rider pre-ride (C5 fix: zero plaintext OTPs at rest). */
export async function regenerateTripOtp(sql: SqlRowClient, tripId: string): Promise<string> {
  const trip = await getTrip(sql, tripId);
  if (!trip) throw new TripError("NOT_FOUND", "trip does not exist");
  if (!["DRIVER_ASSIGNED", "ARRIVING", "ARRIVED"].includes(trip.state)) {
    throw new TripError("INVALID_STATE", "cannot regenerate OTP after trip has started");
  }
  const newOtp = String(randomInt(100000, 999999));
  await sql.query(
    "UPDATE otp_codes SET code_hash=$2, attempts=0, expires_at=$3 WHERE trip_id=$1",
    [tripId, hashOtp(tripId, newOtp), new Date(Date.now() + 6 * 3600_000)],
  );
  return newOtp;
}

export interface SettlementResult {
  txnId: string;
  duplicate: boolean;
  fareJson: TripFare;
}

/** COMPLETED → post balanced settlement; idempotent per trip so retries never double-charge. */
export async function settleTrip(
  sql: SqlRowClient,
  tripId: string,
  tipPaise = 0,
): Promise<SettlementResult> {
  const trip = await getTrip(sql, tripId);
  if (!trip) throw new TripError("NOT_FOUND", "trip does not exist");
  if (trip.state !== "COMPLETED") throw new TripError("NOT_COMPLETED", "settle after completion");
  const fare = readFareJson(trip.fare_json);
  const pm = await sql.query<{ payment_method: string }>(
    "SELECT r.payment_method FROM ride_requests r JOIN trips t ON t.request_id = r.id WHERE t.id = $1",
    [tripId],
  );
  const method = (["WALLET", "UPI", "CASH"] as const).includes(
    pm.rows[0]?.payment_method as "WALLET" | "UPI" | "CASH",
  )
    ? (pm.rows[0]!.payment_method as "WALLET" | "UPI" | "CASH")
    : "UPI";

  const allLines = settlementLines({
    riderId: trip.rider_id,
    driverId: trip.driver_id,
    agreedPaise: fare.agreedPaise,
    platformFeePaise: fare.platformFeePaise,
    tipPaise,
    paymentMethod: method,
  });
  // ₹0 negotiated rides ("negotiate to zero" is the product headline) legitimately
  // produce no postable journal lines — skip settlement rather than failing
  // NONPOSITIVE_AMOUNT/EMPTY_TXN and leaving the trip stuck unsettled.
  const lines = allLines.filter((l) => l.amountPaise > 0);
  if (lines.length === 0) {
    return { txnId: `settle:${tripId}:zero`, duplicate: false, fareJson: { ...fare, tipPaise } };
  }
  const { txnId, duplicate } = await postTransaction(sql, lines, tripId, `settle:${tripId}`);
  return { txnId, duplicate, fareJson: { ...fare, tipPaise } };
}
