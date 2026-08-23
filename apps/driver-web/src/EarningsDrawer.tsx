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
    void api.driverMe().then(setMe).catch(() => undefined);
    void api.trips().then((r) => setTrips(r.trips)).catch(() => undefined);
  }, []);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Driver Dashboard</h2>
          <button className="btn btn-skip" style={{ padding: "6px 10px" }} onClick={onClose}>
            ✕
          </button>
        </div>

        {me && (
          <>
            <div className="drawer-card">
              <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>
                Total Wallet Balance
              </div>
              <div className="drawer-balance-val">{formatINR(paisa(me.walletBalancePaise))}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <span className="loc-pill" style={{ color: "#10b981", background: "var(--good-dim)" }}>
                  ✓ KYC {me.profile?.kyc_status ?? "APPROVED"}
                </span>
                <span className="loc-pill">
                  {me.profile?.vehicle_class ?? "BIKE"}
                </span>
                <span className="loc-pill">
                  {me.profile?.plate ?? "KA01XX0000"}
                </span>
              </div>
            </div>

            <div className="offer-stats-grid" style={{ marginBottom: 16 }}>
              <div className="stat-box">
                <div className="num">{me.completedTrips}</div>
                <div className="lbl">Completed Rides</div>
              </div>
              <div className="stat-box">
                <div className="num">★ 4.9</div>
                <div className="lbl">Rating</div>
              </div>
              <div className="stat-box">
                <div className="num">100%</div>
                <div className="lbl">Keep Rate</div>
              </div>
            </div>
          </>
        )}

        <div style={{ fontSize: 13, fontWeight: 700, margin: "10px 0 8px", color: "var(--text-dim)" }}>
          Recent Trip Receipts
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {trips.length === 0 ? (
            <p className="muted" style={{ textAlign: "center", marginTop: 20 }}>No completed trips yet.</p>
          ) : (
            trips.map((t) => (
              <div key={t.id} className="drawer-card" style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{t.vehicleClass}</span>
                  <span style={{ color: "var(--accent-light)", fontWeight: 800 }}>
                    +{formatINR(paisa(t.fareBreakdown?.agreedPaise ?? 0))}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  Trip ID: {t.id.slice(0, 8)} · Status: {t.state}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
