import type { CreateRequest, LatLon } from "@chalo/protocol";

const TOKEN_KEY = "chalox.rider.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: {
      ...(opts.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // A wrong start OTP is 401 too (BAD_OTP) — never treat it as a dead session.
    const sessionDead =
      (res.status === 401 && json.code !== "BAD_OTP") || (res.status === 403 && json.code === "FORBIDDEN");
    if (sessionDead) {
      setToken(null);
      window.dispatchEvent(new Event("storage"));
    }
    throw new ApiError(
      res.status,
      String(json.code ?? "ERROR"),
      String(json.message ?? res.statusText),
    );
  }
  return json as T;
}

// ---- wire shapes (verified against services/core/src/server.ts) -------------

/** Wire quote: note the backend sends platformFeePaise + a signed quoteToken. */
export interface Quote {
  vehicleClass: string;
  etaMin: number;
  freeFlowEtaMin?: number;
  trafficLevel?: "LOW" | "MODERATE" | "HEAVY";
  routeSource?: "OSRM" | "HAVERSINE_FALLBACK";
  distanceKm: number;
  listPrice: number;
  tripFare: number;
  platformFeePaise: number;
  softFloor: number;
  quoteToken: string;
}
export interface RequestSessionView {
  sessionId: string;
  mode: "LIST" | "NEGOTIATED";
  state: "MATCHING" | "NEGOTIATING" | "AGREED" | "EXPIRED" | "DECLINED" | "CANCELLED";
  negotiationId?: string;
  /** direct-to-driver requests: how many drivers actually received it (0/1) */
  deliveredToDrivers?: number;
  currentOfferPaise?: number;
  platformFeePaise?: number;
  riderTotalPaise?: number;
  round: number;
  maxRounds: number;
  expiresAt?: string;
  listPrice: number;
}

/** GET /v1/requests/:id returns the raw DB row (snake_case columns) + trip. */
export interface RawRequestRow {
  id: string;
  state: RequestSessionView["state"];
  trip: { id: string; state: string } | null;
}

export interface FareBreakdownView {
  mode: "LIST" | "NEGOTIATED";
  agreedPaise: number;
  platformFeePaise: number;
  riderTotalPaise: number;
  listPricePaise: number;
  discountVsListPct: number;
  tollPaise: number;
  tipPaise: number;
}

export interface TripView {
  id: string;
  riderId: string;
  driverId: string;
  state: string;
  vehicleClass: string;
  pickup: LatLon;
  drop: LatLon;
  otp?: string;
  fareBreakdown: FareBreakdownView;
  driverName?: string;
  driverPlate?: string;
  driverRating?: number;
  driverLat?: number;
  driverLng?: number;
  /** stars the caller already gave on this trip, when they rated */
  myRatingStars?: number;
  /** start-code window for pre-start trips */
  otpExpiresAt?: string;
  paymentMethod?: "WALLET" | "UPI" | "CASH";
  startedAt?: string;
  endedAt?: string;
}

/** Wire body uses plain numbers; the branded Paise lives inside @chalo/protocol types. */
export type CreateRequestBody = Omit<CreateRequest, "offerPaise" | "platformFeePaise"> & {
  pickup: LatLon;
  drop: LatLon;
  offerPaise?: number;
  platformFeePaise?: number;
};

export function createRequest(r: CreateRequestBody): Promise<RequestSessionView> {
  return api<RequestSessionView>("/v1/requests", { body: r });
}

// ---- safety centre -------------------------------------------------------------

export function getShareLink(tripId: string): Promise<{ url: string }> {
  return api(`/v1/trips/${tripId}/share-link`, { method: "POST", body: {} });
}

export function getContacts(): Promise<{ contacts: Array<{ name: string; phone: string }> }> {
  return api("/v1/safety/contacts");
}

export function saveContacts(contacts: { contacts: Array<{ name?: string; phone?: string }> }): Promise<{ ok: true }> {
  return api("/v1/safety/contacts", { method: "PUT", body: contacts });
}

// ---- favourite drivers ("ride again") ------------------------------------------

export interface FavoriteDriver {
  id: string;
  name: string;
  vehicleClass: string | null;
  plate: string | null;
  rating: number;
}

export function getFavorites(): Promise<{ favorites: FavoriteDriver[] }> {
  return api("/v1/rider/favorites");
}

export function toggleFavorite(driverId: string, on: boolean): Promise<{ ok: true }> {
  return api(`/v1/drivers/${driverId}/favorite`, { method: on ? "PUT" : "DELETE", body: {} });
}

// ---- negotiation (rider side) ------------------------------------------------
// Stable domain endpoints shared with the driver console's mirror functions.

export function riderAccept(negotiationId: string): Promise<{ tripId: string }> {
  return api(`/v1/negotiations/${negotiationId}/rider-accept`, { body: {} });
}
export function riderFinal(
  negotiationId: string,
  paise: number,
  platformFeePaise: number,
): Promise<{ state: string; round: number }> {
  return api(`/v1/negotiations/${negotiationId}/final`, { body: { paise, platformFeePaise } });
}

export function riderDecline(negotiationId: string): Promise<{ ok: boolean }> {
  return api(`/v1/negotiations/${negotiationId}/rider-decline`, { body: {} });
}

export function cancelRequest(sessionId: string): Promise<{ ok: boolean }> {
  return api(`/v1/requests/${sessionId}/cancel`, { body: {} });
}

export function getWallet(): Promise<{ balancePaise: number }> {
  return api("/v1/wallet/me");
}

export function topUpWallet(amountPaise: number): Promise<{ balancePaise: number }> {
  return api("/v1/wallet/topup", { body: { amountPaise } });
}

export function addTripTip(tripId: string, amountPaise: number): Promise<{ ok: boolean; duplicate?: boolean }> {
  return api(`/v1/trips/${tripId}/tip`, { body: { amountPaise } });
}

export function cancelMatchedTrip(tripId: string): Promise<{ state: string; duplicate?: boolean }> {
  return api(`/v1/trips/${tripId}/cancel-rider`, { body: {} });
}

export function regenerateTripOtp(tripId: string): Promise<{ otp: string }> {
  return api(`/v1/trips/${tripId}/regenerate-otp`, { body: {} });
}
export interface TripListResponse {
  trips: TripView[];
}

export function getTrip(tripId: string): Promise<TripView> {
  return api(`/v1/trips/${tripId}`);
}

export function listTrips(): Promise<TripListResponse> {
  return api("/v1/trips");
}

export function rateTrip(
  tripId: string,
  body: { stars: number; comment?: string },
): Promise<{ ok: boolean }> {
  return api(`/v1/trips/${tripId}/rate`, { body });
}
