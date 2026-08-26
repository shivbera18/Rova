import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLon, RiderWsMessage } from "@chalo/protocol";
import { distanceKm } from "@chalo/protocol";
import { formatINR, paisa } from "@chalo/protocol";
import {
  ArrowUpRight,
  Banknote,
  CircleCheck,
  Clock,
  Heart,
  KeyRound,
  LocateFixed,
  Radar,
  RefreshCw,
  Rocket,
  Star,
  Timer,
  TriangleAlert,
  Wallet as WalletIcon,
  Zap,
} from "lucide-react";
import MapView from "../components/MapView";
import OfferSheet, { vehicleLabel, vehicleIcon } from "../components/OfferSheet";
import { LocationSearch, type SelectedPlace } from "../components/LocationSearch";
import CounterModal, { type DriverCounter } from "../components/CounterModal";
import { useCountdown, useRiderSocket } from "../ws";
import { NeoCard, NeoButton, NeoBadge, NeoInput } from "../components/NeoComponents";
import {
  addTripTip,
  ApiError,
  cancelMatchedTrip,
  cancelRequest,
  getFavorites,
  getTrip,
  getToken,
  getWallet,
  listTrips,
  rateTrip,
  regenerateTripOtp,
  toggleFavorite,
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

const ACTIVE_TRIP_STATES = ["DRIVER_ASSIGNED", "ARRIVING", "ARRIVED", "ONGOING"];

/** Start-code block: shows the digits only while they can actually be used. */
function StartCodeBlock({
  otp,
  expiresInMs,
  attemptsLeft,
  windowOpensOnArrival,
  onRegenerate,
}: {
  otp: string;
  expiresInMs?: number;
  attemptsLeft?: number;
  windowOpensOnArrival?: boolean;
  onRegenerate: () => void;
}): React.ReactElement {
  const [remaining, setRemaining] = useState<number | null>(expiresInMs ?? null);
  useEffect(() => {
    if (expiresInMs == null) {
      setRemaining(null);
      return;
    }
    const deadline = performance.now() + expiresInMs;
    let iv: ReturnType<typeof setInterval> | null = null;
    const tick = (): void => {
      const ms = Math.max(0, deadline - performance.now());
      setRemaining(ms);
      if (ms === 0 && iv) clearInterval(iv);
    };
    tick();
    iv = setInterval(tick, 1000);
    return () => {
      if (iv) clearInterval(iv);
    };
  }, [expiresInMs]);

  const expired = remaining != null && remaining <= 0;
  const locked = attemptsLeft === 0;

  // A stale code that the server will always reject must not stay on screen —
  // people read the digits, not the caveat underneath them.
  if (expired || locked) {
    return (
      <div className="otp-display" style={{ borderColor: "#b91c1c" }} role="status">
        <div className="row" style={{ justifyContent: "center", gap: 5, fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#b91c1c" }}>
          <KeyRound size={12} /> {locked ? "Code locked" : "Code expired"}
        </div>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "6px 0 8px" }}>
          {locked
            ? "Three wrong tries were entered. Generate a new code for your driver."
            : "Your start code timed out. Generate a new one for your driver."}
        </p>
        <NeoButton variant="primary" size="sm" onClick={onRegenerate}>
          <RefreshCw size={14} /> Show new start code
        </NeoButton>
      </div>
    );
  }

  const mmss =
    remaining == null
      ? null
      : `${Math.floor(remaining / 60000)}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")}`;

  return (
    <div className="otp-display">
      <div className="row" style={{ justifyContent: "center", gap: 5, fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--primary)" }}>
        <KeyRound size={12} /> Start OTP for Driver
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 900, letterSpacing: "0.15em", color: "var(--ink)" }}>
        {otp}
      </div>
      {mmss ? (
        <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--ink-muted)" }}>
          <span aria-hidden>Valid for {mmss}</span>
          {attemptsLeft != null ? <span> · {attemptsLeft} tries left</span> : null}
        </div>
      ) : windowOpensOnArrival ? (
        <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--ink-muted)" }}>
          Your driver will ask for this at pickup
        </div>
      ) : null}
    </div>
  );
}

