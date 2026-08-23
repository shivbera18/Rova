/**
 * Negotiation Engine — plan §2.4/§7.5. The FSM table lives in @chalo/protocol;
 * this module owns persistence, guardrails, expiry, and events. Every mutation:
 * validate → optimistic-lock UPDATE (state + version) → append event → publish.
 */
import { randomUUID } from "node:crypto";
import type { NegotiationRules, Paise } from "@chalo/protocol";
import { canTransition } from "@chalo/protocol";
import { getNegotiationRules } from "./config.ts";
import { publish, TOPICS } from "./bus.ts";
import type { SqlRowClient } from "./types.ts";
import type { NegotiationRow } from "./db/rows.ts";

export class NegotationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function createNegotiation(
  sql: SqlRowClient,
  requestId: string,
  riderId: string,
  cityId: number,
  vehicleClass: string,
  offerPaise: Paise,
  listPricePaise: Paise,
  platformFeePaise: Paise,
  paymentMethod: string,
): Promise<NegotiationRow> {
  const rules = await getNegotiationRules(sql, cityId);
  if (offerPaise < rules.hardFloorPaise) throw new NegotationError("OFFER_BELOW_HARD_FLOOR", "offer below floor");
  if (paymentMethod === "CASH" && offerPaise > rules.cashOfferCapPaise) {
    throw new NegotationError("CASH_CAP_EXCEEDED", `cash offers capped at ${rules.cashOfferCapPaise} paise`);
  }

  // one active negotiation per rider per city — cancel any prior live one
  await sql.query(
    `UPDATE negotiations SET state='CANCELLED'
     WHERE rider_id=$1 AND state IN ('BROADCASTING','COUNTERED_DRIVER','COUNTERED_RIDER')`,
    [riderId],
  );

  const id = randomUUID();
  const expiresAt = new Date(Date.now() + rules.offerStageTtlS * 1000);
  await sql.query(
    `INSERT INTO negotiations
       (id, request_id, rider_id, city_id, vehicle_class, state, round,
        current_offer, offered_by, list_price, platform_fee, expires_at)
     VALUES ($1,$2,$3,$4,$5,'BROADCASTING',1,$6,'RIDER',$7,$8,$9)`,
    [id, requestId, riderId, cityId, vehicleClass, offerPaise, listPricePaise, platformFeePaise, expiresAt],
  );
  await appendEvent(sql, id, "RIDER", "OFFER", offerPaise, 1);
  return (await getNegotiation(sql, id))!;
}

export async function getNegotiation(sql: SqlRowClient, id: string): Promise<NegotiationRow | null> {
  const r = await sql.query<NegotiationRow>("SELECT * FROM negotiations WHERE id = $1", [id]);
  return r.rows[0] ?? null;
}

/** Driver accepts the current rider-side offer. Returns the agreed row or throws. */
export async function driverAccept(
  sql: SqlRowClient,
  negId: string,
  driverId: string,
): Promise<NegotiationRow> {
  return transition(sql, negId, "DRIVER_ACCEPT", driverId);
}

/** Rider accepts a driver counter. */
export async function riderAcceptCounter(sql: SqlRowClient, negId: string): Promise<NegotiationRow> {
  return transition(sql, negId, "RIDER_ACCEPT", null);
}

/**
 * Driver counters with their take-home ask. Guardrails per §7.5:
 * counter must be ≥ rider's last offer (below = accept semantics).
 */
export async function driverCounter(
  sql: SqlRowClient,
  negId: string,
  driverId: string,
  counterPaise: Paise,
): Promise<NegotiationRow> {
  const neg = await requireLive(sql, negId);
  if (neg.state !== "BROADCASTING" && neg.state !== "COUNTERED_RIDER") {
    throw new NegotationError("INVALID_STATE", `cannot counter from ${neg.state}`);
  }
  if (counterPaise <= neg.current_offer) {
    // below-or-equal rider offer = accept semantics; caller treats as accept
    return driverAccept(sql, negId, driverId);
  }
  return applyCounter(sql, neg, "DRIVER", "DRIVER_COUNTER", counterPaise);
}

/** Rider's closing final offer after a driver counter; must be ≥ their previous offer. */
export async function riderFinalOffer(
  sql: SqlRowClient,
  negId: string,
  finalPaise: Paise,
  rules?: NegotiationRules,
): Promise<NegotiationRow> {
  const neg = await requireLive(sql, negId);
  const r = rules ?? (await getNegotiationRules(sql, neg.city_id));
  if (neg.round >= r.maxRounds) throw new NegotationError("NEGOTIATION_ROUND_EXCEEDED", "max rounds used");
  if (finalPaise < neg.current_offer) {
    // lowering own position is not allowed once countered — decline instead
    throw new NegotationError("OFFER_MUST_NOT_DECREASE", "final must be ≥ driver counter");
  }
  return applyCounter(sql, neg, "RIDER", "RIDER_FINAL", finalPaise);
}

