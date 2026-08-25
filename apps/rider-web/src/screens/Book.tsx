import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLon, RiderWsMessage } from "@chalo/protocol";
import { formatINR, paisa } from "@chalo/protocol";
import MapView from "../components/MapView";
import OfferSheet, { vehicleLabel, vehicleIcon } from "../components/OfferSheet";
import { LocationSearch, type SelectedPlace } from "../components/LocationSearch";
import CounterModal, { type DriverCounter } from "../components/CounterModal";
import { useCountdown, useRiderSocket } from "../ws";
import { NeoCard, NeoButton, NeoBadge } from "../components/NeoComponents";
import {
  addTripTip,
  cancelMatchedTrip,
  cancelRequest,
  getTrip,
  getWallet,
  listTrips,
  rateTrip,
  regenerateTripOtp,
  topUpWallet,
  type Quote,
  type RequestSessionView,
  type TripView,
} from "../api";

type Phase =
  | { k: "pick" }
  | { k: "quotes"; quotes: Quote[] }
  | { k: "offer"; quote: Quote }
  | { k: "matching"; session: RequestSessionView; counter: DriverCounter | null; quote: Quote | null }
  | { k: "trip"; trip: TripView }
  | { k: "done"; trip: TripView };

interface StoredRoute {
  id: string;
  label: string;
  pickupLabel: string;
  dropLabel: string;
  pickup: LatLon;
  drop: LatLon;
}

function readRoutes(key: string): StoredRoute[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]") as StoredRoute[]; }
  catch { return []; }
}

const PAY_METHODS = ["UPI", "WALLET", "CASH"] as const;
const MATCH_TOTAL_S = 45;
const POPULAR_ROUTES: Array<{ label: string; pickup: LatLon; drop: LatLon }> = [
  {
    label: "⚡ Koramangala ➔ Jayanagar",
    pickup: { lat: 12.9352, lng: 77.6245 },
    drop: { lat: 12.9308, lng: 77.5838 },
  },
  {
    label: "⚡ Koramangala ➔ Indiranagar",
    pickup: { lat: 12.9352, lng: 77.6245 },
    drop: { lat: 12.9784, lng: 77.6408 },
  },
  {
    label: "⚡ MG Road ➔ HSR Layout",
    pickup: { lat: 12.9757, lng: 77.6068 },
    drop: { lat: 12.9116, lng: 77.6474 },
  },
  {
    label: "⚡ Indiranagar ➔ Airport",
    pickup: { lat: 12.9784, lng: 77.6408 },
    drop: { lat: 13.1986, lng: 77.7066 },
  },
];

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("chalox.rider.token");
  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

function stateLabel(s: string): string {
  switch (s) {
    case "DRIVER_ASSIGNED":
    case "ARRIVING":
      return "Driver is on the way";
    case "ARRIVED":
      return "Driver has arrived at pickup";
    case "ONGOING":
      return "On trip to destination";
    case "COMPLETED":
      return "Trip completed";
    case "CANCELLED_RIDER":
    case "CANCELLED_DRIVER":
      return "Trip cancelled";
    default:
      return s;
  }
}

