import { useEffect, useState } from "react";
import { formatINR, paisa } from "@chalo/protocol";
import { Heart, Rocket, Star, TriangleAlert, User } from "lucide-react";
import { api, type Offer } from "./api";
import { NeoCard, NeoButton, NeoBadge } from "./NeoComponents";

export interface OfferEntry {
  offer: Offer;
  ttlMs: number;
}
let audioContext: AudioContext | null = null;

export async function unlockOfferAudio(): Promise<void> {
  try {
    audioContext ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audioContext.state === "suspended") await audioContext.resume();
  } catch {}
}

function playChime(): void {
  try {
    if (!audioContext || audioContext.state !== "running") return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + 0.35);
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

  useEffect(() => {
    playChime();
  }, [offer.requestId]);

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

  const progressPct = Math.max(0, Math.min(100, (seconds / (ttlMs / 1000)) * 100));

  return (
    <NeoCard elevation="lg" className="offer-card-overlay" style={{ padding: 22, background: "#ffffff" }}>
      <div className="spread" style={{ marginBottom: 8 }}>
        <div className="row" style={{ gap: 6 }}>
          <NeoBadge variant="primary">
            {offer.isCounter ? `Rider Final · R${offer.round}` : `Offer · R${offer.round}`}
          </NeoBadge>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-muted)" }}>
            {offer.paymentMethod}
          </span>
        </div>
        <NeoBadge variant="red">⏱ {seconds}s</NeoBadge>
      </div>

      <div className="progress-line-track" style={{ marginBottom: 12 }}>
        <div className="progress-line-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="spread" style={{ marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "var(--ink-muted)", letterSpacing: "0.05em" }}>
            Your Take-Home Pay
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 900, color: "var(--ink)" }}>
            {offer.takeHomePaise === 0 ? "Free Ride" : formatINR(paisa(offer.takeHomePaise))}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "var(--ink-muted)", letterSpacing: "0.05em" }}>
            Commission Cut
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--green)" }}>₹0 (0% Cut)</div>
        </div>
      </div>

      <div
        className="row"
        style={{
          gap: 6,
          fontSize: 12,
          color: "var(--ink-soft)",
          padding: "6px 10px",
          background: "var(--paper-subtle)",
          borderRadius: "var(--radius-sm)",
          marginBottom: 12,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><User size={13} /> {offer.riderName || "Rider"}</span>
        <span>·</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Star size={12} fill="currentColor" /> {offer.riderRating ? offer.riderRating.toFixed(1) : "4.8"}</span>
        {offer.isRepeatRequest && (
          <>
            <span>·</span>
            <span
              className="row"
              style={{
                gap: 4,
                color: "#ffffff",
                background: "var(--primary)",
                fontWeight: 800,
                padding: "1px 8px",
                borderRadius: "var(--radius-xs)",
                border: "var(--brut-border-thin)",
              }}
            >
              <Heart size={11} fill="currentColor" /> Repeat rider — saved you
            </span>
          </>
        )}
        <span>·</span>
        <span style={{ color: "var(--primary)", fontWeight: 700 }}>100% earnings to wallet</span>
      </div>

      <div className="offer-stats-grid">
        <div className="stat-box">
          <div className="num">{offer.pickupKm} km</div>
          <div className="lbl">To Pickup</div>
        </div>
        <div className="stat-box">
          <div className="num">{offer.tripKm} km</div>
          <div className="lbl">Trip Dist</div>
        </div>
        <div className="stat-box">
          <div className="num">
            {offer.takeHomePaise === 0 ? "Free" : `₹${Math.round((offer.takeHomePaise / 100) / Math.max(offer.tripKm, 0.5))}`}
          </div>
          <div className="lbl">Rate / km</div>
        </div>
      </div>

      {error && (
        <div className="error-text" style={{ marginBottom: 10 }} role="alert">
          <TriangleAlert size={14} /> {error}
        </div>
      )}

      {showCounter ? (
        <div
          className="brut-card brut-card-primary"
          style={{ padding: 14, marginBottom: 12, borderRadius: "var(--radius-sm)" }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", marginBottom: 8, color: "var(--primary)" }}>
            Propose Your Counter (₹)
          </div>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <input
              className="brut-input"
              type="number"
              value={counterInput}
              onChange={(e) => setCounterInput(e.target.value)}
              autoFocus
            />
            <NeoButton
              variant="primary"
              disabled={busy}
              onClick={() => void submitCounter(Number(counterInput))}
            >
              Send Counter
            </NeoButton>
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {[10, 20, 30, 50].map((add) => {
              const val = Math.round(offer.takeHomePaise / 100 + add);
              return (
                <button
                  key={add}
                  type="button"
                  className="brut-btn brut-btn-white brut-btn-sm"
                  style={{ padding: "3px 8px", fontSize: 11 }}
                  onClick={() => setCounterInput(String(val))}
                >
                  +₹{add} (₹{val})
                </button>
              );
            })}
            <button
              type="button"
              className="brut-btn brut-btn-white brut-btn-sm"
              style={{ padding: "3px 8px", fontSize: 11, marginLeft: "auto" }}
              onClick={() => setShowCounter(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="offer-actions">
          <NeoButton
            variant="primary"
            disabled={busy}
            onClick={() => void accept()}
            style={{ flex: 2 }}
          >
            Accept ({formatINR(paisa(offer.takeHomePaise))}) <Rocket size={15} />
          </NeoButton>

          {offer.negotiationId && (
            <NeoButton
              variant="accent"
              disabled={busy}
              onClick={() => setShowCounter(true)}
              style={{ flex: 1 }}
            >
              Counter
            </NeoButton>
          )}

          <NeoButton
            variant="white"
            disabled={busy}
            onClick={onSkip}
            style={{ flex: 0.8 }}
          >
            Skip
          </NeoButton>
        </div>
      )}
    </NeoCard>
  );
}
