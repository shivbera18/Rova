import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { formatINR, paisa, type LatLon } from "@chalo/protocol";
import { Bell, LogOut, Play, Square, TriangleAlert } from "lucide-react";
import { clearToken, connectDriverSocket, getToken, api, type DriverSocket } from "./api";
import { Login } from "./Login";
import { DriverLanding } from "./Landing";
import { MapView, type MapStops } from "./MapView";
import { OfferCard, unlockOfferAudio, type OfferEntry } from "./OfferCard";
import { TripPanel } from "./TripPanel";
import { EarningsDrawer, type DriverMe } from "./EarningsDrawer";
import { OnboardingCard } from "./OnboardingCard";
import { enablePushNotifications, pushSupported } from "./push";

const TRIP_KEY = "cx.driver.trip";

const HOTSPOTS: Array<{ name: string; pos: LatLon }> = [
  { name: "Koramangala", pos: { lat: 12.9352, lng: 77.6245 } },
  { name: "Indiranagar", pos: { lat: 12.9784, lng: 77.6408 } },
  { name: "MG Road", pos: { lat: 12.9757, lng: 77.6068 } },
  { name: "HSR Layout", pos: { lat: 12.9116, lng: 77.6474 } },
  { name: "Airport", pos: { lat: 13.1986, lng: 77.7066 } },
];

