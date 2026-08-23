import { useEffect, useState } from "react";
import { formatINR, paisa, type TripView } from "@chalo/protocol";
import { api } from "./api";

export interface DriverMe {
  profile: { vehicle_class: string; plate: string; kyc_status: string; online: boolean } | null;
  rating: number;
  walletBalancePaise: number;
  completedTrips: number;
  todayEarningsPaise: number;
  weekEarningsPaise: number;
  cashEarningsPaise: number;
  digitalEarningsPaise: number;
}

export function EarningsDrawer({ onClose }: { onClose: () => void }) {
  const [me, setMe] = useState<DriverMe | null>(null);
  const [trips, setTrips] = useState<TripView[]>([]);
  const [payout, setPayout] = useState("200");
  const [message, setMessage] = useState<string | null>(null);

  function reload(): void {
    void api.driverMe().then(setMe).catch(() => undefined);
    void api.trips().then((r) => setTrips(r.trips)).catch(() => undefined);
  }
  useEffect(reload, []);

  async function withdraw(): Promise<void> {
    try {
      const result = await api.payout(Math.round(Number(payout) * 100));
      setMessage(`Payout requested. Balance ${formatINR(paisa(result.balancePaise))}`);
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Payout failed");
    }
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header"><h2>Driver earnings</h2><button className="btn btn-skip" onClick={onClose}>✕</button></div>
        {me && <>
          <div className="drawer-card earnings-hero">
            <small>AVAILABLE BALANCE</small>
            <div className="drawer-balance-val">{formatINR(paisa(me.walletBalancePaise))}</div>
            <div className="row"><span className="brut-badge brut-badge-green">KYC {me.profile?.kyc_status}</span><span className="brut-badge">★ {me.rating.toFixed(2)}</span></div>
          </div>
          <div className="earnings-grid">
            <div><small>TODAY</small><strong>{formatINR(paisa(me.todayEarningsPaise))}</strong></div>
            <div><small>7 DAYS</small><strong>{formatINR(paisa(me.weekEarningsPaise))}</strong></div>
            <div><small>CASH</small><strong>{formatINR(paisa(me.cashEarningsPaise))}</strong></div>
            <div><small>DIGITAL</small><strong>{formatINR(paisa(me.digitalEarningsPaise))}</strong></div>
          </div>
          <div className="drawer-card payout-card">
            <strong>Withdraw to bank</strong><small>Minimum ₹200 · pilot transfer simulation</small>
            <div className="row"><input className="brut-input" value={payout} onChange={(e) => setPayout(e.target.value.replace(/[^0-9.]/g, ""))} aria-label="Payout amount in rupees" /><button className="brut-btn brut-btn-primary" onClick={() => void withdraw()}>Withdraw</button></div>
            {message && <div className="ok-text">{message}</div>}
          </div>
          <div className="offer-stats-grid"><div className="stat-box"><div className="num">{me.completedTrips}</div><div className="lbl">Trips</div></div><div className="stat-box"><div className="num">{me.profile?.vehicle_class}</div><div className="lbl">Vehicle</div></div><div className="stat-box"><div className="num">100%</div><div className="lbl">Keep rate</div></div></div>
        </>}

        <h3 className="drawer-section-title">Recent receipts</h3>
        <div className="drawer-trip-list">
          {trips.filter((trip) => trip.state === "COMPLETED").length === 0 ? <p className="muted">No completed trips yet.</p> : trips.filter((trip) => trip.state === "COMPLETED").map((trip) => (
            <div key={trip.id} className="drawer-card trip-receipt"><div className="spread"><strong>{trip.vehicleClass.replaceAll("_", " ")}</strong><b>+{formatINR(paisa(trip.fareBreakdown?.agreedPaise ?? 0))}</b></div><small>{trip.paymentMethod ?? "UPI"} · {trip.endedAt ? new Date(trip.endedAt).toLocaleString("en-IN") : trip.state}</small></div>
          ))}
        </div>
      </div>
    </div>
  );
}
