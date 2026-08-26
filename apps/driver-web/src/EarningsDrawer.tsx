import { useEffect, useState } from "react";
import { formatINR, paisa, type TripView } from "@chalo/protocol";
import { Star, X } from "lucide-react";
import { api } from "./api";
import { NeoCard, NeoButton, NeoBadge } from "./NeoComponents";

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
        <div className="spread" style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 22, fontWeight: 900 }}>Driver Earnings</h2>
          <button
            className="brut-btn brut-btn-white brut-btn-sm"
            onClick={onClose}
            aria-label="Close drawer"
            style={{ width: 28, height: 28, padding: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        {me && (
          <>
            <NeoCard variant="primary" elevation="sm" style={{ padding: 20, marginBottom: 14 }}>
              <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "var(--primary)", letterSpacing: "0.05em" }}>
                Available Wallet Balance
              </span>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 900, color: "var(--ink)", margin: "4px 0 8px" }}>
                {formatINR(paisa(me.walletBalancePaise))}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <NeoBadge variant="green">KYC {me.profile?.kyc_status ?? "APPROVED"}</NeoBadge>
                <NeoBadge variant="primary"><Star size={11} fill="currentColor" /> {me.rating ? me.rating.toFixed(1) : "5.0"}</NeoBadge>
              </div>
            </NeoCard>

            <div className="earnings-grid" style={{ marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "var(--ink-muted)" }}>Today</span>
                <strong style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--ink)", display: "block", marginTop: 2 }}>
                  {formatINR(paisa(me.todayEarningsPaise))}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "var(--ink-muted)" }}>7 Days</span>
                <strong style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--primary)", display: "block", marginTop: 2 }}>
                  {formatINR(paisa(me.weekEarningsPaise))}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "var(--ink-muted)" }}>Cash Fares</span>
                <strong style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--ink)", display: "block", marginTop: 2 }}>
                  {formatINR(paisa(me.cashEarningsPaise))}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "var(--ink-muted)" }}>Digital UPI</span>
                <strong style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--green)", display: "block", marginTop: 2 }}>
                  {formatINR(paisa(me.digitalEarningsPaise))}
                </strong>
              </div>
            </div>

            <NeoCard elevation="sm" style={{ padding: 18, marginBottom: 18 }}>
              <strong style={{ fontSize: 14 }}>Withdraw to Bank Account</strong>
              <div style={{ fontSize: 11.5, color: "var(--ink-muted)", marginBottom: 10 }}>Minimum ₹200 · Instant simulation</div>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="brut-input"
                  type="number"
                  value={payout}
                  onChange={(e) => setPayout(e.target.value)}
                  style={{ flex: 1 }}
                />
                <NeoButton variant="primary" onClick={() => void withdraw()}>
                  Withdraw
                </NeoButton>
              </div>
              {message && <div className="ok-text" style={{ marginTop: 10 }}>{message}</div>}
            </NeoCard>
          </>
        )}

        <div className="booking-divider"><span>RECENT RIDE RECEIPTS</span></div>

        <div className="col" style={{ gap: 8 }}>
          {trips.filter((t) => t.state === "COMPLETED").length === 0 ? (
            <p className="muted" style={{ textAlign: "center", padding: 16 }}>No completed rides yet</p>
          ) : (
            trips
              .filter((t) => t.state === "COMPLETED")
              .slice(0, 8)
              .map((t) => (
                <div
                  key={t.id}
                  className="brut-card"
                  style={{ padding: 12, borderRadius: "var(--radius-sm)" }}
                >
                  <div className="spread">
                    <strong>{t.vehicleClass}</strong>
                    <strong style={{ color: "var(--green)" }}>
                      +{formatINR(paisa(t.fareBreakdown.agreedPaise))}
                    </strong>
                  </div>
                  <div className="spread" style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 4 }}>
                    <span>{t.paymentMethod ?? "UPI"}</span>
                    <span>Trip #{t.id.slice(0, 6).toUpperCase()}</span>
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