/** One-tap "save this driver" — idempotent server-side, safe to tap twice. */
function SaveDriverButton({
  driverId,
  driverName,
  onError,
  onSaved,
}: {
  driverId: string;
  driverName: string;
  onError: (msg: string) => void;
  onSaved?: () => void;
}): React.ReactElement {
  const [saved, setSaved] = useState(false);
  const first = (driverName || "Driver").split(" ")[0] || "Driver";
  return saved ? (
    <div className="ok-text">
      <CircleCheck size={14} /> {first} saved — find them under “Ride again”
    </div>
  ) : (
    <NeoButton
      variant="white"
      size="sm"
      onClick={() => {
        void toggleFavorite(driverId, true)
          .then(() => {
            setSaved(true);
            onSaved?.();
          })
          .catch(() => onError("Could not save driver"));
      }}
    >
      <Heart size={14} /> Save {first} for next time
    </NeoButton>
  );
}

interface FavoriteDriver {
  id: string;
  name: string;
  vehicleClass: string | null;
  plate: string | null;
  rating: number;
}

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
const POPULAR_ROUTES: Array<{ from: string; to: string; pickup: LatLon; drop: LatLon }> = [
  {
    from: "Koramangala",
    to: "Jayanagar",
    pickup: { lat: 12.9352, lng: 77.6245 },
    drop: { lat: 12.9308, lng: 77.5838 },
  },
  {
    from: "Koramangala",
    to: "Indiranagar",
    pickup: { lat: 12.9352, lng: 77.6245 },
    drop: { lat: 12.9784, lng: 77.6408 },
  },
  {
    from: "MG Road",
    to: "HSR Layout",
    pickup: { lat: 12.9757, lng: 77.6068 },
    drop: { lat: 12.9116, lng: 77.6474 },
  },
  {
    from: "Indiranagar",
    to: "Airport",
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

const PRE_START_STATES = ["DRIVER_ASSIGNED", "ARRIVING", "ARRIVED"];

/** Honest straight-line estimate at a typical city speed; null when unknowable. */
function pickupEtaMin(trip: TripView, livePos: LatLon | null): number | null {
  if (!PRE_START_STATES.includes(trip.state)) return null;
  const pos = livePos ?? (trip.driverLat != null && trip.driverLng != null ? { lat: trip.driverLat, lng: trip.driverLng } : null);
  if (!pos) return null;
  const km = distanceKm(pos, trip.pickup);
  if (!Number.isFinite(km) || km > 40) return null;
  return Math.max(1, Math.round((km / 22) * 60));
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
  const [recentRoutes, setRecentRoutes] = useState<StoredRoute[]>(() => readRoutes("chalox.recentRoutes"));
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [activeDriverCounter, setActiveDriverCounter] = useState<DriverCounter | null>(null);
  const [rated, setRated] = useState(false);
  const [ratingVal, setRatingVal] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const [tipPaise, setTipPaise] = useState(0);
  const [tipDone, setTipDone] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<FavoriteDriver[]>([]);
  const [favDriver, setFavDriver] = useState<FavoriteDriver | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [sheetCollapsed, setSheetCollapsed] = useState(false);

  // New booking stage always deserves the rider's attention: raise the sheet.
  useEffect(() => {
    setSheetCollapsed(false);
  }, [phase.k]);

  useEffect(() => {
    void getWallet()
      .then((w) => setWalletBalance(w.balancePaise))
      .catch(() => undefined);
  }, []);

  // Favourite drivers power one-tap "ride again" direct requests.
  useEffect(() => {
    void getFavorites()
      .then((res) => setFavorites(res.favorites))
      .catch(() => undefined);
  }, []);

  // Reload recovery: an in-flight trip must survive a page refresh.
  useEffect(() => {
    let stale = false;
    void (async () => {
      try {
        const { trips } = await listTrips();
        const active = trips.find((t) => ACTIVE_TRIP_STATES.includes(t.state));
        if (!active || stale) return;
        const full = await getTrip(active.id);
        if (stale || !ACTIVE_TRIP_STATES.includes(full.state)) return;
        if (full.myRatingStars != null) setRated(true);
        setLiveDriverPos(
          full.driverLat != null && full.driverLng != null
            ? { lat: full.driverLat, lng: full.driverLng }
            : null,
        );
        // tripView omits the OTP by design. Re-issue one only while the driver is
        // still en route — never at the pickup, where rotating the code would
        // reset a window the driver is actively typing into.
        const reissue =
          PRE_START_STATES.includes(full.state) && full.state !== "ARRIVED"
            ? await regenerateTripOtp(full.id).catch(() => undefined)
            : undefined;
        setPhase({
          k: "trip",
          trip: reissue
            ? {
                ...full,
                otp: reissue.otp,
                otpExpiresAt: reissue.otpExpiresAt,
                otpExpiresInMs: reissue.otpExpiresInMs,
                otpAttemptsLeft: reissue.otpAttemptsLeft,
                otpAttemptsMax: reissue.otpAttemptsMax,
              }
            : full,
        });
      } catch {
        // stay on the booking sheet; the user can book normally
      }
    })();
    return () => {
      stale = true;
    };
  }, []);

  async function handleTopUp(): Promise<void> {
    try {
      const w = await topUpWallet(50_000);
      setWalletBalance(w.balancePaise);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Top-up failed");
    }
  }

  const handleWsMessage = useCallback((msg: RiderWsMessage) => {
    if (msg.t === "request.updated") {
      setPhase((prev) => {
        if (prev.k !== "matching") return prev;
        return { ...prev, session: msg.session as unknown as RequestSessionView };
      });
    } else if (msg.t === "negotiation.counter") {
      setActiveDriverCounter({
        negotiationId: msg.negotiationId,
        paise: msg.paise,
        round: msg.round,
        expiresAt: msg.expiresAt,
      });
      setShowCounterModal(true);
    } else if (msg.t === "driver.assigned") {
      setShowCounterModal(false);
      setActiveDriverCounter(null);
      setTipPaise(0);
      setTipDone(false);
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

  // Real class/fee for the counter dialog; never fall back to fabricated values.
  const liveNegotiation = phase.k === "matching" ? phase : null;
  const liveVehicleClass = liveNegotiation?.quote?.vehicleClass;
  const livePlatformPaise =
    liveNegotiation?.session.platformFeePaise ?? liveNegotiation?.quote?.platformFeePaise;

  // Matching lifecycle: countdown + expiry detection drive the radar card.
  const matchSession = phase.k === "matching" ? phase.session : null;
  const matchSecs = useCountdown(matchSession?.expiresAt);
  const matchExpired =
    !!matchSession && (matchSession.state === "EXPIRED" || (matchSecs ?? 1) <= 0);

  const etaMin = phase.k === "trip" ? pickupEtaMin(phase.trip, liveDriverPos) : null;

  async function searchAgain(): Promise<void> {
    if (!pickup || !drop || loadingQuotes) return;
    await loadQuotesForRoute(pickup, drop);
  }

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
          if (t.myRatingStars != null) setRated(true);
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
    const token = getToken();
    const res = await fetch("/v1/quotes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
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
    setPickup(route.pickup);
    setPickupLabel(route.from);
    setDrop(route.drop);
    setDropLabel(route.to);
    rememberRecent(route.pickup, route.drop, route.from, route.to);
    await loadQuotesForRoute(route.pickup, route.drop);
  }

  async function confirmCancelTrip(): Promise<void> {
    if (phase.k !== "trip") return;
    try {
      await cancelMatchedTrip(phase.trip.id);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel the trip");
    } finally {
      setShowCancelConfirm(false);
    }
  }

  async function handleRegenerateOtp(): Promise<void> {
    if (phase.k !== "trip") return;
    try {
      const fresh = await regenerateTripOtp(phase.trip.id);
      setPhase((p) =>
        p.k === "trip"
          ? {
              ...p,
              trip: {
                ...p.trip,
                otp: fresh.otp,
                otpExpiresAt: fresh.otpExpiresAt,
                otpExpiresInMs: fresh.otpExpiresInMs,
                otpAttemptsLeft: fresh.otpAttemptsLeft,
                otpAttemptsMax: fresh.otpAttemptsMax,
              },
            }
          : p,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a new code");
    }
  }

  async function submitRating(): Promise<void> {
    if (phase.k !== "done") return;
    try {
      await rateTrip(phase.trip.id, { stars: ratingVal, comment: ratingComment.trim() || undefined });
      setRated(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "ALREADY_RATED") {
        setRated(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not submit your rating");
    }
  }

  async function submitTip(): Promise<void> {
    if (phase.k !== "done" || tipPaise <= 0) return;
    try {
      await addTripTip(phase.trip.id, tipPaise);
      setTipDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "TIP_ALREADY_SET") {
        setTipDone(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not add your tip");
    }
  }

  function reset(): void {
    stopPoll();
    localStorage.removeItem("chalox.rider.trip");
    setPickup(null);
    setPickupLabel("");
    setDrop(null);
    setDropLabel("");
    setFavDriver(null);
    setError(null);
    setPhase({ k: "pick" });
  }

  // Remember the in-flight trip so the safety centre can share its live link.
  useEffect(() => {
    if ((phase.k === "trip" || phase.k === "done") && !["CANCELLED_RIDER", "CANCELLED_DRIVER"].includes(phase.trip.state)) {
      localStorage.setItem(
        "chalox.rider.trip",
        JSON.stringify({ id: phase.trip.id, state: phase.trip.state }),
      );
    } else {
      // cancelled/finished rides must not linger as shareable "live" trips
      localStorage.removeItem("chalox.rider.trip");
    }
  }, [phase]);

  return (
    <div className="book-wrap">
      {!wsConnected && (
        <div className="connection-banner">
          <TriangleAlert size={14} />
          <span>Live updates reconnecting — fares may be stale</span>
        </div>
      )}

      <div className="map-layer">
        <MapView
          pickup={pickup}
          drop={drop}
          driver={liveDriverPos}
          onMapClick={onMapClick}
        />
      </div>

      <div className={`side-panel${sheetCollapsed ? " collapsed" : ""}`}>
        <button
          type="button"
          className="sheet-handle"
          aria-label={sheetCollapsed ? "Expand trip panel" : "Collapse trip panel"}
          aria-expanded={!sheetCollapsed}
          onClick={() => setSheetCollapsed((v) => !v)}
          onPointerDown={(e) => {
            const startY = e.clientY;
            let moved = 0;
            const onMove = (ev: PointerEvent): void => { moved = ev.clientY - startY; };
            const onUp = (): void => {
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
              if (Math.abs(moved) > 32) setSheetCollapsed(moved > 0);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
          }}
        >
          <span className="sheet-grip" />
        </button>

        <div className="sheet-body">
        {error && (
          <div className="error-text" style={{ marginBottom: 12 }} role="alert">
            <TriangleAlert size={14} /> {error}
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
              <LocateFixed size={15} /> Use my current location
            </button>

            {favorites.length > 0 && (
              <>
                <div className="booking-divider"><span>RIDE AGAIN</span></div>
                <div className="quick-places-row" role="radiogroup" aria-label="Favourite drivers">
                  {favorites.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      role="radio"
                      aria-checked={favDriver?.id === f.id}
                      className={`saved-route ${favDriver?.id === f.id ? "selected" : ""}`}
                      onClick={() => setFavDriver((cur) => (cur?.id === f.id ? null : f))}
                    >
                      <Heart size={14} fill={favDriver?.id === f.id ? "currentColor" : "none"} />
                      <small>{`${(f.name || "Driver").split(" ")[0] || "Driver"} · ${vehicleLabel(f.vehicleClass ?? "BIKE")}`}</small>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="booking-divider"><span>POPULAR ROUTES</span></div>
            <div className="quick-places-row">
              {POPULAR_ROUTES.map((r) => (
                <button key={`${r.from}-${r.to}`} type="button" className="saved-route" onClick={() => void selectPopularRoute(r)}>
                  <ArrowUpRight size={14} />
                  <small>{`${r.from} → ${r.to}`}</small>
                </button>
              ))}
            </div>

            {recentRoutes.length > 0 && (
              <>
                <div className="booking-divider"><span>RECENT</span></div>
                <div className="quick-places-row">
                  {recentRoutes.slice(0, 3).map((route) => (
                    <button key={route.id} type="button" className="saved-route" onClick={() => void selectStoredRoute(route)}>
                      <Clock size={14} />
                      <small>{route.label}</small>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="booking-options">
              <div style={{ width: "100%" }}>
                <span className="option-label">PAYMENT METHOD</span>
                <div className="payment-group">
                  {PAY_METHODS.map((pm) => {
                    const Icon = pm === "UPI" ? Zap : pm === "WALLET" ? WalletIcon : Banknote;
                    return (
                      <button
                        key={pm}
                        className={`payment-pill ${payMethod === pm ? "selected" : ""}`}
                        onClick={() => setPayMethod(pm)}
                      >
                        <Icon size={13} /> {pm === "WALLET" ? "Wallet" : pm}
                      </button>
                    );
                  })}
                </div>
                {payMethod === "WALLET" && (
                  <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-muted)" }}>
                      Balance: {walletBalance !== null ? formatINR(paisa(walletBalance)) : "…"}
                    </span>
                    {import.meta.env.DEV && (
                      <button
                        type="button"
                        className="use-location-btn"
                        style={{ padding: "4px 12px", width: "auto" }}
                        onClick={() => void handleTopUp()}
                      >
                        + Add ₹500 (dev)
                      </button>
                    )}
                  </div>
                )}
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
              {phase.quotes.map((q) => {
                const QIcon = vehicleIcon(q.vehicleClass);
                return (
                  <div
                    key={q.vehicleClass}
                    className="quote-row"
                    onClick={() => setPhase({ k: "offer", quote: q })}
                  >
                    <div className="quote-class">
                      <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, border: "var(--brut-border-thin)", borderRadius: "var(--radius-sm)", background: "var(--paper-subtle)" }}>
                        <QIcon size={20} strokeWidth={2.2} />
                      </span>
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
                );
              })}
            </div>
          </NeoCard>
        )}

        {/* Phase 3: Offer Builder Sheet */}
        {phase.k === "offer" && pickup && drop && (
          <OfferSheet
            quote={phase.quote}
            pickup={pickup}
            drop={drop}
            pickupLabel={pickupLabel}
            dropLabel={dropLabel}
            favoriteDriverId={favDriver?.id ?? null}
            payMethod={payMethod}
            walletBalance={walletBalance}
            onClose={() => setPhase({ k: "quotes", quotes: [phase.quote] })}
            onBooked={(session) => {
              setPhase({ k: "matching", session, counter: null, quote: phase.quote });
            }}
          />
        )}

        {/* Phase 4: Matching Status Card */}
        {phase.k === "matching" && !matchExpired && (
          <NeoCard elevation="md" style={{ padding: 22 }}>
            <div className="spread" style={{ marginBottom: 12 }}>
              <span className="eyebrow"><Radar size={13} style={{ verticalAlign: -2 }} /> RADAR ACTIVE</span>
              <NeoBadge variant={matchSecs !== null && matchSecs <= 10 ? "red" : "green"}>
                {matchSecs !== null ? (
                  <span className="row" style={{ gap: 4, alignItems: "center" }}>
                    <Timer size={12} /> {matchSecs}s
                  </span>
                ) : "SEARCHING"}
              </NeoBadge>
            </div>
            <h3 style={{ fontSize: 20, marginBottom: 6 }}>Connecting With Drivers...</h3>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 16 }}>
              Broadcasting your offer to nearby verified drivers.
              {phase.session.mode === "NEGOTIATED" &&
                ` Round ${phase.session.round} of ${phase.session.maxRounds}.`}
            </p>

            <div className="progress-track" style={{ marginBottom: 16 }}>
              <div className="progress-fill" style={{ width: "100%", animation: "brut-pulse 1.5s infinite" }} />
            </div>

            <NeoButton
              variant="red"
              fullWidth
              onClick={() => {
                if (phase.k !== "matching") return;
                void (async () => {
                  try {
                    await cancelRequest(phase.session.sessionId);
                    reset();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not cancel — still matching");
                  }
                })();
              }}
            >
              Cancel Request
            </NeoButton>
          </NeoCard>
        )}

        {/* Phase 4b: Matching Expired — offer recovery instead of a dead end */}
        {phase.k === "matching" && matchExpired && (
          <NeoCard elevation="md" style={{ padding: 22 }}>
            <div className="spread" style={{ marginBottom: 12 }}>
              <span className="eyebrow">NO TAKERS YET</span>
              <NeoBadge variant="red">EXPIRED</NeoBadge>
            </div>
            <h3 style={{ fontSize: 20, marginBottom: 6 }}>No driver accepted your offer</h3>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 16 }}>
              Try a higher driver amount or check nearby fares again — prices shift with demand.
            </p>

            <div className="col" style={{ gap: 10 }}>
              <NeoButton variant="primary" fullWidth disabled={loadingQuotes} onClick={() => void searchAgain()}>
                {loadingQuotes ? "Checking fares..." : "Search Again"}
              </NeoButton>
              <NeoButton variant="white" fullWidth onClick={reset}>
                Change Route
              </NeoButton>
            </div>
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
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                  <Star size={11} fill="currentColor" /> {phase.trip.driverRating != null ? phase.trip.driverRating.toFixed(1) : "—"} · pays via {phase.trip.paymentMethod ?? "UPI"}
                </div>
              </div>
              {phase.trip.driverPlate && (
                <span className="plate-chip">{phase.trip.driverPlate}</span>
              )}
            </div>

            <h3 style={{ fontSize: 20, margin: "12px 0 8px" }}>{stateLabel(phase.trip.state)}</h3>

            {etaMin !== null && (
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)", marginBottom: 8 }}>
                About {etaMin} min from pickup
              </p>
            )}

            {phase.trip.otp && (
              <StartCodeBlock
                otp={phase.trip.otp}
                expiresInMs={phase.trip.otpExpiresInMs}
                attemptsLeft={phase.trip.otpAttemptsLeft}
                windowOpensOnArrival={phase.trip.otpWindowOpensOnArrival}
                onRegenerate={() => void handleRegenerateOtp()}
              />
            )}

            {PRE_START_STATES.includes(phase.trip.state) && (
              <button
                type="button"
                className="use-location-btn"
                style={{ marginTop: phase.trip.otp ? 0 : 12 }}
                onClick={() => void handleRegenerateOtp()}
              >
                <RefreshCw size={14} /> Show new start code
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

            {PRE_START_STATES.includes(phase.trip.state) && (
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

            {/* Receipt — printable via the browser's Save-as-PDF */}
            <div className="booking-divider"><span>RECEIPT</span></div>
            {phase.trip.driverId && phase.trip.state === "COMPLETED" && (
              <div style={{ marginBottom: 12 }}>
                <SaveDriverButton
                  driverId={phase.trip.driverId}
                  driverName={phase.trip.driverName ?? "this driver"}
                  onError={setError}
                  onSaved={() => {
                    void getFavorites()
                      .then((res) => setFavorites(res.favorites))
                      .catch(() => undefined);
                  }}
                />
              </div>
            )}
            <div className="print-area" style={{ fontSize: 12.5 }}>
              <div className="spread" style={{ marginBottom: 6 }}>
                <strong style={{ fontFamily: "var(--font-display)" }}>Chalo-X Ride Invoice</strong>
                <span style={{ color: "var(--ink-muted)" }}>#{phase.trip.id.slice(0, 8).toUpperCase()}</span>
              </div>
              {(pickupLabel || dropLabel) && (
                <p style={{ color: "var(--ink-soft)", marginBottom: 6 }}>
                  {pickupLabel ?? "Pickup"} → {dropLabel ?? "Drop"}
                </p>
              )}
              {phase.trip.startedAt && (
                <div className="spread">
                  <span style={{ color: "var(--ink-muted)" }}>Started</span>
                  <span>{new Date(phase.trip.startedAt).toLocaleString()}</span>
                </div>
              )}
              {phase.trip.endedAt ? (
                <div className="spread">
                  <span style={{ color: "var(--ink-muted)" }}>Completed</span>
                  <span>{new Date(phase.trip.endedAt).toLocaleString()}</span>
                </div>
              ) : (
                <div className="spread">
                  <span style={{ color: "var(--ink-muted)" }}>Booked</span>
                  <span>{new Date().toLocaleString()}</span>
                </div>
              )}
              <div className="spread" style={{ marginTop: 6 }}>
                <span style={{ color: "var(--ink-muted)" }}>Payment method</span>
                <span>{phase.trip.paymentMethod ?? "UPI"}</span>
              </div>
              <hr style={{ border: "none", borderTop: "1px dashed var(--ink-muted)", margin: "8px 0" }} />
              <div className="spread">
                <span>Ride fare</span>
                <span>{formatINR(paisa(phase.trip.fareBreakdown.agreedPaise))}</span>
              </div>
              {phase.trip.fareBreakdown.platformFeePaise > 0 && (
                <div className="spread">
                  <span>Platform fee</span>
                  <span>{formatINR(paisa(phase.trip.fareBreakdown.platformFeePaise))}</span>
                </div>
              )}
              {(phase.trip.fareBreakdown.tipPaise ?? 0) > 0 && (
                <div className="spread">
                  <span>Driver tip</span>
                  <span>{formatINR(paisa(phase.trip.fareBreakdown.tipPaise!))}</span>
                </div>
              )}
              <div className="spread" style={{ fontWeight: 800, marginTop: 4 }}>
                <span>Total</span>
                <span>{formatINR(paisa(phase.trip.fareBreakdown.riderTotalPaise))}</span>
              </div>
            </div>
            <NeoButton
              variant="white"
              size="sm"
              onClick={() => window.print()}
              aria-label="Print or save this receipt as PDF"
            >
              Print / Save PDF
            </NeoButton>

            <div className="booking-divider"><span>RATE YOUR DRIVER</span></div>
            {rated ? (
              <div className="ok-text" style={{ marginBottom: 14 }}>
                <CircleCheck size={14} /> Thanks — your rating helps other riders
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <div className="star-row" role="radiogroup" aria-label="Driver rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={ratingVal === n}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                      className={`star-btn ${n <= ratingVal ? "on" : ""}`}
                      onClick={() => setRatingVal(n)}
                    >
                      <Star size={20} fill={n <= ratingVal ? "currentColor" : "none"} />
                    </button>
                  ))}
                </div>
                <NeoInput
                  label="Add a note (optional)"
                  placeholder="How was the ride?"
                  value={ratingComment}
                  maxLength={280}
                  onChange={(e) => setRatingComment(e.target.value)}
                />
                <NeoButton variant="primary" fullWidth onClick={() => void submitRating()}>
                  Submit {ratingVal}-star rating
                </NeoButton>
              </div>
            )}

            <div className="booking-divider"><span>ADD A TIP</span></div>
            {tipDone ? (
              <div className="ok-text" style={{ marginBottom: 14 }}>
                <CircleCheck size={14} /> Tip sent — 100% goes to your driver
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <div className="row" style={{ gap: 8, justifyContent: "center", marginBottom: 10 }}>
                  {[1000, 2000, 5000].map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`payment-pill ${tipPaise === p ? "selected" : ""}`}
                      aria-pressed={tipPaise === p}
                      onClick={() => setTipPaise((cur) => (cur === p ? 0 : p))}
                    >
                      +₹{p / 100}
                    </button>
                  ))}
                </div>
                <NeoButton
                  variant="accent"
                  fullWidth
                  disabled={tipPaise === 0}
                  onClick={() => void submitTip()}
                >
                  {tipPaise === 0 ? "Pick a tip amount" : `Send ${formatINR(paisa(tipPaise))} tip`}
                </NeoButton>
              </div>
            )}

            <NeoButton variant={rated ? "primary" : "white"} fullWidth onClick={reset}>
              <Rocket size={15} /> Book Another Ride
            </NeoButton>
          </NeoCard>
        )}
        </div>
      </div>

      {showCounterModal && activeDriverCounter && (
        <CounterModal
          counter={activeDriverCounter}
          vehicleClass={liveVehicleClass ?? ""}
          platformFeePaise={livePlatformPaise}
          onAccept={() => setShowCounterModal(false)}
          onFinalOffer={() => setShowCounterModal(false)}
          onDecline={() => setShowCounterModal(false)}
        />
      )}
    </div>
  );
}
