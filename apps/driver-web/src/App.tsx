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

const HOTSPOTS: Array<{ name: string; pos: LatLon }> = [
  { name: "📍 Koramangala", pos: { lat: 12.9352, lng: 77.6245 } },
  { name: "📍 Indiranagar", pos: { lat: 12.9784, lng: 77.6408 } },
  { name: "📍 MG Road", pos: { lat: 12.9757, lng: 77.6068 } },
  { name: "📍 HSR Layout", pos: { lat: 12.9116, lng: 77.6474 } },
  { name: "📍 Airport", pos: { lat: 13.1986, lng: 77.7066 } },
];
const VEHICLES = [
  { id: "ALL", label: "⚡ ALL (Dev Mode)" },
  { id: "BIKE", label: "🏍️ Bike" },
  { id: "BIKE_LITE", label: "🛵 Bike Lite" },
  { id: "AUTO", label: "🛺 Auto" },
  { id: "CAB_MINI", label: "🚗 Mini" },
  { id: "CAB_PRIME", label: "🚘 Prime" },
  { id: "CAB_XL", label: "🚙 XL" },
];

function Console() {
  const [online, setOnline] = useState(false);
  const [connected, setConnected] = useState(false);
  const [offers, setOffers] = useState<OfferEntry[]>([]);
  const [tripId, setTripId] = useState<string | null>(() => localStorage.getItem(TRIP_KEY));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [myPos, setMyPos] = useState<LatLon>({ lat: 12.9352, lng: 77.6245 });
  const [activeVehicle, setActiveVehicle] = useState("ALL");
  const [me, setMe] = useState<DriverMe | null>(null);

  const onlineRef = useRef(online);
  onlineRef.current = online;
  const sockRef = useRef<DriverSocket | null>(null);
  const posRef = useRef<LatLon>(myPos);
  posRef.current = myPos;

  const loadMe = useCallback(() => {
    api
      .driverMe()
      .then((data) => {
        setMe(data);
      })
      .catch(() => undefined);
  }, []);

  useEffect(loadMe, [loadMe]);

  // Sync online & vehicle class with backend
  const updateDriverStatus = useCallback(async (isOnline: boolean, vc: string, pos?: LatLon) => {
    try {
      await api.updateStatus({
        online: isOnline,
        vehicleClass: vc,
        lat: pos?.lat ?? posRef.current.lat,
        lng: pos?.lng ?? posRef.current.lng,
      });
    } catch {}
  }, []);

  // WS connection per online session
  const [wsSession, setWsSession] = useState(0);
  useEffect(() => {
    if (online) {
      setWsSession((s) => s + 1);
      void updateDriverStatus(true, activeVehicle, myPos);
    } else {
      void updateDriverStatus(false, activeVehicle, myPos);
    }
  }, [online, activeVehicle]);

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
          if (msg.tripId) {
            localStorage.setItem(TRIP_KEY, msg.tripId);
            setTripId(msg.tripId);
            setOffers([]);
          } else {
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

  // Periodic position updates over WS while online
  useEffect(() => {
    const send = (): void => {
      const pos = posRef.current;
      if (onlineRef.current && sockRef.current?.readyState === WebSocket.OPEN) {
        sockRef.current.send({ t: "pos.update", lat: pos.lat, lng: pos.lng });
      }
    };
    const first = setTimeout(send, 1000);
    const iv = setInterval(send, 4000);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, []);

  const handleLocationPick = (pos: LatLon): void => {
    setMyPos(pos);
    posRef.current = pos;
    if (sockRef.current?.readyState === WebSocket.OPEN) {
      sockRef.current.send({ t: "pos.update", lat: pos.lat, lng: pos.lng });
    }
    void updateDriverStatus(online, activeVehicle, pos);
  };

  const handleVehicleChange = (newVc: string): void => {
    setActiveVehicle(newVc);
    void updateDriverStatus(online, newVc, myPos);
  };

  const removeOffer = useCallback((requestId: string) => {
    setOffers((prev) => prev.filter((e) => e.offer.requestId !== requestId));
  }, []);

  function onAccepted(tripIdToSet: string): void {
    setOffers([]);
    localStorage.setItem(TRIP_KEY, tripIdToSet);
    setTripId(tripIdToSet);
  }

  function onTripClosed(): void {
    localStorage.removeItem(TRIP_KEY);
    setTripId(null);
    setDrawerOpen(true);
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
          <span className="badge">Console</span>
        </div>
        <span className={"conn-dot" + (connected ? " ok" : "")} title={connected ? "WebSocket Connected" : "Connecting..."} />

        <div className="vehicle-selector">
          <span style={{ fontSize: 12 }}>Vehicle:</span>
          <select value={activeVehicle} onChange={(e) => handleVehicleChange(e.target.value)}>
            {VEHICLES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <div className="spacer" />

        <div className={"toggle-wrap" + (online ? " online" : "")} onClick={() => setOnline((v) => !v)}>
          <span className="toggle-label">{online ? "ONLINE" : "OFFLINE"}</span>
          <button
            aria-label="toggle online"
            className={"switch" + (online ? " on" : "")}
            onClick={(e) => {
              e.stopPropagation();
              setOnline((v) => !v);
            }}
          />
        </div>

        <button className="earnings-chip" onClick={() => setDrawerOpen(true)}>
          <span>{me ? `${formatINR(paisa(me.walletBalancePaise))} · ${me.completedTrips} rides` : "Earnings"}</span>
        </button>
      </header>

      <div className="map-wrap">
        {/* Fullscreen interactive MapView rendered in background */}
        <MapView me={myPos} stops={stops} onLocationPick={handleLocationPick} />

        {/* Hotspot Presets Toolbar */}
        {!tripId && (
          <div className="location-bar">
            <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>POS:</span>
            {HOTSPOTS.map((h) => (
              <button
                key={h.name}
                type="button"
                className={`loc-pill ${myPos.lat === h.pos.lat && myPos.lng === h.pos.lng ? "active" : ""}`}
                onClick={() => handleLocationPick(h.pos)}
              >
                {h.name}
              </button>
            ))}
          </div>
        )}

        {/* Active Trip Panel */}
        {tripId !== null && <TripPanel tripId={tripId} onFinished={onTripClosed} />}

        {/* Incoming Offer Overlay Card */}
        {!tripId && top && (
          <OfferCard
            key={`${top.offer.requestId}:${top.offer.negotiationId ?? ""}`}
            entry={top}
            onAccept={onAccepted}
            onSkip={() => removeOffer(top.offer.requestId)}
          />
        )}

        {/* Status indicator when waiting */}
        {!tripId && offers.length === 0 && (
          <div className="map-status-pill">
            {online ? (
              <>
                <span className="radar-ping" />
                <span>Broadcasting live location ({activeVehicle}) — waiting for rides…</span>
              </>
            ) : (
              <span>Tap switch above to go <strong>ONLINE</strong> and receive ride requests</span>
            )}
          </div>
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