export async function riderDecline(sql: SqlRowClient, negId: string): Promise<NegotiationRow> {
  return transition(sql, negId, "RIDER_DECLINE", null);
}

export async function cancelByRider(sql: SqlRowClient, negId: string): Promise<NegotiationRow> {
  return transition(sql, negId, "RIDER_CANCEL", null);
}

// ---- internals ---------------------------------------------------------------

async function requireLive(sql: SqlRowClient, negId: string): Promise<NegotiationRow> {
  const neg = await getNegotiation(sql, negId);
  if (!neg) throw new NegotationError("NOT_FOUND", "negotiation does not exist");
  if (!["BROADCASTING", "COUNTERED_DRIVER", "COUNTERED_RIDER"].includes(neg.state)) {
    throw new NegotationError("INVALID_STATE", `not live: ${neg.state}`);
  }
  return neg;
}

function expiresFor(state: string, rules: NegotiationRules): Date {
  const ttlS =
    state === "BROADCASTING" || state === "COUNTERED_RIDER"
      ? rules.offerStageTtlS
      : rules.counterTtlS;
  return new Date(Date.now() + Math.min(ttlS, rules.sessionTtlS) * 1000);
}

async function transition(
  sql: SqlRowClient,
  negId: string,
  action: string,
  _actorId: string | null,
): Promise<NegotiationRow> {
  const neg = await requireLive(sql, negId);
  const next = canTransition(neg.state as never, action);
  if (!next) throw new NegotationError("ILLEGAL_TRANSITION", `${action} from ${neg.state}`);

  const updated = await sql.query<NegotiationRow>(
    `UPDATE negotiations SET state=$2, version=version+1
     WHERE id=$1 AND version=$3 AND state=$4 RETURNING *`,
    [negId, next, neg.version, neg.state],
  );
  if (updated.rows.length === 0) throw new NegotationError("CONCURRENT_UPDATE", "retry");
  const row = updated.rows[0]!;

  await appendEvent(sql, row.id, action.includes("DRIVER") ? "DRIVER" : "RIDER", action, row.current_offer, row.round);
  await publish(TOPICS.negotiationEvent, {
    negotiationId: row.id,
    action,
    from: neg.state,
    to: next,
  });
  return row;
}

async function applyCounter(
  sql: SqlRowClient,
  neg: NegotiationRow,
  actor: "RIDER" | "DRIVER",
  action: "DRIVER_COUNTER" | "RIDER_FINAL",
  amount: Paise,
): Promise<NegotiationRow> {
  const rules = await getNegotiationRules(sql, neg.city_id);
  const nextState = canTransition(neg.state, action);
  if (!nextState) throw new NegotationError("ILLEGAL_TRANSITION", `${action} from ${neg.state}`);
  if (neg.round >= rules.maxRounds && action === "RIDER_FINAL") {
    throw new NegotationError("NEGOTIATION_ROUND_EXCEEDED", "max rounds used");
  }

  const nextRound = action === "DRIVER_COUNTER" ? neg.round : neg.round;
  const expiresAt = expiresFor(nextState, rules);
  const updated = await sql.query<NegotiationRow>(
    `UPDATE negotiations
     SET state=$2, current_offer=$3, offered_by=$4, round=$5, expires_at=$6, version=version+1
     WHERE id=$1 AND version=$7 AND state=$8 RETURNING *`,
    [neg.id, nextState, amount, actor, nextRound, expiresAt, neg.version, neg.state],
  );
  if (updated.rows.length === 0) throw new NegotationError("CONCURRENT_UPDATE", "retry");
  const row = updated.rows[0]!;

  await appendEvent(sql, row.id, actor, action, amount, row.round);
  await publish(TOPICS.negotiationEvent, {
    negotiationId: row.id,
    action,
    amount,
    round: row.round,
  });
  return row;
}

export async function appendEvent(
  sql: SqlRowClient,
  negotiationId: string,
  actor: string,
  action: string,
  amount: number | null,
  round: number,
): Promise<void> {
  await sql.query(
    "INSERT INTO negotiation_events (negotiation_id, actor, action, amount_paise, round) VALUES ($1,$2,$3,$4,$5)",
    [negotiationId, actor, action, amount, round],
  );
}
