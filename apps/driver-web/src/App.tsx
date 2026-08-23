import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { formatINR, paisa, type LatLon } from "@chalo/protocol";
import { connectDriverSocket, getToken, api, type DriverSocket, type Offer } from "./api";
import { Login } from "./Login";
import { MapView, type MapStops } from "./MapView";
import { OfferCard, type OfferEntry } from "./OfferCard";
import { TripPanel } from "./TripPanel";
import { EarningsDrawer, type DriverMe } from "./EarningsDrawer";

const TRIP_KEY = "cx.driver.trip";

function Console() {
  const [online, setOnline] = useState(false);
  const [connected, setConnected] = useState(false);
  const [offers, setOffers] = useState<OfferEntry[]>([]);
  const [tripId, setTripId] = useState<string | null>(() => localStorage.getItem(TRIP_KEY));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [myPos, setMyPos] = useState<LatLon | null>(null);
  const [locNote, setLocNote] = useState<string | null>("Locating…");
  const [me, setMe] = useState<DriverMe | null>(null);

  const onlineRef = useRef(online);
  onlineRef.current = online;
  const sockRef = useRef<DriverSocket | null>(null);
  const posRef = useRef<LatLon | null>(null);
  const loadMe = useCallback(() => {
    api
      .driverMe()
      .then(setMe)
      .catch(() => undefined);
  }, []);

  useEffect(loadMe, [loadMe]);

  // WS connection — fresh socket per ONLINE session so the server re-registers
  // presence; offers ignored while OFFLINE.
  const [wsSession, setWsSession] = useState(0);
  useEffect(() => {
    if (online) setWsSession((s) => s + 1);
  }, [online]);

  useEffect(() => {
    const token = getToken();
    if (!token || wsSession === 0) return;
    const sock = connectDriverSocket(
      token,
      (msg) => {
        if (msg.t === "dispatch.offer") {
          const o: Offer = msg.offer;
          if (!onlineRef.current) return;
          setOffers((prev) =>
            prev.some((e) => e.offer.requestId === o.requestId && e.offer.negotiationId === o.negotiationId)
              ? prev
              : [...prev, { offer: o, ttlMs: Math.max(1000, new Date(o.expiresAt).getTime() - Date.now()) }],
          );
        } else if (msg.t === "dispatch.cancel") {
          setOffers((prev) => prev.filter((e) => e.offer.requestId !== msg.requestId));
        } else if (msg.t === "trip.state" && msg.state === "DRIVER_ASSIGNED") {
          // Rider may have accepted OUR counter — the WS message carries no tripId,
          // so recover it from the trips list (contract gap workaround).
          if (!localStorage.getItem(TRIP_KEY)) {
            api
              .trips()
              .then((r) => {
                const t = r.trips.find((x) => !x.state.startsWith("COMPLETED") && !x.state.startsWith("CANCELLED"));
                if (t) {
                  localStorage.setItem(TRIP_KEY, t.id);
                  setTripId(t.id);
                  setOffers([]);
                }
              })
              .catch(() => undefined);
          }
        }
      },
      setConnected,
    );
    sockRef.current = sock;
    return () => {
      sock.close();
      sockRef.current = null;
      setConnected(false);
    };
  }, [wsSession]);

  // First push is staggered so the server finishes registering the fresh socket.
  useEffect(() => {
    posRef.current = { lat: 12.9352, lng: 77.6245 }; // Bengaluru default until a GPS fix lands
    setMyPos(posRef.current);
    setLocNote("Using default location — enable GPS for real dispatch");
    let watch: number | undefined;
    if ("geolocation" in navigator) {
      watch = navigator.geolocation.watchPosition(
        (p) => {
          posRef.current = { lat: p.coords.latitude, lng: p.coords.longitude };
          setMyPos(posRef.current);
          setLocNote(null);
        },
        () => undefined,
        { enableHighAccuracy: true },
      );
    }
    const send = (): void => {
      const pos = posRef.current;
      if (pos && onlineRef.current && sockRef.current?.readyState === WebSocket.OPEN) {
        sockRef.current.send({ t: "pos.update", lat: pos.lat, lng: pos.lng });
      }
    };
    const first = setTimeout(send, 1500);
    const iv = setInterval(send, 4000);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
    };
  }, []);

  const removeOffer = useCallback((requestId: string) => {
    setOffers((prev) => prev.filter((e) => e.offer.requestId !== requestId));
  }, []);

  function onAccepted(tripId: string): void {
    setOffers([]);
    localStorage.setItem(TRIP_KEY, tripId);
    setTripId(tripId);
  }

  function onTripClosed(): void {
    localStorage.removeItem(TRIP_KEY);
    setTripId(null);
    setDrawerOpen(true); // show fresh earnings after completion
    void api.driverMe().then(setMe).catch(() => undefined);
  }

  const stops: MapStops = {};
  const top = offers.length > 0 ? offers[0] : undefined;
  if (!tripId && top) {
    stops.pickup = top.offer.pickup;
    stops.drop = top.offer.drop;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          Chalo-X<span className="x"> Driver</span>
        </div>
        <span className={"conn-dot" + (connected ? " ok" : "")} title={connected ? "live" : "offline"} />
        <div className="spacer" />
        <div className={"toggle" + (online ? " online" : "")}>
          <span className="label">{online ? "ONLINE" : "OFFLINE"}</span>
          <button
            aria-label="toggle online"
            className={"switch" + (online ? " on" : "")}
            onClick={() => setOnline((v) => !v)}
          />
        </div>
        <button className="earnings-chip" onClick={() => setDrawerOpen(true)}>
          <span>{me ? `${formatINR(paisa(me.walletBalancePaise))} · ${me.completedTrips} trips` : "Earnings"}</span>
        </button>
      </header>
      <div className="map-wrap">
        {tripId !== null && <TripPanel tripId={tripId} onFinished={onTripClosed} />}
        {!tripId && top && (
          <OfferCard
            key={`${top.offer.requestId}:${top.offer.negotiationId ?? ""}`}
            entry={top}
            onAccept={onAccepted}
            onSkip={() => removeOffer(top.offer.requestId)}
          />
        )}
        {!tripId && locNote && <div className="map-note">{locNote}</div>}
        {tripId === null && offers.length === 0 && !locNote && (
          <div className="map-note">{online ? "Waiting for ride requests…" : "Go ONLINE to receive ride requests"}</div>
        )}
      </div>
      {drawerOpen && <EarningsDrawer onClose={() => setDrawerOpen(false)} />}
    </div>
  );
}

export default function App() {
  const [token, setTokenState] = useState<string | null>(getToken);

  if (!token) {
    return (
      <Routes>
        <Route path="/login" element={<Login onAuth={setTokenState} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/" element={<Console />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

