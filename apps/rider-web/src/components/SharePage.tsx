import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { MapPin, Navigation, ShieldCheck, TriangleAlert, UserRound } from "lucide-react";

interface ShareView {
  state: string;
  vehicleClass: string;
  driverFirstName: string | null;
  driverPlate: string | null;
  pickup: { lat: number; lng: number };
  drop: { lat: number; lng: number };
  pickupLabel: string | null;
  dropLabel: string | null;
  startedAt?: string;
  endedAt?: string;
  driverLivePos?: { lat: number; lng: number };
}

const STATE_COPY: Record<string, string> = {
  DRIVER_ASSIGNED: "Driver assigned — heading to pickup",
  ARRIVING: "Driver is arriving",
  ARRIVED: "Driver has arrived at pickup",
  ONGOING: "Ride in progress",
  COMPLETED: "Ride completed safely",
  CANCELLED_RIDER: "Ride cancelled",
  CANCELLED_DRIVER: "Ride cancelled",
};

function fmtCoord(n: number): string {
  return n.toFixed(3);
}

export function SharePage(): React.ReactElement {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<ShareView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let stale = false;
    let terminal = false;
    const TERMINAL_STATES = ["COMPLETED", "CANCELLED_RIDER", "CANCELLED_DRIVER"];
    const load = (): void => {
      void fetch(`/v1/share/${encodeURIComponent(token)}`)
        .then(async (res) => {
          const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          if (stale) return;
          if (!res.ok) {
            setError(String(json.message ?? "This journey link is not valid"));
            setView(null);
            terminal = true; // dead links stay dead — stop polling
            return;
          }
          setError(null);
          const next = json as unknown as ShareView;
          setView(next);
          if (TERMINAL_STATES.includes(next.state)) terminal = true;
        })
        .catch(() => {
          if (!stale) setError("Could not reach the server");
        });
    };
    load();
    // stop hammering the endpoint once nothing can change
    const iv = setInterval(() => {
      if (terminal) {
        clearInterval(iv);
        return;
      }
      load();
    }, 5000);
    return () => {
      stale = true;
      clearInterval(iv);
    };
  }, [token]);

  const active = view != null && !["COMPLETED", "CANCELLED_RIDER", "CANCELLED_DRIVER"].includes(view.state);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div
        className="brut-card"
        style={{ width: "min(460px, 100%)", padding: 26, background: "#ffffff" }}
      >
        <div className="row" style={{ gap: 8, marginBottom: 6 }}>
          <ShieldCheck size={18} color="var(--green)" />
          <span className="eyebrow">LIVE JOURNEY SHARE</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 14 }}>
          {active ? "Tracking a ride right now" : "Journey update"}
        </h1>

        {error && (
          <div className="error-text" role="alert" style={{ marginBottom: 12 }}>
            <TriangleAlert size={14} /> {error}
          </div>
        )}

        {!view && !error && <p className="muted" style={{ fontSize: 13 }}>Loading journey status…</p>}

        {view && (
          <>
            <div
              className="spread"
              style={{
                padding: "10px 12px",
                background: "var(--paper-subtle)",
                border: "var(--brut-border-thin)",
                borderRadius: "var(--radius-sm)",
                marginBottom: 12,
              }}
            >
              <span style={{ fontWeight: 800, fontSize: 13 }}>{STATE_COPY[view.state] ?? view.state}</span>
              <span className="brut-badge brut-badge-primary">{view.vehicleClass.replaceAll("_", " ")}</span>
            </div>

            {(view.driverFirstName || view.driverPlate) && (
              <div className="row" style={{ gap: 8, fontSize: 13, marginBottom: 12 }}>
                <UserRound size={15} />
                <strong>{view.driverFirstName ?? "Driver"}</strong>
                {view.driverPlate && <span className="brut-badge">{view.driverPlate}</span>}
              </div>
            )}

            <div className="col" style={{ gap: 8, marginBottom: 12 }}>
              <div className="spread" style={{ fontSize: 13 }}>
                <span className="row" style={{ gap: 6, color: "var(--ink-muted)", fontWeight: 700 }}>
                  <MapPin size={14} /> Pickup
                </span>
                <strong style={{ textAlign: "right" }}>
                  {view.pickupLabel ?? `${fmtCoord(view.pickup.lat)}, ${fmtCoord(view.pickup.lng)}`}
                </strong>
              </div>
              <div className="spread" style={{ fontSize: 13 }}>
                <span className="row" style={{ gap: 6, color: "var(--ink-muted)", fontWeight: 700 }}>
                  <Navigation size={14} /> Drop
                </span>
                <strong style={{ textAlign: "right" }}>
                  {view.dropLabel ?? `${fmtCoord(view.drop.lat)}, ${fmtCoord(view.drop.lng)}`}
                </strong>
              </div>
            </div>

            {view.driverLivePos && (
              <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 12 }}>
                Driver's last known position: {fmtCoord(view.driverLivePos.lat)}, {fmtCoord(view.driverLivePos.lng)} — refreshes every few seconds.
              </p>
            )}

            <p style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
              This page shows only trip status and coarse locations. Fare and personal details are never shared.
              {" "}If something looks wrong, call your contact or dial 112.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
