import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { formatINR, paisa, type LatLon } from "@chalo/protocol";
import { clearToken, connectDriverSocket, getToken, api, type DriverSocket, type Offer } from "./api";
import { Login, DriverLanding } from "./Login";
import { MapView, type MapStops } from "./MapView";
import { OfferCard, unlockOfferAudio, type OfferEntry } from "./OfferCard";
import { TripPanel } from "./TripPanel";
import { EarningsDrawer, type DriverMe } from "./EarningsDrawer";
import { OnboardingCard } from "./OnboardingCard";
import { enablePushNotifications, pushSupported } from "./push";

const TRIP_KEY = "cx.driver.trip";

const HOTSPOTS: Array<{ name: string; pos: LatLon }> = [
  { name: "📍 Koramangala", pos: { lat: 12.9352, lng: 77.6245 } },
  { name: "📍 Indiranagar", pos: { lat: 12.9784, lng: 77.6408 } },
  { name: "📍 MG Road", pos: { lat: 12.9757, lng: 77.6068 } },
  { name: "📍 HSR Layout", pos: { lat: 12.9116, lng: 77.6474 } },
  { name: "📍 Airport", pos: { lat: 13.1986, lng: 77.7066 } },
];


function Console() {
  const [online, setOnline] = useState(false);
  const [connected, setConnected] = useState(false);
  const [offers, setOffers] = useState<OfferEntry[]>([]);
  const [tripId, setTripId] = useState<string | null>(() => localStorage.getItem(TRIP_KEY));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [myPos, setMyPos] = useState<LatLon>({ lat: 12.9352, lng: 77.6245 });
  const [activeVehicle, setActiveVehicle] = useState("BIKE");
  const [me, setMe] = useState<DriverMe | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  const onlineRef = useRef(online);
  const [pushState, setPushState] = useState<NotificationPermission>(
    () => (pushSupported() ? Notification.permission : "denied"),
  );
  onlineRef.current = online;
  const sockRef = useRef<DriverSocket | null>(null);
  const posRef = useRef<LatLon>(myPos);
  posRef.current = myPos;

  const loadMe = useCallback(() => {
    api
      .driverMe()
      .then((data) => {
        setMe(data);
        setSessionReady(true);
        if (data.profile?.vehicle_class) setActiveVehicle(data.profile.vehicle_class);
        if (typeof data.profile?.online === "boolean") setOnline(data.profile.online);
      })
      .catch(() => {
        // api.ts purges stale tokens and dispatches "storage" on 401/403.
        // App owns the redirect; Console renders nothing while it happens.
        setSessionReady(false);
      });
  }, []);

  useEffect(loadMe, [loadMe]);

  const updateDriverStatus = useCallback(async (isOnline: boolean, pos?: LatLon) => {
    try {
      await api.updateStatus({
        online: isOnline,
        lat: pos?.lat ?? posRef.current.lat,
        lng: pos?.lng ?? posRef.current.lng,
      });
    } catch {}
  }, []);
  const [wsSession, setWsSession] = useState(0);
  useEffect(() => {
    if (!sessionReady) return;
    if (online) {
      setWsSession((s) => s + 1);
      void updateDriverStatus(true, myPos);
    } else {
      void updateDriverStatus(false, myPos);
    }
  }, [online, sessionReady]);

  useEffect(() => {
    const token = getToken();
    if (!token || wsSession === 0 || !sessionReady) return;
    const sock = connectDriverSocket(
      token,
      (msg) => {
        if (msg.t === "dispatch.offer") {
          const o: Offer = msg.offer;
          if (!onlineRef.current) return;
          setOffers((prev) =>
            prev.some((e) => e.offer.requestId === o.requestId && e.offer.negotiationId === o.negotiationId)
              ? prev
              : [...prev, { offer: o, ttlMs: Math.max(15000, new Date(o.expiresAt).getTime() - Date.now()) }],
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
  }, [wsSession, sessionReady]);

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
    void updateDriverStatus(online, pos);
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

  if (!sessionReady) return null;

  const stops: MapStops = {};
  const top = offers.length > 0 ? offers[0] : undefined;
  if (!tripId && top) {
    stops.pickup = top.offer.pickup;
    stops.drop = top.offer.drop;
  }

  if (me?.profile && me.profile.kyc_status !== "APPROVED") {
    return <OnboardingCard vehicle={me.profile.vehicle_class} status={me.profile.kyc_status} onUpdated={loadMe} />;
  }
  return (
    <div className="app-shell" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <header className="topbar">
        <div className="brand">
          CHALO-X <span style={{ color: "var(--blue)" }}>DRIVER</span>
          <span className="brut-badge brut-badge-green" style={{ marginLeft: 8 }}>CONSOLE</span>
        </div>
        <span className={"conn-dot" + (connected ? " ok" : "")} title={connected ? "Connected" : "Disconnected"} />

        <div className="vehicle-identity" title="Vehicle is fixed to this driver account">
          <span>{activeVehicle === "BIKE" ? "🏍️" : activeVehicle === "AUTO" ? "🛺" : "🚗"}</span>
          <div>
            <small>REGISTERED VEHICLE</small>
            <strong>{activeVehicle.replaceAll("_", " ")}</strong>
          </div>
          <span className="vehicle-lock">🔒</span>
        </div>
        <div style={{ flex: 1 }} />

        <div className={`toggle-wrap${online ? " online" : ""}`} onClick={() => { void unlockOfferAudio(); setOnline((v) => !v); }}>
          <span className="toggle-label">{online ? "ONLINE" : "OFFLINE"}</span>
          <button
            aria-label="toggle online"
            className={`switch${online ? " on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              void unlockOfferAudio();
              setOnline((v) => !v);
            }}
          />
        </div>

        {pushSupported() && pushState !== "granted" && (
          <button
            className="brut-btn brut-btn-white"
            style={{ padding: "8px 12px", fontSize: 11 }}
            onClick={() => void enablePushNotifications().then(setPushState).catch(() => setPushState("denied"))}
          >
            🔔 Enable alerts
          </button>
        )}

        <button
          className="brut-btn brut-btn-white"
          style={{ padding: "8px 12px", fontSize: 11 }}
          onClick={() => {
            clearToken();
            localStorage.removeItem(TRIP_KEY);
            window.dispatchEvent(new Event("storage"));
          }}
        >
          Log out
        </button>
        <button className="brut-btn brut-btn-white" style={{ padding: "8px 14px", fontSize: 12 }} onClick={() => setDrawerOpen(true)}>
          {me ? `${formatINR(paisa(me.walletBalancePaise))} · ${me.completedTrips} rides` : "Earnings"}
        </button>
      </header>

      <div className="map-wrap" style={{ flex: 1, position: "relative" }}>
        <MapView me={myPos} stops={stops} onLocationPick={handleLocationPick} />

        {!tripId && (
          <div className="location-bar">
            <span style={{ fontSize: 11, fontWeight: 800 }}>POSITION:</span>
            {HOTSPOTS.map((h) => (
              <button
                key={h.name}
                type="button"
                className={`chip-place ${myPos.lat === h.pos.lat && myPos.lng === h.pos.lng ? "selected" : ""}`}
                onClick={() => handleLocationPick(h.pos)}
              >
                {h.name}
              </button>
            ))}
          </div>
        )}

        {tripId !== null && <TripPanel tripId={tripId} onFinished={onTripClosed} />}

        {!tripId && top && (
          <OfferCard
            key={`${top.offer.requestId}:${top.offer.negotiationId ?? ""}`}
            entry={top}
            onAccept={onAccepted}
            onSkip={() => removeOffer(top.offer.requestId)}
          />
        )}

        {!tripId && offers.length === 0 && (
          <div className="map-status-pill brut-card" style={{ padding: "10px 18px", background: online ? "var(--green)" : "#fff" }}>
            {online ? (
              <>
                <span className="radar-ping" />
                <span><strong>LIVE</strong> · Waiting for {activeVehicle.replaceAll("_", " ")} requests near your position…</span>
              </>
            ) : (
              <span>Flip the switch to go <strong>ONLINE</strong> and receive requests</span>
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
  const [showLanding, setShowLanding] = useState(
    () => !localStorage.getItem("chalox.driver.seenLanding"),
  );

  useEffect(() => {
    const sync = (): void => setTokenState(getToken());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  if (!token) {
    if (showLanding) {
      return (
        <DriverLanding
          onGetStarted={() => {
            localStorage.setItem("chalox.driver.seenLanding", "1");
            setShowLanding(false);
          }}
        />
      );
    }
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
