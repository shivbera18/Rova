/**
 * Config-over-code: fare cards + negotiation rules come from the DB (seeded defaults),
 * cached in-process with a TTL. Per-city override rows win over DEFAULT_NEGOTIATION_RULES.
 * # ponytail: process-local cache; move to Redis when multiple core replicas exist
 */
import { DEFAULT_NEGOTIATION_RULES } from "@chalo/protocol";
import type { NegotiationRules } from "@chalo/protocol";
import type { FareCardRow } from "./db/rows.ts";
import type { SqlRowClient } from "./types.ts";

const CITY_BENGALURU = 1;

let fareCards: Record<string, FareCardRow> | null = null;
let rulesByCity: Record<number, NegotiationRules> = {};
let loadedAt = 0;
const TTL_MS = 30_000;

export async function loadConfig(sql: SqlRowClient): Promise<void> {
  const cards = await sql.query<FareCardRow>("SELECT * FROM fare_cards");
  fareCards = Object.fromEntries(cards.rows.map((c) => [`${c.city_id}:${c.vehicle_class}`, c]));

  const overrides = await sql.query<{ city_id: number; max_rounds: number; soft_floor_ratio: string }>(
    "SELECT * FROM negotiation_rules",
  );
  rulesByCity = {};
  for (const r of overrides.rows) {
    rulesByCity[r.city_id] = {
      ...DEFAULT_NEGOTIATION_RULES,
      maxRounds: r.max_rounds,
      softFloorRatio: Number(r.soft_floor_ratio),
    };
  }
  loadedAt = Date.now();
}

async function ensureFresh(sql: SqlRowClient): Promise<void> {
  if (!fareCards || Date.now() - loadedAt > TTL_MS) await loadConfig(sql);
}

export async function getFareCard(
  sql: SqlRowClient,
  cityId: number,
  vehicleClass: string,
): Promise<FareCardRow> {
  await ensureFresh(sql);
  const card = fareCards?.[`${cityId}:${vehicleClass}`];
  if (!card) throw new Error(`NO_FARE_CARD:${cityId}:${vehicleClass}`);
  return card;
}

export async function getNegotiationRules(sql: SqlRowClient, cityId: number): Promise<NegotiationRules> {
  await ensureFresh(sql);
  return rulesByCity[cityId] ?? DEFAULT_NEGOTIATION_RULES;
}
