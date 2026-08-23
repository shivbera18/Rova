import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLon, RiderWsMessage } from "@chalo/protocol";
import { formatINR, paisa } from "@chalo/protocol";
import MapView from "../components/MapView";
import OfferSheet, { vehicleLabel } from "../components/OfferSheet";
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
  | { k: "matching"; session: RequestSessionView; counter: DriverCounter | null }
  | { k: "trip"; trip: TripView }
  | { k: "done"; trip: TripView };

const PAY_METHODS = ["UPI", "WALLET", "CASH"] as const;
const MATCH_TOTAL_S = 120;

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
      return "Driver on the way";
    case "ARRIVED":
      return "Driver arrived";
    case "ONGOING":
      return "On your ride";
    case "COMPLETED":
      return "Completed";
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const routeRef = useRef<{ pickup: LatLon | null; drop: LatLon | null }>({ pickup: null, drop: null });
  const lastQuotes = useRef<Quote[]>([]);
  lastQuotes.current = phase.k === "quotes" ? phase.quotes : lastQuotes.current;
  routeRef.current = { pickup, drop };

  function stopPoll(): void {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }

  const refreshCompleted = useCallback(async (tripId: string): Promise<void> => {
    try {
      const t = await getTrip(tripId);
      if (t.state === "COMPLETED") setPhase({ k: "done", trip: t });
      else setPhase((p) => (p.k === "trip" ? { ...p, trip: t } : p));
    } catch {
      // transient — the poll loop retries
    }
  }, []);

  // ---- realtime: counters, assignment, trip state ----
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

  // ---- poll assigned trip for driver position + state ----
  useEffect(() => {
    if (phase.k !== "trip") return;
    const id = phase.trip.id;
    const iv = setInterval(() => {
      void getTrip(id)
        .then((t) => {
          setPhase((p) => (p.k === "trip" ? { ...p, trip: t } : p));
          if (t.state === "COMPLETED") setPhase({ k: "done", trip: t });
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(iv);
  }, [phase.k, phase.k === "trip" ? phase.trip.id : null]);

  // ---- map click flow ----
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

  async function bookAtList(quote: Quote): Promise<void> {
    const route = routeRef.current;
    if (!route.pickup || !route.drop) throw new Error("route lost");
    const res = await fetch("/v1/requests", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        quoteToken: quote.quoteToken,
        vehicleClass: quote.vehicleClass,
        paymentMethod: payMethod,
        pickup: route.pickup,
        drop: route.drop,
      }),
    });
    const session = (await res.json()) as RequestSessionView;
    setPhase({ k: "matching", session, counter: null });
  }

  function reset(): void {
    stopPoll();
    setPickup(null);
    setDrop(null);
    setError(null);
    setRated(false);
    setTipPaise(0);
    setPhase({ k: "pick" });
  }

  async function onCounterResolved(outcome: "accepted" | "declined" | "final"): Promise<void> {
    if (outcome === "accepted") {
      // driver.assigned push flips the phase; keep panel until then
      return;
    }
    if (outcome === "declined") {
      // negotiation dead → honest fallback: book at list price
      setPhase((p) => (p.k === "matching" && !p.session.negotiationId ? p : p));
      try {
        const route = routeRef.current;
        if (!route.pickup || !route.drop) return;
        const quotes = await fetchQuotes(route.pickup, route.drop);
        const sameClass =
          phase.k === "matching"
            ? quotes.find((q) => q.vehicleClass === (phase.session as RequestSessionView & { vehicleClass?: string }).vehicleClass)
            : undefined;
        await bookAtList(sameClass ?? quotes[0]!);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not re-book at list price");
      }
      return;
    }
    // final offer sent — matching continues server-side
    setPhase((p) => (p.k === "matching" ? { ...p, counter: null } : p));
  }

  const matchingSession = phase.k === "matching" ? phase.session : null;
  const secsLeft = useCountdown(matchingSession?.expiresAt);
  void secsLeft;


  // safety net: if the driver.assigned push is missed (reload, reconnect), polling recovers
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
            <div className="error-text">{error}</div>
            <button className="btn-ghost" onClick={reset}>
              Start over
            </button>
          </div>
        )}

        {phase.k === "pick" && (
          <div className="card panel-card">
            <h3 style={{ margin: "0 0 6px" }}>Where to?</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Tap the map: first tap sets <strong>pickup</strong>, second sets <strong>drop</strong>.
            </p>
            <div className="step-label">Payment method</div>
            <div className="row">
              {PAY_METHODS.map((pm) => (
                <button key={pm} className={`chip ${payMethod === pm ? "selected" : ""}`} onClick={() => setPayMethod(pm)}>
                  {pm}
                </button>
              ))}
            </div>
            {loadingQuotes && <p className="muted">Fetching fares…</p>}
            {pickup && !drop && !loadingQuotes && <p className="muted">Now tap your destination.</p>}
          </div>
        )}

        {phase.k === "quotes" && (
          <div className="card panel-card">
            <h3 style={{ margin: "0 0 10px" }}>Choose a ride</h3>
            {phase.quotes.map((q) => (
              <button key={q.vehicleClass} className="quote-row" onClick={() => setPhase({ k: "offer", quote: q })}>
                <span className="quote-class">{vehicleLabel(q.vehicleClass)}</span>
                <span className="muted">
                  {q.distanceKm} km · ~{q.etaMin} min
                </span>
                <span className="quote-price">{formatINR(paisa(q.listPrice))}</span>
              </button>
            ))}
            <button className="btn-ghost" style={{ marginTop: 8 }} onClick={reset}>
              Change route
            </button>
          </div>
        )}

        {phase.k === "offer" && (
          <OfferSheet
            quote={phase.quote}
            pickup={pickup!}
            drop={drop!}
            payMethod={payMethod}
            onClose={() => {
              if (phase.k === "offer") setPhase({ k: "quotes", quotes: lastQuotes.current });
            }}
            onBooked={(session) => setPhase({ k: "matching", session, counter: null })}
          />
        )}

        {phase.k === "matching" && (
          <div className="card panel-card">
            <h3 style={{ margin: "0 0 4px" }}>
              {phase.session.mode === "NEGOTIATED" ? "Negotiating…" : "Finding drivers…"}
            </h3>
            <p className="muted" style={{ marginTop: 0 }}>
              {phase.session.mode === "NEGOTIATED"
                ? `Your ${formatINR(paisa(Number(phase.session.currentOfferPaise ?? 0)))} offer is with nearby drivers.`
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
            <div className="muted">
              Round {phase.session.round} of {phase.session.maxRounds}
            </div>

            {phase.counter && (
              <CounterModal
                counter={phase.counter}
                quote={null}
                vehicleClass=""
                onClose={() => setPhase((p) => (p.k === "matching" ? { ...p, counter: null } : p))}
                onResolved={(o) => void onCounterResolved(o)}
              />
            )}

            <button
              className="btn-danger"
              style={{ width: "100%", marginTop: 12 }}
              onClick={() => {
                void cancelRequest(phase.session.sessionId).then(reset);
              }}
            >
              Cancel request
            </button>
          </div>
        )}

        {phase.k === "trip" && (
          <div className="card panel-card">
            <div className="spread">
              <h3 style={{ margin: 0 }}>{stateLabel(phase.trip.state)}</h3>
              <span className="pill">{vehicleLabel(phase.trip.vehicleClass)}</span>
            </div>
            <div className="driver-strip">
              <div>
                <div style={{ fontWeight: 700 }}>{phase.trip.driverName || "Your driver"}</div>
                <div className="muted">
                  ★ {phase.trip.driverRating ?? "—"} · {phase.trip.driverPlate}
                </div>
              </div>
              <a
                className="btn-ghost"
                href={`https://www.google.com/maps/dir/?api=1&destination=${phase.trip.pickup.lat},${phase.trip.pickup.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                Navigate
              </a>
            </div>
            {phase.trip.state !== "ONGOING" && !!phase.trip.otp && (
              <>
                <div className="step-label">Show this OTP to start</div>
                <div className="otp-display">{phase.trip.otp}</div>
              </>
            )}
            <FareLines trip={phase.trip} />
          </div>
        )}

        {phase.k === "done" && (
          <div className="card panel-card">
            <h3 style={{ margin: "0 0 6px" }}>Ride complete</h3>
            <FareLines trip={phase.trip} />
            {!rated ? (
              <>
                <div className="step-label" style={{ marginTop: 12 }}>
                  Rate your driver
                </div>
                <div className="row stars">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      className="star"
                      aria-label={`${s} stars`}
                      disabled={tipPaise < 0}
                      onClick={() => {
                        void rateTrip(phase.trip.id, { stars: s })
                          .then(() => setRated(true))
                          .catch(() => setError("Rating failed — already rated?"));
                      }}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="ok-text">Thanks — rated!</p>
            )}
            <button className="btn-primary" style={{ width: "100%", marginTop: 12 }} onClick={reset}>
              Book another ride
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
        <span>Agreed fare (driver gets it in full)</span>
        <span>{formatINR(paisa(f.agreedPaise))}</span>
      </div>
      <div className="fare-line muted">
        <span>
          Platform fee{" "}
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
          <span>Tip</span>
          <span>{formatINR(paisa(f.tipPaise!))}</span>
        </div>
      )}
      <div className="fare-line fare-total">
        <span>Total charged</span>
        <span>{formatINR(paisa(f.riderTotalPaise + (f.tipPaise ?? 0)))}</span>
      </div>
      {f.discountVsListPct > 0 && <div className="ok-text">You saved {f.discountVsListPct}% vs list price</div>}
    </div>
  );
}
