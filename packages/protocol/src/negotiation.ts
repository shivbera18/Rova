import type { Paise } from "./money.js";

export const VEHICLE_CLASSES = [
  "BIKE",
  "BIKE_LITE",
  "AUTO",
  "CAB_MINI",
  "CAB_PRIME",
  "CAB_XL",
] as const;
export type VehicleClass = (typeof VEHICLE_CLASSES)[number];

/** Negotiation FSM states — mirrors plan §2.4. Server-enforced; client only renders. */
export const NEGOTIATION_STATES = [
  "BROADCASTING",      // rider offer live with drivers
  "COUNTERED_DRIVER",  // driver countered, ball in rider's court
  "COUNTERED_RIDER",   // rider final offer out, ball in drivers' court
  "AGREED",
  "EXPIRED",
  "DECLINED",
  "CANCELLED",
] as const;
export type NegotiationState = (typeof NEGOTIATION_STATES)[number];

export interface NegotiationRules {
  maxRounds: number;          // total rounds incl. initial offer
  offerStageTtlS: number;     // broadcast expiry
  counterTtlS: number;        // counter-response expiry
  sessionTtlS: number;        // whole-session cap
  softFloorRatio: number;     // UI nudge below estimate × this
  hardFloorPaise: Paise;      // server floor — ₹0 per product spec
  cashOfferCapPaise: Paise;
}

export const DEFAULT_NEGOTIATION_RULES: NegotiationRules = {
  maxRounds: 3,
  offerStageTtlS: 45,
  counterTtlS: 20,
  sessionTtlS: 120,
  softFloorRatio: 0.6,
  hardFloorPaise: 0 as Paise,
  cashOfferCapPaise: 50000 as Paise,
};

/** The one legal-transition table for the negotiation machine. Anything not listed throws. */
export const TRANSITIONS: Record<NegotiationState, Partial<Record<string, NegotiationState>>> = {
  BROADCASTING: {
    DRIVER_ACCEPT: "AGREED",
    DRIVER_COUNTER: "COUNTERED_DRIVER",
    RIDER_CANCEL: "CANCELLED",
    EXPIRE: "EXPIRED",
  },
  COUNTERED_DRIVER: {
    RIDER_ACCEPT: "AGREED",
    RIDER_FINAL: "COUNTERED_RIDER",
    RIDER_DECLINE: "DECLINED",
    RIDER_CANCEL: "CANCELLED",
    EXPIRE: "EXPIRED",
  },
  COUNTERED_RIDER: {
    DRIVER_ACCEPT: "AGREED",
    EXPIRE: "EXPIRED",
    RIDER_CANCEL: "CANCELLED",
  },
  AGREED: {},
  EXPIRED: {},
  DECLINED: {},
  CANCELLED: {},
};

export function canTransition(from: NegotiationState, action: string): NegotiationState | null {
  return TRANSITIONS[from][action] ?? null;
}

export const TRIP_STATES = [
  "DRIVER_ASSIGNED",
  "ARRIVING",
  "ARRIVED",
  "ONGOING",
  "COMPLETED",
  "CANCELLED_RIDER",
  "CANCELLED_DRIVER",
] as const;
export type TripState = (typeof TRIP_STATES)[number];

export const LEGAL_TRIP_TRANSITIONS: Record<TripState, TripState[]> = {
  DRIVER_ASSIGNED: ["ARRIVING", "CANCELLED_RIDER", "CANCELLED_DRIVER"],
  ARRIVING: ["ARRIVED", "CANCELLED_RIDER", "CANCELLED_DRIVER"],
  ARRIVED: ["ONGOING", "CANCELLED_RIDER", "CANCELLED_DRIVER"],
  ONGOING: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED_RIDER: [],
  CANCELLED_DRIVER: [],
};