export default function Book(): React.ReactElement {
  const [phase, setPhase] = useState<Phase>({ k: "pick" });
  const [pickup, setPickup] = useState<LatLon | null>(null);
  const [pickupLabel, setPickupLabel] = useState("");
  const [drop, setDrop] = useState<LatLon | null>(null);
  const [dropLabel, setDropLabel] = useState("");
  const [payMethod, setPayMethod] = useState<"UPI" | "WALLET" | "CASH">("UPI");
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveDriverPos, setLiveDriverPos] = useState<LatLon | null>(null);
  const [savedRoutes, setSavedRoutes] = useState<StoredRoute[]>(() => readRoutes("chalox.savedRoutes"));
  const [recentRoutes, setRecentRoutes] = useState<StoredRoute[]>(() => readRoutes("chalox.recentRoutes"));
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [activeDriverCounter, setActiveDriverCounter] = useState<DriverCounter | null>(null);
  const [rated, setRated] = useState(false);
  const [ratingVal, setRatingVal] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const [tipPaise, setTipPaise] = useState(0);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    void getWallet()
      .then((w) => setWalletBalance(w.balancePaise))
      .catch(() => undefined);
  }, []);

  const [counterCount, setCounterCount] = useState(0);
  const [counterRound, setCounterRound] = useState(1);
  const [counterExpiresAt, setCounterExpiresAt] = useState<string | null>(null);
  const countdownSeconds = useCountdown(counterExpiresAt);

  const handleWsMessage = useCallback((msg: RiderWsMessage) => {
    if (msg.t === "request.updated") {
      setPhase((prev) => {
        if (prev.k !== "matching") return prev;
        return { ...prev, session: msg.session as unknown as RequestSessionView };
      });
    } else if (msg.t === "negotiation.counter") {
      setCounterCount((c) => c + 1);
      setCounterRound(msg.round);
      setCounterExpiresAt(msg.expiresAt);
      setActiveDriverCounter({
        negotiationId: msg.negotiationId,
        counterPaise: msg.paise,
        round: msg.round,
        expiresAt: msg.expiresAt,
      });
      setShowCounterModal(true);
    } else if (msg.t === "driver.assigned") {
      setShowCounterModal(false);
      setActiveDriverCounter(null);
      setTipPaise(0);
      setRated(false);
      setPhase({ k: "trip", trip: msg.trip });
    } else if (msg.t === "trip.location") {
      setLiveDriverPos({ lat: msg.lat, lng: msg.lng });
    } else if (msg.t === "trip.state") {
      setPhase((prev) => {
        if (prev.k !== "trip") return prev;
        const updated = { ...prev.trip, state: msg.state };
        return msg.state === "COMPLETED" ? { k: "done", trip: updated } : { ...prev, trip: updated };
      });
    }
  }, []);

  const { connected: wsConnected } = useRiderSocket(handleWsMessage);

  const pollRef = useRef<number | null>(null);
  const stopPoll = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (phase.k !== "trip") return;
    const id = phase.trip.id;
    const iv = setInterval(() => {
      void getTrip(id)
        .then((t) => {
          setPhase((p) => {
            if (p.k !== "trip") return p;
            const merged = { ...t, otp: t.otp ?? p.trip.otp };
            return merged.state === "COMPLETED" ? { k: "done", trip: merged } : { ...p, trip: merged };
          });
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(iv);
  }, [phase.k, phase.k === "trip" ? phase.trip.id : null]);

  async function fetchQuotes(a: LatLon, b: LatLon): Promise<Quote[]> {
    const res = await fetch("/v1/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pickup: a, drop: b }),
    });
    const json = (await res.json()) as { quotes?: Quote[]; message?: string };
    if (!res.ok) {
      throw new Error(json.message || `Failed to fetch fares (${res.status})`);
    }
    if (!json.quotes || json.quotes.length === 0) throw new Error("No vehicle classes available for this route");
    return json.quotes;
  }

  async function loadQuotesForRoute(a: LatLon, b: LatLon): Promise<void> {
    setLoadingQuotes(true);
    setError(null);
    try {
      const quotes = await fetchQuotes(a, b);
      setPhase({ k: "quotes", quotes });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch quotes");
    } finally {
      setLoadingQuotes(false);
    }
  }

  async function onMapClick(ll: LatLon): Promise<void> {
    if (phase.k !== "pick" || loadingQuotes) return;
    setError(null);
    if (!pickup || (pickup && drop)) {
      setPickup(ll);
      setPickupLabel("Pinned pickup location");
      setDrop(null);
      setDropLabel("");
      return;
    }
    setDrop(ll);
    setDropLabel("Pinned drop-off location");
    rememberRecent(pickup, ll, pickupLabel || "Pinned pickup", "Pinned drop-off");
    await loadQuotesForRoute(pickup, ll);
  }

  function rememberRecent(a: LatLon, b: LatLon, from: string, to: string): void {
    const route: StoredRoute = {
      id: `${a.lat},${a.lng}:${b.lat},${b.lng}`,
      label: `${from} → ${to}`,
      pickupLabel: from,
      dropLabel: to,
      pickup: a,
      drop: b,
    };
    const next = [route, ...recentRoutes.filter((r) => r.id !== route.id)].slice(0, 5);
    setRecentRoutes(next);
    localStorage.setItem("chalox.recentRoutes", JSON.stringify(next));
  }

  async function selectStoredRoute(route: StoredRoute): Promise<void> {
    setPickup(route.pickup);
    setPickupLabel(route.pickupLabel);
    setDrop(route.drop);
    setDropLabel(route.dropLabel);
    rememberRecent(route.pickup, route.drop, route.pickupLabel, route.dropLabel);
    await loadQuotesForRoute(route.pickup, route.drop);
  }

  async function selectSearchPlace(kind: "pickup" | "drop", place: SelectedPlace): Promise<void> {
    if (kind === "pickup") {
      setPickup(place.position);
      setPickupLabel(place.label);
      if (drop) {
        rememberRecent(place.position, drop, place.label, dropLabel || "Drop-off");
        await loadQuotesForRoute(place.position, drop);
      }
      return;
    }
    setDrop(place.position);
    setDropLabel(place.label);
    if (pickup) {
      rememberRecent(pickup, place.position, pickupLabel || "Pickup", place.label);
      await loadQuotesForRoute(pickup, place.position);
    }
  }

  async function selectPopularRoute(route: typeof POPULAR_ROUTES[0]): Promise<void> {
    const from = route.label.split("➔")[0]?.replace("⚡", "").trim() ?? "Pickup";
    const to = route.label.split("➔")[1]?.trim() ?? "Drop-off";
    setPickup(route.pickup);
    setPickupLabel(from);
    setDrop(route.drop);
    setDropLabel(to);
    rememberRecent(route.pickup, route.drop, from, to);
    await loadQuotesForRoute(route.pickup, route.drop);
  }

  async function confirmCancelTrip(): Promise<void> {
    if (phase.k !== "trip") return;
    try {
      await cancelMatchedTrip(phase.trip.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel the trip");
    } finally {
      setShowCancelConfirm(false);
    }
    reset();
  }

  async function handleRegenerateOtp(): Promise<void> {
    if (phase.k !== "trip") return;
    try {
      const { otp } = await regenerateTripOtp(phase.trip.id);
      setPhase((p) => (p.k === "trip" ? { ...p, trip: { ...p.trip, otp } } : p));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a new code");
    }
  }

  function reset(): void {
    stopPoll();
    setPickup(null);
    setPickupLabel("");
    setDrop(null);
    setDropLabel("");
    setError(null);
    setPhase({ k: "pick" });
  }

  return (
    <div className="book-wrap">
      {!wsConnected && (
        <div className="connection-banner">
          <span>⚡ Live updates reconnecting...</span>
        </div>
      )}

      <div className="map-layer">
        <MapView
          pickup={pickup}
          drop={drop}
          driverPos={liveDriverPos}
          onMapClick={onMapClick}
        />
      </div>

      <div className="side-panel">
        {error && (
          <div className="error-text" style={{ marginBottom: 12 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Phase 1: Pickup / Drop Routing Sheet */}
        {phase.k === "pick" && (
          <NeoCard elevation="md" className="booking-sheet">
            <div className="spread" style={{ marginBottom: 4 }}>
              <span className="eyebrow">BOOK A RIDE</span>
              <NeoBadge variant="green">LIVE FARES</NeoBadge>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 900, textTransform: "none", marginBottom: 6 }}>
              Where are you going?
            </h2>
            <p style={{ color: "var(--ink-soft)", fontSize: 13, fontWeight: 500, marginBottom: 16 }}>
              Search an address, choose a quick route, or pin points on the map.
            </p>

            <div className="route-search-stack">
              <LocationSearch
                kind="pickup"
                value={pickupLabel}
                placeholder="Search pickup — e.g. Koramangala"
                onSelect={(place) => void selectSearchPlace("pickup", place)}
                onClear={() => {
                  setPickup(null);
                  setPickupLabel("");
                }}
              />
              <LocationSearch
                kind="drop"
                value={dropLabel}
                placeholder="Where to? — e.g. Jayanagar"
                onSelect={(place) => void selectSearchPlace("drop", place)}
                onClear={() => {
                  setDrop(null);
                  setDropLabel("");
                }}
              />
            </div>

            <button
              type="button"
              className="use-location-btn"
              onClick={() => {
                if (!navigator.geolocation) {
                  setError("Location is not supported by this browser");
                  return;
                }
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    setPickup({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    setPickupLabel("My current location");
                  },
                  () => setError("Location permission was denied"),
                  { enableHighAccuracy: true, timeout: 8000 },
                );
              }}
            >
              ◎ Use my current location
            </button>

            <div className="booking-divider"><span>POPULAR ROUTES</span></div>
            <div className="quick-places-row">
              {POPULAR_ROUTES.map((r) => (
                <button key={r.label} type="button" className="saved-route" onClick={() => void selectPopularRoute(r)}>
                  <span>↗</span>
                  <small>{r.label.replace("⚡ ", "")}</small>
                </button>
              ))}
            </div>

            {recentRoutes.length > 0 && (
              <>
                <div className="booking-divider"><span>RECENT</span></div>
                <div className="quick-places-row">
                  {recentRoutes.slice(0, 3).map((route) => (
                    <button key={route.id} type="button" className="saved-route" onClick={() => void selectStoredRoute(route)}>
                      <span>↻</span>
                      <small>{route.label}</small>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="booking-options">
              <div>
                <span className="option-label">PAYMENT METHOD</span>
                <div className="payment-group">
                  {PAY_METHODS.map((pm) => (
                    <button
                      key={pm}
                      className={`payment-pill ${payMethod === pm ? "selected" : ""}`}
                      onClick={() => setPayMethod(pm)}
                    >
                      {pm === "UPI" ? "⚡ UPI" : pm === "WALLET" ? "▣ Wallet" : "₹ Cash"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loadingQuotes && (
              <div className="loading-fares" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
                <span className="search-spinner" /> Calculating live fair estimates...
              </div>
            )}
          </NeoCard>
        )}

        {/* Phase 2: Vehicle Selection Cards */}
        {phase.k === "quotes" && (
          <NeoCard elevation="md" style={{ padding: 22 }}>
            <div className="spread" style={{ marginBottom: 14 }}>
              <h3 style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase" }}>Select Vehicle</h3>
              <NeoButton variant="white" size="sm" onClick={reset}>
                Change Route
              </NeoButton>
            </div>

            <div className="col" style={{ gap: 8 }}>
              {phase.quotes.map((q) => (
                <div
                  key={q.vehicleClass}
                  className="quote-row"
                  onClick={() => setPhase({ k: "offer", quote: q })}
                >
                  <div className="quote-class">
                    <span style={{ fontSize: 24 }}>{vehicleIcon(q.vehicleClass)}</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14.5 }}>{vehicleLabel(q.vehicleClass)}</div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-muted)", fontWeight: 600 }}>
                        {q.distanceKm} km · ~{q.etaMin} min ETA
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="quote-price">{formatINR(paisa(q.listPrice))}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--primary)" }}>Name your offer →</div>
                  </div>
                </div>
              ))}
            </div>
          </NeoCard>
        )}

        {/* Phase 3: Offer Builder Sheet */}
        {phase.k === "offer" && pickup && drop && (
          <OfferSheet
            quote={phase.quote}
            pickup={pickup}
            drop={drop}
            payMethod={payMethod}
            onClose={() => setPhase({ k: "quotes", quotes: [phase.quote] })}
            onBooked={(session) => {
              setPhase({ k: "matching", session, counter: null, quote: phase.quote });
            }}
          />
        )}

        {/* Phase 4: Matching Status Card */}
        {phase.k === "matching" && (
          <NeoCard elevation="md" style={{ padding: 22 }}>
            <div className="spread" style={{ marginBottom: 12 }}>
              <span className="eyebrow">RADAR ACTIVE</span>
              <NeoBadge variant="green">SEARCHING DRIVERS</NeoBadge>
            </div>
            <h3 style={{ fontSize: 20, marginBottom: 6 }}>Connecting With Drivers...</h3>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 16 }}>
              Broadcasting your offer to nearby verified drivers.
            </p>

            <div className="progress-track" style={{ marginBottom: 16 }}>
              <div className="progress-fill" style={{ width: "100%", animation: "brut-pulse 1.5s infinite" }} />
            </div>

            <NeoButton
              variant="red"
              fullWidth
              onClick={() => {
                if (phase.k === "matching") {
                  void cancelRequest(phase.session.sessionId);
                  reset();
                }
              }}
            >
              Cancel Request
            </NeoButton>
          </NeoCard>
        )}

        {/* Phase 5: Ongoing Trip Card */}
        {phase.k === "trip" && (
          <NeoCard elevation="md" style={{ padding: 22 }}>
            <div className="spread" style={{ marginBottom: 12 }}>
              <NeoBadge variant="primary">{phase.trip.state}</NeoBadge>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-muted)" }}>{vehicleLabel(phase.trip.vehicleClass)}</span>
            </div>

            <div className="driver-card">
              <div className="driver-avatar" aria-hidden>
                {(phase.trip.driverName || "D").slice(0, 1).toUpperCase()}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>
                  {phase.trip.driverName || "Driver details on arrival"}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-muted)" }}>
                  ★ {phase.trip.driverRating.toFixed(1)} · pays via {phase.trip.paymentMethod ?? "UPI"}
                </div>
              </div>
              {phase.trip.driverPlate && (
                <span className="plate-chip">{phase.trip.driverPlate}</span>
              )}
            </div>

            <h3 style={{ fontSize: 20, margin: "12px 0 8px" }}>{stateLabel(phase.trip.state)}</h3>

            {phase.trip.otp && (
              <div className="otp-display">
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--primary)" }}>
                  Start OTP for Driver
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 900, letterSpacing: "0.15em", color: "var(--ink)" }}>
                  {phase.trip.otp}
                </div>
              </div>
            )}

            {["DRIVER_ASSIGNED", "ARRIVING", "ARRIVED"].includes(phase.trip.state) && (
              <button
                type="button"
                className="use-location-btn"
                style={{ marginTop: phase.trip.otp ? 0 : 12 }}
                onClick={() => void handleRegenerateOtp()}
              >
                ⟳ Show new start code
              </button>
            )}

            <div className="fare-box">
              <div className="fare-line">
                <span>Agreed Fare</span>
                <strong>{formatINR(paisa(phase.trip.fareBreakdown.agreedPaise))}</strong>
              </div>
              <div className="fare-line">
                <span>Platform Fee</span>
                <span>{formatINR(paisa(phase.trip.fareBreakdown.platformFeePaise))}</span>
              </div>
              <div className="fare-total spread">
                <span>Total</span>
                <strong>{formatINR(paisa(phase.trip.fareBreakdown.riderTotalPaise))}</strong>
              </div>
            </div>

            {["DRIVER_ASSIGNED", "ARRIVING", "ARRIVED"].includes(phase.trip.state) && (
              showCancelConfirm ? (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>
                    Cancel this ride? Your driver is already on the way.
                  </p>
                  <div className="row" style={{ gap: 10 }}>
                    <NeoButton variant="red" fullWidth onClick={() => void confirmCancelTrip()}>
                      Yes, cancel
                    </NeoButton>
                    <NeoButton variant="white" fullWidth onClick={() => setShowCancelConfirm(false)}>
                      Keep ride
                    </NeoButton>
                  </div>
                </div>
              ) : (
                <NeoButton
                  variant="white"
                  size="sm"
                  fullWidth
                  style={{ marginTop: 14 }}
                  onClick={() => setShowCancelConfirm(true)}
                >
                  Cancel Ride
                </NeoButton>
              )
            )}
          </NeoCard>
        )}

        {/* Phase 6: Completed Ride Receipt */}
        {phase.k === "done" && (
          <NeoCard elevation="lg" style={{ padding: 24 }}>
            <div className="spread" style={{ marginBottom: 12 }}>
              <span className="eyebrow">RIDE COMPLETED</span>
              <NeoBadge variant="green">SUCCESSFUL</NeoBadge>
            </div>
            <h3 style={{ fontSize: 22, marginBottom: 8 }}>You've Arrived!</h3>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 16 }}>
              Total paid: {formatINR(paisa(phase.trip.fareBreakdown.riderTotalPaise))}
            </p>

            <NeoButton variant="primary" fullWidth onClick={reset}>
              Book Another Ride 🚀
            </NeoButton>
          </NeoCard>
        )}
      </div>

      {showCounterModal && activeDriverCounter && (
        <CounterModal
          counter={activeDriverCounter}
          countdownSeconds={countdownSeconds}
          onAccept={() => setShowCounterModal(false)}
          onFinalOffer={() => setShowCounterModal(false)}
          onDecline={() => setShowCounterModal(false)}
        />
      )}
    </div>
  );
}
