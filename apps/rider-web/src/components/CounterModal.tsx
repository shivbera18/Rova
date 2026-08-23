import { useState } from "react";
import { formatINR, paisa } from "@chalo/protocol";
import { useCountdown } from "../ws";
import { riderAccept, riderDecline, riderFinal } from "../api";
import { EXPLAINER_COPY, vehicleLabel } from "./OfferSheet";

export interface DriverCounter {
  negotiationId: string;
  paise: number;
  round: number;
  expiresAt: string;
}

export default function CounterModal({
  counter,
  vehicleClass,
  platformFeePaise,
  onClose,
  onResolved,
}: {
  counter: DriverCounter;
  vehicleClass: string;
  platformFeePaise: number;
  onClose: () => void;
  onResolved: (outcome: "accepted" | "declined" | "final") => void;
}): React.ReactElement {
  const secs = useCountdown(counter.expiresAt);
  const [finalRupees, setFinalRupees] = useState((counter.paise / 100).toFixed(0));
  const [platformRupees, setPlatformRupees] = useState((platformFeePaise / 100).toFixed(2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expired = (secs ?? 0) <= 0;
  const driverFinalPaise = Math.max(0, Math.round(Number(finalRupees || 0) * 100));
  const finalPlatformPaise = Math.max(0, Math.round(Number(platformRupees || 0) * 100));

  async function act(fn: () => Promise<unknown>, outcome: "accepted" | "declined" | "final"): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onResolved(outcome);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card modal">
        <div className="spread">
          <h3>Driver countered — {vehicleLabel(vehicleClass)}</h3>
          <span className="countdown-num" style={{ fontSize: 22, color: expired ? "var(--red)" : "var(--ink)" }}>
            {expired ? "0s" : `${secs}s`}
          </span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${Math.min(100, ((secs ?? 0) / 20) * 100)}%` }} />
        </div>
        <div className="muted">Round {counter.round} of 3</div>
        <div className="counter-amount">Driver asks {formatINR(paisa(counter.paise))}</div>
        <div className="fare-box">
          <div className="fare-line">
            <span>Accept net total</span>
            <strong>{formatINR(paisa(counter.paise + platformFeePaise))}</strong>
          </div>
          <div className="fare-line muted">
            <span>Driver</span><span>{formatINR(paisa(counter.paise))}</span>
          </div>
          <div className="fare-line muted">
            <span>Platform <i className="info-dot" tabIndex={0}>i<span className="info-tip">{EXPLAINER_COPY}</span></i></span>
            <span>{formatINR(paisa(platformFeePaise))}</span>
          </div>
        </div>

        {error && <div className="error-text">{error}</div>}
        {!expired ? (
          <>
            <button
              className="btn-primary"
              style={{ width: "100%", marginTop: 12 }}
              disabled={busy}
              onClick={() => void act(() => riderAccept(counter.negotiationId), "accepted")}
            >
              Accept net {formatINR(paisa(counter.paise + platformFeePaise))}
            </button>

            <div className="booking-divider"><span>OR SEND FINAL SPLIT</span></div>
            <div className="counter-final-grid">
              <label>
                <span>Driver take-home</span>
                <div className="money-input compact-money"><b>₹</b><input
                  value={finalRupees}
                  onChange={(e) => setFinalRupees(e.target.value.replace(/[^0-9.]/g, ""))}
                  aria-label="Your final driver offer in rupees"
                  inputMode="decimal"
                /></div>
              </label>
              <label>
                <span>Platform contribution</span>
                <div className="money-input compact-money"><b>₹</b><input
                  value={platformRupees}
                  onChange={(e) => setPlatformRupees(e.target.value.replace(/[^0-9.]/g, ""))}
                  aria-label="Final platform contribution in rupees"
                  inputMode="decimal"
                /></div>
              </label>
            </div>
            <button
              className="btn-primary"
              style={{ width: "100%", marginTop: 8 }}
              disabled={busy || !Number.isFinite(Number(finalRupees)) || !Number.isFinite(Number(platformRupees))}
              onClick={() => void act(
                () => riderFinal(counter.negotiationId, driverFinalPaise, finalPlatformPaise),
                "final",
              )}
            >
              Send final net {formatINR(paisa(driverFinalPaise + finalPlatformPaise))}
            </button>
            <button
              className="btn-danger"
              style={{ width: "100%", marginTop: 10 }}
              disabled={busy}
              onClick={() => void act(() => riderDecline(counter.negotiationId), "declined")}
            >
              Decline counter
            </button>
          </>
        ) : (
          <div>
            <p className="muted" style={{ margin: "12px 0" }}>This counter expired. Your original offer is still broadcasting.</p>
            <button className="btn-ghost" style={{ width: "100%" }} onClick={onClose}>Dismiss</button>
          </div>
        )}
      </div>
    </div>
  );
}
