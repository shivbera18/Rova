import { useEffect, useState } from "react";
import { formatINR, paisa, type DriverOfferPayload } from "@chalo/protocol";
import { api, type Offer } from "./api";

export interface OfferEntry {
  offer: DriverOfferPayload;
  ttlMs: number; // total countdown at receipt
}

function useRemaining(expiresAt: string): number {
  const [left, setLeft] = useState(() => Math.max(0, new Date(expiresAt).getTime() - Date.now()));
  useEffect(() => {
    const iv = setInterval(
      () => setLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now())),
      250,
    );
    return () => clearInterval(iv);
  }, [expiresAt]);
  return left;
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
  const o = entry.offer;
  const left = useRemaining(o.expiresAt);
  const [busy, setBusy] = useState(false);
  const [countering, setCountering] = useState(false);
  const [counterVal, setCounterVal] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const pct = Math.min(100, (left / Math.max(entry.ttlMs, 1)) * 100);
  const negotiationId = o.negotiationId;

  useEffect(() => {
    if (left <= 0) onSkip(); // expired — drop it
  }, [left, onSkip]);

  async function accept() {
    if (!negotiationId) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.acceptNegotiation(negotiationId);
      onAccept(r.tripId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not accept");
      setBusy(false);
    }
  }

  async function counter(e: React.FormEvent) {
    e.preventDefault();
    if (!negotiationId) return;
    const paise = Math.round(Number(counterVal) * 100);
    if (!Number.isFinite(paise) || paise <= o.takeHomePaise) {
      setErr(`Your counter must be above ${formatINR(paisa(o.takeHomePaise))} — that is the current offer.`);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.counterNegotiation(negotiationId, paise);
      onSkip(); // ball in rider's court — clear our card
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Counter failed");
      setBusy(false);
    }
  }

  const secs = Math.ceil(left / 1000);

  return (
    <div className="offer-card">
      <div className="offer-timer" style={{ width: `${pct}%` }} />
      <div className="offer-head">
        <span className={o.isCounter ? "tag counter" : "tag"}>
          {o.isCounter ? `RIDER FINAL · ROUND ${o.round}` : o.negotiationId ? `OFFER · ROUND ${o.round}` : "LIST-PRICE RIDE"}
        </span>
        <span className="secs">expires in {secs}s</span>
      </div>
      <div className="take-home">
        {formatINR(paisa(o.takeHomePaise))} <small>your take-home</small>
      </div>
      <div className="offer-hint">
        {o.riderName} · ★ {o.riderRating.toFixed(1)} · pays {o.paymentMethod}
        {o.isCounter ? " — accept to lock it in" : " — your counter IS your pay, ask for more"}
      </div>
      <div className="offer-meta">
        <div>
          Pickup
          <b>{o.pickupKm.toFixed(1)} km</b>
        </div>
        <div>
          Trip
          <b>{o.tripKm.toFixed(1)} km</b>
        </div>
        <div>
          Per km
          <b>{formatINR(paisa(Math.round(o.takeHomePaise / Math.max(o.tripKm, 0.1))))}</b>
        </div>
      </div>
      {err && <div className="err">{err}</div>}
      {countering && negotiationId ? (
        <form className="counter-row" onSubmit={counter}>
          <input
            autoFocus
            value={counterVal}
            onChange={(e) => setCounterVal(e.target.value)}
            placeholder={`more than ₹${(o.takeHomePaise / 100).toFixed(0)}`}
            inputMode="decimal"
            disabled={busy}
          />
          <button type="submit" className="primary" disabled={busy || !negotiationId}>
            Send counter
          </button>
          <button type="button" className="ghost" onClick={() => setCountering(false)} disabled={busy}>
            Back
          </button>
        </form>
      ) : (
        <div className="offer-actions">
          <button
            className="good"
            onClick={accept}
            disabled={busy || !negotiationId || left <= 0}
            style={{ flex: 1.4 }}
          >
            {negotiationId ? "ACCEPT RIDE" : "LIST RIDE — NO ACCEPT API"}
          </button>
          <button
            className="primary"
            onClick={() => {
              setErr(null);
              setCountering(true);
            }}
            disabled={busy || !negotiationId || left <= 0}
            style={{ flex: 1 }}
          >
            COUNTER
          </button>
          <button className="ghost" onClick={onSkip} disabled={busy} style={{ flex: 0.8 }}>
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