function DriverConsole({ onLogout }: { onLogout: () => void }) {
  const [online, setOnline] = useState(false);
  const [connected, setConnected] = useState(false);
  const [offers, setOffers] = useState<OfferEntry[]>([]);
  const [tripId, setTripId] = useState<string | null>(() => localStorage.getItem(TRIP_KEY));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [myPos, setMyPos] = useState<LatLon>({ lat: 12.9352, lng: 77.6245 });
  const [me, setMe] = useState<DriverMe | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [wsClosedCode, setWsClosedCode] = useState<number | null>(null);

  const onlineRef = useRef(online);
  const [pushState, setPushState] = useState<NotificationPermission>(
    () => (pushSupported() ? Notification.permission : "denied"),
  );
  onlineRef.current = online;
  const sockRef = useRef<DriverSocket | null>(null);
  const posRef = useRef<LatLon>(myPos);
  posRef.current = myPos;

  const loadMe = useCallback(() => {
    void api
      .driverMe()
      .then((res) => {
        setMe(res);
        // the server persists the online flag across shifts — honour it
        if (res.profile?.online) setOnline(true);
      })
      .catch(() => {
        setMe(null);
      })
      .finally(() => setSessionReady(true));
  }, []);

  useEffect(loadMe, [loadMe]);

  const [wsSession, setWsSession] = useState(0);

  useEffect(() => {
    if (!sessionReady) return;
    if (!online) {
      sockRef.current?.close();
      sockRef.current = null;
      setConnected(false);
      return;
    }
    setWsSession((prev) => prev + 1);
  }, [online, sessionReady]);

  useEffect(() => {
    const token = getToken();
    if (!sessionReady || !online || !token) return;
    let destroyed = false;
    const sock = connectDriverSocket(
      token,
      (msg) => {
        if (destroyed) return;
        if (msg.t === "dispatch.offer") {
          if (!onlineRef.current) return;
          unlockOfferAudio();
          const offer = msg.offer;
          const ttlMs = offer.expiresAt ? Math.max(0, new Date(offer.expiresAt).getTime() - Date.now()) : 20000;
          setOffers((prev) => {
            if (prev.some((o) => o.offer.requestId === offer.requestId)) return prev;
            return [{ offer, ttlMs }, ...prev];
          });
        } else if (msg.t === "dispatch.cancel") {
          setOffers((prev) => prev.filter((o) => o.offer.requestId !== msg.requestId));
        } else if (msg.t === "trip.state") {
          if (msg.tripId) {
            setOffers([]);
            setTripId(msg.tripId);
            localStorage.setItem(TRIP_KEY, msg.tripId);
          }
        }
      },
      (isConnected, closeCode) => {
        if (destroyed) return;
        setConnected(isConnected);
        if (isConnected) {
          setWsClosedCode(null);
          sock.send({ t: "pos.update", lat: posRef.current.lat, lng: posRef.current.lng });
        } else if (closeCode === 4009) {
          // duplicate-tab lockout is permanent until the other tab closes
          setWsClosedCode(4009);
        }
      },
    );
    sockRef.current = sock;
    return () => {
      destroyed = true;
      sock.close();
    };
  }, [wsSession, sessionReady, online]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGpsError(null);
        setMyPos(next);
        if (onlineRef.current) {
          sockRef.current?.send({ t: "pos.update", lat: next.lat, lng: next.lng });
        }
      },
      (err) => {
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — you will not receive nearby requests"
            : err.code === err.POSITION_UNAVAILABLE
              ? "Location unavailable — check GPS settings"
              : "Location timeout — waiting for a fix",
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  const handleLocationPick = (pos: LatLon): void => {
    setMyPos(pos);
    if (online) {
      sockRef.current?.send({ t: "pos.update", lat: pos.lat, lng: pos.lng });
    }
  };

  const removeOffer = useCallback((requestId: string) => {
    setOffers((prev) => prev.filter((e) => e.offer.requestId !== requestId));
  }, []);

  function onAccepted(tripIdToSet: string): void {
    setOffers([]);
    setTripId(tripIdToSet);
    localStorage.setItem(TRIP_KEY, tripIdToSet);
  }

  function onTripClosed(): void {
    setTripId(null);
    localStorage.removeItem(TRIP_KEY);
    loadMe();
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
    <div className="app-shell" style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden" }}>
      {wsClosedCode === 4009 && (
        <div
          role="alert"
          className="row"
          style={{
            gap: 10,
            padding: "10px 14px",
            background: "#fff7ed",
            borderBottom: "var(--brut-border-thin)",
            fontSize: 12.5,
            fontWeight: 700,
            alignItems: "center",
          }}
        >
          <TriangleAlert size={15} color="#ea580c" />
          <span style={{ flex: 1 }}>Chalo-X Driver is open in another tab or window. Close it, then reload here.</span>
          <button className="brut-btn brut-btn-sm brut-btn-primary" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      )}
      {gpsError && (
        <div
          role="alert"
          className="row"
          style={{
            gap: 8,
            padding: "8px 14px",
            background: "#fef2f2",
            borderBottom: "var(--brut-border-thin)",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <TriangleAlert size={14} color="#dc2626" /> {gpsError}
        </div>
      )}
      <header className="topbar">
        <Link to="/" className="brand-badge">
          CHALO<span className="brand-accent">-X</span> DRIVER
        </Link>
        <span className="status-pill" style={{ marginLeft: 8 }}>
          <span className={`status-dot ${online ? (connected ? "online" : "busy") : "offline"}`} />
          {online ? (connected ? "RADAR LIVE" : "CONNECTING...") : "OFFLINE"}
        </span>

        <div className="row" style={{ marginLeft: "auto", gap: 8 }}>
          <button
            className={`brut-btn brut-btn-sm ${online ? "brut-btn-red" : "brut-btn-green"}`}
            onClick={() => setOnline((prev) => !prev)}
          >
            {online ? <Square size={13} /> : <Play size={13} />}
            {online ? "Go Offline" : "Go Online"}
          </button>
          <button className="brut-btn brut-btn-white brut-btn-sm" onClick={() => setDrawerOpen(true)}>
            {me ? `${formatINR(paisa(me.walletBalancePaise))} · ${me.completedTrips} rides` : "Earnings"}
          </button>
          <button className="brut-btn brut-btn-white brut-btn-sm" onClick={onLogout}>
            <LogOut size={14} /> Logout
          </button>
          {pushSupported() && pushState !== "granted" && (
            <button
              className="brut-btn brut-btn-white brut-btn-sm"
              onClick={() => void enablePushNotifications().then(setPushState).catch(() => setPushState("denied"))}
            >
              <Bell size={14} /> Alerts
            </button>
          )}
        </div>
      </header>

      <div className="map-wrap" style={{ flex: 1, position: "relative", height: "100%", width: "100%" }}>
        <MapView
          me={myPos}
          stops={stops}
          onLocationPick={handleLocationPick}
        />

        {/* Hotspots Panel */}
        <div
          className="brut-card"
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            padding: "8px 12px",
            zIndex: 30,
            background: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--ink-muted)", marginBottom: 4 }}>
            Fast Hotspots
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {HOTSPOTS.map((h) => (
              <button
                key={h.name}
                type="button"
                className="brut-btn brut-btn-white brut-btn-sm"
                style={{ padding: "4px 8px", fontSize: 11.5 }}
                onClick={() => handleLocationPick(h.pos)}
              >
                {h.name}
              </button>
            ))}
          </div>
        </div>

        {/* Active Trip or Incoming Offers */}
        {tripId ? (
          <TripPanel tripId={tripId} onFinished={onTripClosed} />
        ) : top ? (
          <div className="offer-card">
            <OfferCard
              entry={top}
              onAccept={onAccepted}
              onSkip={() => removeOffer(top.offer.requestId)}
            />
          </div>
        ) : null}

        {/* Status radar idle banner */}
        {!tripId && offers.length === 0 && (
          <div
            className="brut-card"
            style={{
              position: "absolute",
              bottom: 20,
              left: "50%",
              transform: "translateX(-50%)",
              padding: "10px 20px",
              background: online ? "var(--primary-soft)" : "#ffffff",
              zIndex: 30,
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "var(--shadow-md)",
            }}
          >
            <span className={`status-dot ${online ? "online" : "offline"}`} />
            <span style={{ fontWeight: 700, fontSize: 13 }}>
              {online ? "Radar scanning for nearby rider offers..." : "You are offline. Tap 'Go Online' to receive rides."}
            </span>
          </div>
        )}
      </div>

      {drawerOpen && <EarningsDrawer onClose={() => setDrawerOpen(false)} />}
    </div>
  );
}

export default function App() {
  const [token, setTokenState] = useState<string | null>(getToken);
  const navigate = useNavigate();

  useEffect(() => {
    const sync = (): void => setTokenState(getToken());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const handleLogout = (): void => {
    clearToken();
    localStorage.removeItem(TRIP_KEY);
    setTokenState(null);
    navigate("/");
  };

  return (
    <Routes>
      {/* Route 1: Public Landing Page */}
      <Route
        path="/"
        element={
          <DriverLanding
            onGetStarted={() => {
              if (token) {
                navigate("/drive");
              } else {
                navigate("/login");
              }
            }}
            onSwitchPortal={() => window.open("http://localhost:5173/", "_blank")}
          />
        }
      />

      {/* Route 2: Driver Authentication */}
      <Route
        path="/login"
        element={
          token ? (
            <Navigate to="/drive" replace />
          ) : (
            <Login
              onAuth={(tok) => {
                setTokenState(tok);
                navigate("/drive");
              }}
            />
          )
        }
      />

      {/* Route 3: Driver Radar / Dashboard (/drive) */}
      <Route
        path="/drive"
        element={
          token ? (
            <DriverConsole onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
