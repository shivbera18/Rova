import { useEffect, useState } from "react";
import { formatINR, paisa, type TripView } from "@chalo/protocol";
import { api } from "./api";

export interface DriverMe {
  profile: {
    vehicle_class: string;
    plate: string;
    kyc_status: string;
    online: boolean;
  } | null;
  walletBalancePaise: number;
  completedTrips: number;
}
export function EarningsDrawer({ onClose }: { onClose: () => void }) {
  const [me, setMe] = useState<DriverMe | null>(null);
  const [trips, setTrips] = useState<TripView[]>([]);

  useEffect(() => {
    api.driverMe().then(setMe).catch(() => undefined);
    api
      .trips()
      .then((r) => setTrips(r.trips.filter((t) => t.state === "COMPLETED").slice(0, 8)))
      .catch(() => undefined);
  }, []);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <h3>
          Earnings
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </h3>
        <div className="stat-grid">
          <div className="stat">
            <span>Wallet balance</span>
            <b>{me ? formatINR(paisa(me.walletBalancePaise)) : "…"}</b>
          </div>
          <div className="stat">
            <span>Completed trips</span>
            <b>{me ? me.completedTrips : "…"}</b>
          </div>
        </div>
        {me?.profile && (
          <div style={{ marginBottom: 16 }}>
            <span className="pill">{me.profile.vehicle_class}</span>
            <span className="pill">{me.profile.plate}</span>
            <span className="pill">KYC: {me.profile.kyc_status}</span>
          </div>
        )}
        <h3 style={{ fontSize: 14 }}>Recent rides</h3>
        {trips.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13 }}>No completed trips yet.</div>}
        {trips.map((t) => (
          <div className="hist-item" key={t.id}>
            <span>
              {t.vehicleClass} ·{" "}
              {new Date(t.endedAt ?? t.startedAt ?? Date.now()).toLocaleDateString("en-IN")}
            </span>
            <b>{formatINR(paisa(t.fareBreakdown.agreedPaise + t.fareBreakdown.tipPaise))}</b>
          </div>
        ))}
      </aside>
    </>
  );
}
