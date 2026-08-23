import { useState } from "react";
import { formatINR, negotiatedQuote, paisa } from "@chalo/protocol";
import { useCountdown } from "../ws";
import { riderAccept, riderDecline, riderFinal } from "../api";
import { EXPLAINER_COPY, vehicleLabel } from "./OfferSheet";
import type { Quote } from "../api";

export interface DriverCounter {
  negotiationId: string;
  paise: number;
  round: number;
  expiresAt: string;
}

export default function CounterModal({
  counter,
  quote,
  vehicleClass,
  onClose,
  onResolved,
}: {
  counter: DriverCounter;
  quote: Quote | null;
  vehicleClass: string;
  onClose: () => void;
  /** called after accept/final/decline resolves; final keeps matching alive */
  onResolved: (outcome: "accepted" | "declined" | "final") => void;
}): React.ReactElement {
  const secs = useCountdown(counter.expiresAt);
  const [finalRupees, setFinalRupees] = useState<string>((counter.paise / 100).toFixed(0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expired = (secs ?? 0) <= 0;

  const feeLine =
    quote && Number.isFinite(Number(finalRupees))
      ? negotiatedQuote(paisa(Math.round(Number(finalRupees) * 100)), {
          listPrice: paisa(quote.listPrice),
          tripFare: paisa(quote.tripFare),
          platformFee: paisa(quote.platformFeePaise),
          surgeMultiplier: 1,
        }).riderTotal
      : null;

  async function act(fn: () => Promise<unknown>, outcome: "accepted" | "declined" | "final"): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setBusy(false);
      onResolved(outcome);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="card modal">
        <div className="spread">
          <h3>Driver countered — {vehicleLabel(vehicleClass)}</h3>
          <span className="countdown-num" style={{ fontSize: 22, color: expired ? "var(--danger)" : "var(--text)" }}>
            {expired ? "0s" : `${secs}s`}
          </span>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${Math.min(100, ((secs ?? 0) / 20) * 100)}%` }}
          />
        </div>
        <div className="muted">Round {counter.round} of 3</div>
        <div className="counter-amount">{formatINR(paisa(counter.paise))}</div>
        {feeLine !== null && (
          <div className="muted" style={{ fontSize: 12.5 }}>
            ≈ {formatINR(paisa(feeLine))} for you including the platform fee
            <i className="info-dot" tabIndex={0}>
              ℹ
              <span className="info-tip">{EXPLAINER_COPY}</span>
            </i>
          </div>
        )}

        {error && (
          <div className="error-text" style={{ marginTop: 8 }}>
            {error}
          </div>
        )}
        {!expired ? (
          <>
            <button
              className="btn-primary"
              style={{ width: "100%", marginTop: 12 }}
              disabled={busy}
              onClick={() => void act(() => riderAccept(counter.negotiationId), "accepted")}
            >
              Accept {formatINR(paisa(counter.paise))}
            </button>
            <div className="row" style={{ marginTop: 10 }}>
              <span>₹</span>
              <input
                inputMode="decimal"
                value={finalRupees}
                onChange={(e) => setFinalRupees(e.target.value.replace(/[^0-9.]/g, ""))}
                aria-label="Your final offer in rupees"
              />
              <button
                disabled={busy || !Number.isFinite(Number(finalRupees))}
                onClick={() =>
                  void act(
                    () => riderFinal(counter.negotiationId, Math.round(Number(finalRupees) * 100)),
                    "final",
                  )
                }
              >
                Send final offer
              </button>
            </div>
            <button
              className="btn-danger"
              style={{ width: "100%", marginTop: 10 }}
              disabled={busy}
              onClick={() => void act(() => riderDecline(counter.negotiationId), "declined")}
            >
              Decline
            </button>
          </>
        ) : (
          <div>
            <p className="muted" style={{ margin: "12px 0" }}>This counter expired. Your original offer is still broadcasting.</p>
            <button className="btn-ghost" style={{ width: "100%" }} onClick={onClose}>
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
