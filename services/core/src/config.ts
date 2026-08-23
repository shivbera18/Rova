/**
 * Config-over-code: fare cards + negotiation rules come from the DB (seeded defaults),
 * cached in-process with a TTL. Per-city override rows win over DEFAULT_NEGOTIATION_RULES.
 * Robust fallback ensures quotes never fail even on fresh/unseeded databases.
 */
import { DEFAULT_NEGOTIATION_RULES } from "@chalo/protocol";
import type { NegotiationRules } from "@chalo/protocol";
import type { FareCardRow } from "./db/rows.ts";
import type { SqlRowClient } from "./types.ts";

const CITY_BENGALURU = 1;

export const DEFAULT_FARE_CARDS: Record<string, FareCardRow> = {
  "1:BIKE": {
    id: "card-bike",
    city_id: 1,
    vehicle_class: "BIKE",
    base_paise: 1500,
    per_km_paise: 650,
    per_min_paise: 80,
    min_fare_paise: 2500,
    platform_fee_pct: "0.10",
    platform_fee_min_paise: 500,
    platform_fee_cap_paise: 4000,
    night_multiplier: "1.0",
  },
  "1:BIKE_LITE": {
    id: "card-bike-lite",
    city_id: 1,
    vehicle_class: "BIKE_LITE",
    base_paise: 1200,
    per_km_paise: 550,
    per_min_paise: 70,
    min_fare_paise: 2000,
    platform_fee_pct: "0.10",
    platform_fee_min_paise: 500,
    platform_fee_cap_paise: 3000,
    night_multiplier: "1.0",
  },
  "1:AUTO": {
    id: "card-auto",
    city_id: 1,
    vehicle_class: "AUTO",
    base_paise: 3000,
    per_km_paise: 1200,
    per_min_paise: 120,
    min_fare_paise: 4000,
    platform_fee_pct: "0.12",
    platform_fee_min_paise: 800,
    platform_fee_cap_paise: 6000,
    night_multiplier: "1.0",
  },
  "1:CAB_MINI": {
    id: "card-cab-mini",
    city_id: 1,
    vehicle_class: "CAB_MINI",
    base_paise: 5000,
    per_km_paise: 1500,
    per_min_paise: 150,
    min_fare_paise: 8000,
    platform_fee_pct: "0.15",
    platform_fee_min_paise: 1000,
    platform_fee_cap_paise: 9000,
    night_multiplier: "1.0",
  },
  "1:CAB_PRIME": {
    id: "card-cab-prime",
    city_id: 1,
    vehicle_class: "CAB_PRIME",
    base_paise: 6000,
    per_km_paise: 1800,
    per_min_paise: 180,
    min_fare_paise: 10000,
    platform_fee_pct: "0.15",
    platform_fee_min_paise: 1200,
    platform_fee_cap_paise: 12000,
    night_multiplier: "1.0",
  },
  "1:CAB_XL": {
    id: "card-cab-xl",
    city_id: 1,
    vehicle_class: "CAB_XL",
    base_paise: 8000,
    per_km_paise: 2200,
    per_min_paise: 200,
    min_fare_paise: 13000,
    platform_fee_pct: "0.15",
    platform_fee_min_paise: 1500,
    platform_fee_cap_paise: 15000,
    night_multiplier: "1.0",
  },
};

let fareCards: Record<string, FareCardRow> | null = null;
let rulesByCity: Record<number, NegotiationRules> = {};
let loadedAt = 0;
const TTL_MS = 30_000;

export async function loadConfig(sql: SqlRowClient): Promise<void> {
  try {
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
  } catch {
    // If DB is initializing, defaults remain available
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
  const card =
    fareCards?.[`${cityId}:${vehicleClass}`] ??
    DEFAULT_FARE_CARDS[`${cityId}:${vehicleClass}`] ??
    DEFAULT_FARE_CARDS[`${CITY_BENGALURU}:${vehicleClass}`] ??
    DEFAULT_FARE_CARDS["1:BIKE"];

  if (!card) throw new Error(`NO_FARE_CARD:${cityId}:${vehicleClass}`);
  return card;
}

export async function getNegotiationRules(sql: SqlRowClient, cityId: number): Promise<NegotiationRules> {
  await ensureFresh(sql);
  return rulesByCity[cityId] ?? DEFAULT_NEGOTIATION_RULES;
}
