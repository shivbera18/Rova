import { useEffect, useState } from "react";
import { formatINR, paisa } from "@chalo/protocol";
import { api, type Offer } from "./api";

export interface OfferEntry {
  offer: Offer;
  ttlMs: number;
}

function playChime(): void {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {}
}

export function OfferCard({
  entry,
  onAccept,
  onSkip,
}: {
  entry: OfferEntry;
  onAccept: (tripId: string) => void;
  onSkip: () => void;
}) {
  const { offer, ttlMs } = entry;
  const [seconds, setSeconds] = useState(() => Math.ceil(ttlMs / 1000));
  const [showCounter, setShowCounter] = useState(false);
  const [counterInput, setCounterInput] = useState(() => (offer.takeHomePaise / 100 + 20).toString());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Play alert chime on arrival
  useEffect(() => {
    playChime();
  }, [offer.requestId]);

  // Countdown timer
  useEffect(() => {
    const end = Date.now() + ttlMs;
    const iv = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(iv);
        onSkip();
      }
    }, 250);
    return () => clearInterval(iv);
  }, [ttlMs, onSkip]);

  const accept = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (offer.negotiationId) {
        const res = await api.acceptNegotiation(offer.negotiationId);
        onAccept(res.tripId);
      } else {
        const res = await api.acceptRequest(offer.requestId);
        onAccept(res.tripId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accept failed");
      setBusy(false);
    }
  };

  const submitCounter = async (amountRupees: number): Promise<void> => {
    if (!offer.negotiationId) return;
    const paise = Math.round(amountRupees * 100);
    if (paise <= offer.takeHomePaise) {
      setError("Counter must be higher than current offer");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.counterNegotiation(offer.negotiationId, paise);
      setShowCounter(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Counter failed");
      setBusy(false);
    }
  };

  const currentRupees = offer.takeHomePaise / 100;
  const progressPct = Math.max(0, Math.min(100, (seconds / (ttlMs / 1000)) * 100));

  return (
    <div className="offer-card-overlay">
      <div className="offer-header">
        <div className="offer-badge">
          <span>⚡</span>
          <span>{offer.isCounter ? `Rider Final · R${offer.round}` : `Offer · R${offer.round}`}</span>
        </div>
        <div className="countdown-badge">⏱ {seconds}s</div>
      </div>

      <div className="progress-line-track">
        <div className="progress-line-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="offer-amount-row">
        <div>
          <div className="offer-amount-label">YOUR TAKE-HOME PAY</div>
          <div className="offer-amount-val">{formatINR(paisa(offer.takeHomePaise))}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="offer-amount-label">PAYMENT</div>
          <div style={{ fontWeight: 800, color: "#10b981", fontSize: 13 }}>{offer.paymentMethod}</div>
        </div>
      </div>

      <div className="offer-subtitle">
        <span>👤 {offer.riderName || "Rider"}</span>
        <span>·</span>
        <span>★ {offer.riderRating ? offer.riderRating.toFixed(1) : "4.8"}</span>
        <span>·</span>
        <span style={{ color: "var(--accent)" }}>100% of this pay is yours</span>
      </div>

      <div className="offer-stats-grid">
        <div className="stat-box">
          <div className="num">{offer.pickupKm} km</div>
          <div className="lbl">Pickup Dist</div>
        </div>
        <div className="stat-box">
          <div className="num">{offer.tripKm} km</div>
          <div className="lbl">Trip Dist</div>
        </div>
        <div className="stat-box">
          <div className="num">₹{Math.round((offer.takeHomePaise / 100) / Math.max(offer.tripKm, 0.5))}</div>
          <div className="lbl">Rate / km</div>
        </div>
      </div>

      {error && <div className="error-text" style={{ marginBottom: 12, fontSize: 12 }}>{error}</div>}

      {showCounter && offer.negotiationId ? (
        <div className="counter-box">
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>
            Propose Your Desired Take-Home:
          </div>
          <div style={{ display: "flex", gap: 6, margin: "8px 0" }}>
            {[10, 20, 30, 50].map((inc) => (
              <button
                key={inc}
                className="loc-pill"
                type="button"
                onClick={() => setCounterInput((currentRupees + inc).toString())}
              >
                +₹{inc}
              </button>
            ))}
          </div>
          <div className="counter-input-row">
            <span>₹</span>
            <input
              type="number"
              value={counterInput}
              onChange={(e) => setCounterInput(e.target.value)}
              placeholder={`> ₹${currentRupees}`}
              autoFocus
            />
            <button
              className="btn btn-accept"
              style={{ flex: "0 0 auto", padding: "10px 16px" }}
              disabled={busy || Number(counterInput) <= currentRupees}
              onClick={() => void submitCounter(Number(counterInput))}
            >
              Send ₹{counterInput}
            </button>
            <button className="btn btn-skip" onClick={() => setShowCounter(false)}>
              ✕
            </button>
          </div>
        </div>
      ) : null}

      <div className="offer-actions">
        <button className="btn btn-accept" disabled={busy} onClick={() => void accept()}>
          ✓ Accept {formatINR(paisa(offer.takeHomePaise))}
        </button>
        {offer.negotiationId && !showCounter && (
          <button className="btn btn-counter" disabled={busy} onClick={() => setShowCounter(true)}>
            💬 Counter
          </button>
        )}
        <button className="btn btn-skip" disabled={busy} onClick={onSkip} title="Skip this request">
          Skip
        </button>
      </div>
    </div>
  );
}
