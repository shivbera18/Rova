import type { NegotiationState, TripState, VehicleClass } from "./negotiation.js";
import type { FareQuote, Paise } from "./money.js";

export interface ApiError {
  code: string; // stable machine codes: NEGOTIATION_ROUND_EXCEEDED etc.
  message: string;
}

export type Role = "RIDER" | "DRIVER";

export interface AuthSession {
  token: string; // JWT
  userId: string;
  role: Role;
  profileComplete: boolean;
}

export interface QuoteRequest {
  pickup: LatLon;
  drop: LatLon;
  vehicleClass?: VehicleClass;
  paymentMethod?: PaymentMethod;
}
export type PaymentMethod = "WALLET" | "UPI" | "CASH";

export interface QuoteResponse {
  quotes: (FareQuote & {
    vehicleClass: VehicleClass;
    etaMin: number;
    distanceKm: number;
    softFloor: Paise; // UI nudge threshold
    explainerCopyId: string;
  })[];
}

/** POST /v1/requests — offer omitted = list-price dispatch */
export interface CreateRequest {
  quoteToken: string;       // signed short-lived quote reference
  offerPaise?: Paise;       // negotiated driver take-home; present ⇒ NEGOTIATED mode
  platformFeePaise?: Paise; // rider's negotiated platform contribution (₹0 allowed)
  vehicleClass: VehicleClass;
  paymentMethod: PaymentMethod;
  pickupLabel?: string;     // human-readable place names shown to drivers
  dropLabel?: string;
  /** favourite driver for direct-to-driver ("ride again") requests */
  driverId?: string;
}

export interface RequestSession {
  id: string;
  mode: "LIST" | "NEGOTIATED";
  state: "MATCHING" | "NEGOTIATING" | "AGREED" | "EXPIRED" | "DECLINED" | "CANCELLED";
  negotiationId?: string;
  currentOfferPaise?: Paise;
  platformFeePaise?: Paise;
  riderTotalPaise?: Paise;
  round: number;
  maxRounds: number;
  expiresAt?: string;
  tripId?: string;
  listPrice: Paise;
}

export interface CounterBody { paise: Paise }

export interface DriverOfferPayload {
  requestId: string;
  negotiationId?: string;
  takeHomePaise: Paise;     // what the driver earns if accepted
  pickupKm: number;
  tripKm: number;
  expiresAt: string;
  round: number;
  isCounter: boolean;
  riderName: string;
  riderRating: number;
  pickup: LatLon;
  drop: LatLon;
  pickupLabel?: string;
  dropLabel?: string;
  /** direct-to-driver ("ride again") request — show a repeat-rider badge */
  isRepeatRequest?: boolean;
  paymentMethod: PaymentMethod;
}

export interface DriverSnapshot {
  driverId: string;
  lat: number;
  lng: number;
  heading: number;
  online: boolean;
  onTrip: boolean;
  vehicleClass: VehicleClass;
  rating: number;
  plate: string;
  name: string;
}

export interface TripView {
  id: string;
  riderId: string;
  driverId: string;
  state: TripState;
  vehicleClass: VehicleClass;
  pickup: LatLon;
  drop: LatLon;
  otp?: string;             // only ever delivered to the rider + assigned driver
  fareBreakdown: FareBreakdown;
  pickupLabel?: string;
  dropLabel?: string;
  driverName?: string;
  driverPlate?: string;
  driverRating?: number;
  driverLat?: number;
  driverLng?: number;
  startedAt?: string;
  endedAt?: string;
  paymentMethod: PaymentMethod;
}

export interface FareBreakdown {
  mode: "LIST" | "NEGOTIATED";
  agreedPaise: Paise;       // = driver take-home
  platformFeePaise: Paise;  // rider-side extra
  riderTotalPaise: Paise;
  listPricePaise: Paise;
  discountVsListPct: number;
  tollPaise: Paise;
  tipPaise: Paise;
}

export interface LedgerLineView {
  id: number;
  txnId: string;
  reason: string;
  debitAccount: string;
  creditAccount: string;
  amountPaise: Paise;
  createdAt: string;
}

// ---- WS messages -----------------------------------------------------------

export type RiderWsMessage =
  | { t: "request.updated"; session: RequestSession }
  | { t: "negotiation.counter"; negotiationId: string; paise: Paise; round: number; expiresAt: string }
  | { t: "driver.assigned"; trip: TripView }
  | { t: "trip.location"; lat: number; lng: number }
  | { t: "trip.state"; state: TripState };

export type DriverWsMessage =
  | { t: "dispatch.offer"; offer: DriverOfferPayload }
  | { t: "dispatch.cancel"; requestId: string }
  | { t: "trip.state"; state: TripState; tripId?: string }
  | { t: "trip.location"; lat: number; lng: number };

export interface LatLon { lat: number; lng: number }
export type { FareQuote, NegotiationState, Paise, TripState, VehicleClass };
