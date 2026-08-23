import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLon, RiderWsMessage } from "@chalo/protocol";
import { formatINR, paisa } from "@chalo/protocol";
import MapView from "../components/MapView";
import OfferSheet, { vehicleLabel, vehicleIcon } from "../components/OfferSheet";
import CounterModal, { type DriverCounter } from "../components/CounterModal";
import { useCountdown, useRiderSocket } from "../ws";
import {
  cancelRequest,
  getTrip,
  rateTrip,
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

const PAY_METHODS = ["UPI", "WALLET", "CASH"] as const;
// must match the server's offerStageTtlS so the countdown bar hits 0 at real expiry
const MATCH_TOTAL_S = 45;

const POPULAR_ROUTES: Array<{ label: string; pickup: LatLon; drop: LatLon }> = [
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
  return {
    "content-type": "application/json",
    authorization: `Bearer ${localStorage.getItem("chalox.rider.token") ?? ""}`,
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
      return "On your ride";
    case "COMPLETED":
      return "Ride Completed";
    case "CANCELLED_RIDER":
      return "You cancelled this ride";
    case "CANCELLED_DRIVER":
      return "Driver cancelled this ride";
    default:
      return s;
  }
}

export default function Book(): React.ReactElement {
  const [pickup, setPickup] = useState<LatLon | null>(null);
  const [drop, setDrop] = useState<LatLon | null>(null);
  const [phase, setPhase] = useState<Phase>({ k: "pick" });
  const [payMethod, setPayMethod] = useState<(typeof PAY_METHODS)[number]>("UPI");
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipPaise, setTipPaise] = useState(0);
  const [rated, setRated] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const routeRef = useRef<{ pickup: LatLon | null; drop: LatLon | null }>({ pickup: null, drop: null });
  routeRef.current = { pickup, drop };
  const lastQuotes = useRef<Quote[]>([]);
  if (phase.k === "quotes") lastQuotes.current = phase.quotes;

  function stopPoll(): void {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }

  const refreshCompleted = useCallback(async (tripId: string): Promise<void> => {
    try {
      const t = await getTrip(tripId);
      if (t.state === "COMPLETED") setPhase({ k: "done", trip: t });
      else setPhase((p) => (p.k === "trip" ? { ...p, trip: t } : p));
    } catch {}
  }, []);

  // Realtime WebSocket messages
  function onMessage(m: RiderWsMessage): void {
    if (m.t === "negotiation.counter") {
      setPhase((p) =>
        p.k === "matching"
          ? {
              ...p,
              counter: { negotiationId: m.negotiationId, paise: m.paise, round: m.round, expiresAt: m.expiresAt },
            }
          : p,
      );
      return;
    }
    if (m.t === "driver.assigned") {
      stopPoll();
      setTipPaise(0);
      setRated(false);
      setPhase({ k: "trip", trip: m.trip as unknown as TripView });
      return;
    }
    if (m.t === "trip.state" && m.state === "COMPLETED") {
      setPhase((p) => {
        if (p.k !== "trip") return p;
        void refreshCompleted(p.trip.id);
        return p;
      });
    }
  }
  useRiderSocket(onMessage);

  // Poll assigned trip for position & state
  useEffect(() => {
    if (phase.k !== "trip") return;
    const id = phase.trip.id;
    const iv = setInterval(() => {
      void getTrip(id)
        .then((t) => {
          setPhase((p) => {
            if (p.k !== "trip") return p;
            // GET /v1/trips/:id never includes the OTP (only the WS assignment does);
            // keep showing it instead of letting it vanish on the first poll
            const merged = { ...t, otp: t.otp ?? p.trip.otp };
            return merged.state === "COMPLETED" ? { k: "done", trip: merged } : { ...p, trip: merged };
          });
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(iv);
  }, [phase.k, phase.k === "trip" ? phase.trip.id : null]);

  // Polling safety net while matching
  useEffect(() => {
    if (phase.k !== "matching") return;
    const id = phase.session.sessionId;
    const iv = setInterval(() => {
      void fetch(`/v1/requests/${id}`, { headers: authHeaders() })
        .then((r) => r.json() as Promise<{ state?: string; trip?: { id: string } | null }>)
        .then(async (j) => {
          if (j.trip?.id && j.state === "AGREED") {
            stopPoll();
            const t = await getTrip(j.trip.id);
            setTipPaise(0);
            setRated(false);
            setPhase({ k: "trip", trip: t });
          }
          if (j.state === "EXPIRED" || j.state === "DECLINED" || j.state === "CANCELLED") {
            setPhase((p) =>
              p.k === "matching"
                ? { ...p, session: { ...p.session, state: j.state as RequestSessionView["state"] } }
                : p,
            );
          }
        })
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(iv);
  }, [phase.k, phase.k === "matching" ? phase.session.sessionId : null]);

  async function fetchQuotes(a: LatLon, b: LatLon): Promise<Quote[]> {
    const res = await fetch("/v1/quotes", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ pickup: a, drop: b }),
    });
    const json = (await res.json()) as { quotes?: Quote[] };
    if (!json.quotes || json.quotes.length === 0) throw new Error("No vehicle classes available here");
    return json.quotes;
  }

  async function onMapClick(ll: LatLon): Promise<void> {
    if (phase.k !== "pick" || loadingQuotes) return;
    setError(null);
    let nextPickup = pickup;
    let nextDrop = drop;
    if (!nextPickup || (nextPickup && nextDrop)) {
      setPickup(ll);
      setDrop(null);
      return;
    }
    nextDrop = ll;
    setDrop(ll);
    setLoadingQuotes(true);
    try {
      const quotes = await fetchQuotes(nextPickup!, nextDrop!);
      setPhase({ k: "quotes", quotes });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch quotes");
      setDrop(null);
    } finally {
      setLoadingQuotes(false);
    }
  }

  async function selectPopularRoute(route: typeof POPULAR_ROUTES[0]): Promise<void> {
    setPickup(route.pickup);
    setDrop(route.drop);
    setLoadingQuotes(true);
    setError(null);
    try {
      const quotes = await fetchQuotes(route.pickup, route.drop);
      setPhase({ k: "quotes", quotes });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch quotes");
    } finally {
      setLoadingQuotes(false);
    }
  }

  function reset(): void {
    stopPoll();
    setPickup(null);
    setDrop(null);
    setError(null);
    setRated(false);
    setTipPaise(0);
    setSelectedTag(null);
    setPhase({ k: "pick" });
  }

  async function onCounterResolved(outcome: "accepted" | "declined" | "final"): Promise<void> {
    if (outcome === "accepted") return;
    if (outcome === "declined") {
      setPhase((p) => (p.k === "matching" ? { ...p, counter: null } : p));
      return;
    }
    setPhase((p) => (p.k === "matching" ? { ...p, counter: null } : p));
  }

  const matchingSession = phase.k === "matching" ? phase.session : null;
  const secsLeft = useCountdown(matchingSession?.expiresAt);

  const driverPos: LatLon | null =
    phase.k === "trip" && phase.trip.driverLat != null && phase.trip.driverLng != null
      ? { lat: phase.trip.driverLat, lng: phase.trip.driverLng }
      : null;

  return (
    <div className="book-wrap">
      <MapView pickup={pickup} drop={drop} driver={driverPos} onMapClick={(ll) => void onMapClick(ll)} />

      <div className="side-panel">
        {error && (
          <div className="card panel-card">
            <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>
            <button className="btn-ghost" onClick={reset}>
              Start over
            </button>
          </div>
        )}

        {phase.k === "pick" && (
          <div className="card panel-card">
            <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800 }}>Where to?</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Tap map to set <strong>Pickup (P)</strong> then <strong>Drop (D)</strong>, or choose a quick route below.
            </p>

            <div className="step-label">Quick Popular Routes:</div>
            <div className="quick-places-row">
              {POPULAR_ROUTES.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  className="chip-place"
                  onClick={() => void selectPopularRoute(r)}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="step-label" style={{ marginTop: 6 }}>Payment method</div>
            <div className="row">
              {PAY_METHODS.map((pm) => (
                <button key={pm} className={`chip ${payMethod === pm ? "selected" : ""}`} onClick={() => setPayMethod(pm)}>
                  {pm === "UPI" ? "⚡ UPI" : pm === "WALLET" ? "💳 Wallet" : "💵 Cash"}
                </button>
              ))}
            </div>

            {loadingQuotes && <p className="muted" style={{ marginTop: 12 }}>⚡ Fetching real-time fares…</p>}
            {pickup && !drop && !loadingQuotes && (
              <div className="ok-text" style={{ marginTop: 12 }}>
                ✓ Pickup set! Now tap the map for your destination.
              </div>
            )}
          </div>
        )}

        {phase.k === "quotes" && (
          <div className="card panel-card">
            <h3 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800 }}>Choose Vehicle</h3>
            {phase.quotes.map((q) => (
              <button key={q.vehicleClass} className="quote-row" onClick={() => setPhase({ k: "offer", quote: q })}>
                <div className="quote-class">
                  <span style={{ fontSize: 20 }}>{vehicleIcon(q.vehicleClass)}</span>
                  <div>
                    <div>{vehicleLabel(q.vehicleClass)}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>
                      {q.distanceKm} km · ~{q.etaMin} min
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="quote-price">{formatINR(paisa(q.listPrice))}</div>
                  <div style={{ fontSize: 10.5, color: "var(--teal)", fontWeight: 700 }}>Negotiable</div>
                </div>
              </button>
            ))}
            <button className="btn-ghost" style={{ marginTop: 8, width: "100%" }} onClick={reset}>
              ← Change Route
            </button>
          </div>
        )}

        {phase.k === "offer" && (
          <OfferSheet
            quote={phase.quote}
            pickup={pickup!}
            drop={drop!}
            payMethod={payMethod}
            onClose={() => setPhase({ k: "quotes", quotes: lastQuotes.current })}
            onBooked={(session) => setPhase({ k: "matching", session, counter: null, quote: phase.quote })}
          />
        )}

        {phase.k === "matching" && (
          <div className="card panel-card">
            <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800 }}>
              {phase.session.mode === "NEGOTIATED" ? "⚡ Broadcasting Offer…" : "Finding Drivers…"}
            </h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              {phase.session.mode === "NEGOTIATED"
                ? `Your ${formatINR(paisa(Number(phase.session.currentOfferPaise ?? 0)))} offer is broadcasting to nearby drivers.`
                : "Broadcasting at list price."}
            </p>

            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.max(4, Math.min(100, ((secsLeft ?? 0) / MATCH_TOTAL_S) * 100))}%`,
                  transition: "width 1s linear",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)" }}>
              <span>Round {phase.session.round} of {phase.session.maxRounds}</span>
              <span>⏱ {secsLeft}s remaining</span>
            </div>

            {phase.counter && (
              <CounterModal
                counter={phase.counter}
                quote={phase.quote}
                vehicleClass={phase.quote?.vehicleClass ?? ""}
                onClose={() => setPhase((p) => (p.k === "matching" ? { ...p, counter: null } : p))}
                onResolved={(o) => void onCounterResolved(o)}
              />
            )}

            <button
              className="btn-danger"
              style={{ width: "100%", marginTop: 16 }}
              onClick={() => {
                void cancelRequest(phase.session.sessionId).then(reset);
              }}
            >
              Cancel Request
            </button>
          </div>
        )}

        {phase.k === "trip" && (
          <div className="card panel-card">
            <div className="spread" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{stateLabel(phase.trip.state)}</h3>
              <span className="pill">{vehicleLabel(phase.trip.vehicleClass)}</span>
            </div>

            <div className="driver-strip">
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{phase.trip.driverName || "Assigned Driver"}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  ★ {phase.trip.driverRating ? phase.trip.driverRating.toFixed(1) : "4.9"} · {phase.trip.driverPlate}
                </div>
              </div>
              <a
                className="btn-ghost"
                style={{ fontSize: 12, padding: "6px 12px" }}
                href={`https://www.google.com/maps/dir/?api=1&destination=${phase.trip.pickup.lat},${phase.trip.pickup.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                📍 Map
              </a>
            </div>

            {phase.trip.state !== "ONGOING" && !!phase.trip.otp && (
              <>
                <div className="step-label" style={{ textAlign: "center", color: "var(--teal)" }}>
                  Show this OTP to your driver to start:
                </div>
                <div className="otp-display">{phase.trip.otp}</div>
              </>
            )}

            <FareLines trip={phase.trip} />
          </div>
        )}

        {phase.k === "done" && (
          <div className="card panel-card">
            <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800 }}>Ride Completed!</h3>
            <FareLines trip={phase.trip} />

            {!rated ? (
              <>
                <div className="step-label" style={{ marginTop: 14 }}>
                  Add a Driver Tip?
                </div>
                <div className="row">
                  {[0, 1000, 2000, 5000].map((t) => (
                    <button key={t} className={`chip ${tipPaise === t ? "selected" : ""}`} onClick={() => setTipPaise(t)}>
                      {t === 0 ? "No tip" : `+${formatINR(paisa(t))}`}
                    </button>
                  ))}
                </div>

                <div className="step-label" style={{ marginTop: 14 }}>
                  Rate your experience:
                </div>
                <div className="stars">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      className="star"
                      aria-label={`${s} stars`}
                      onClick={() => {
                        void rateTrip(phase.trip.id, { stars: s, comment: selectedTag ?? undefined })
                          .then(() => setRated(true))
                          .catch((err) =>
                            setError(err instanceof Error ? err.message : "Could not record rating"),
                          );
                      }}
                    >
                      ★
                    </button>
                  ))}
                </div>

                <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {["Punctual Driver", "Clean Vehicle", "Polite & Safe", "Smooth Ride"].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={`chip ${selectedTag === tag ? "selected" : ""}`}
                      onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="ok-text" style={{ textAlign: "center", margin: "14px 0", fontSize: 14 }}>
                ✓ Thank you for rating your ride!
              </div>
            )}

            <button className="btn-primary" style={{ width: "100%", marginTop: 14 }} onClick={reset}>
              Book Another Ride
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FareLines({ trip }: { trip: TripView }): React.ReactElement {
  const f = trip.fareBreakdown;
  if (!f) return <></>;
  return (
    <div className="fare-box">
      <div className="fare-line">
        <span>Agreed Fare (100% to Driver)</span>
        <span style={{ fontWeight: 700 }}>{formatINR(paisa(f.agreedPaise))}</span>
      </div>
      <div className="fare-line muted">
        <span>
          Platform Fee{" "}
          <i className="info-dot" tabIndex={0}>
            ℹ
            <span className="info-tip">
              You can negotiate to zero — this fee keeps Chalo-X running: servers, support, insurance.
            </span>
          </i>
        </span>
        <span>{formatINR(paisa(f.platformFeePaise))}</span>
      </div>
      {(f.tipPaise ?? 0) > 0 && (
        <div className="fare-line">
          <span>Driver Tip</span>
          <span style={{ color: "var(--good)" }}>+{formatINR(paisa(f.tipPaise!))}</span>
        </div>
      )}
      <div className="fare-line fare-total">
        <span>Total Charged</span>
        <span>{formatINR(paisa(f.riderTotalPaise + (f.tipPaise ?? 0)))}</span>
      </div>
      {f.discountVsListPct > 0 && (
        <div className="ok-text" style={{ fontSize: 12 }}>
          ✓ You saved {f.discountVsListPct}% vs standard list fare!
        </div>
      )}
    </div>
  );
}
