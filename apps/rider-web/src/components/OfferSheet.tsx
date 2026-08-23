import { useState } from "react";
import type { LatLon } from "@chalo/protocol";
import { formatINR, negotiatedQuote, paisa } from "@chalo/protocol";
import type { RequestSessionView, Quote } from "../api";
import { createRequest } from "../api";

export const EXPLAINER_COPY =
  "You can offer any amount — even ₹0. But this small fee keeps Chalo-X running: servers, support, insurance and fair dispatch.";

const VEHICLE_META: Record<string, { label: string; icon: string; seats: string }> = {
  BIKE_LITE: { label: "Bike Lite", icon: "🛵", seats: "1 seat" },
  BIKE: { label: "Bike", icon: "🏍️", seats: "1 seat" },
  AUTO: { label: "Auto", icon: "🛺", seats: "3 seats" },
  CAB_MINI: { label: "Cab Mini", icon: "🚗", seats: "4 seats" },
  CAB_PRIME: { label: "Cab Prime", icon: "🚘", seats: "4 seats · Sedan" },
  CAB_XL: { label: "Cab XL", icon: "🚙", seats: "6 seats · SUV" },
};

export function vehicleLabel(vc: string): string {
  return VEHICLE_META[vc]?.label ?? vc;
}

export function vehicleIcon(vc: string): string {
  return VEHICLE_META[vc]?.icon ?? "🚗";
}

/** Fee preview for an arbitrary rider offer, anchored to the list-price quote's fee. */
function riderTotalPreview(offerPaise: number, quote: Quote): number {
  const list = {
    listPrice: paisa(quote.listPrice),
    tripFare: paisa(quote.tripFare),
    platformFee: paisa(quote.platformFeePaise),
    surgeMultiplier: 1,
  };
  return negotiatedQuote(paisa(offerPaise), list).riderTotal;
}

export default function OfferSheet({
  quote,
  pickup,
  drop,
  payMethod,
  onClose,
  onBooked,
}: {
  quote: Quote;
  pickup: LatLon;
  drop: LatLon;
  payMethod: string;
  onClose: () => void;
  onBooked: (session: RequestSessionView) => void;
}): React.ReactElement {
  const [rupeesInput, setRupeesInput] = useState<string>((quote.softFloor / 100).toFixed(0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customRupees = Number(rupeesInput);
  const offerValid = Number.isFinite(customRupees) && customRupees >= 0;
  const offerPaise = Math.round(customRupees * 100);
  const totalPreview = riderTotalPreview(offerPaise, quote);
  const savingsVsList = quote.listPrice - totalPreview;
  const meta = VEHICLE_META[quote.vehicleClass] ?? { label: quote.vehicleClass, icon: "🚗", seats: "4 seats" };

  async function submit(negotiate: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const session = await createRequest({
        quoteToken: quote.quoteToken,
        vehicleClass: quote.vehicleClass as never,
        paymentMethod: payMethod as never,
        ...(negotiate ? { offerPaise } : {}),
        pickup,
        drop,
      });
      onBooked(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place request");
      setBusy(false);
    }
  }

  const listRupees = quote.listPrice / 100;

  return (
    <div className="card panel-card">
      <div className="spread" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22 }}>{meta.icon}</span>
          <div>
            <strong style={{ fontSize: 16 }}>{meta.label}</strong>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{meta.seats} · {quote.distanceKm} km · ~{quote.etaMin} min away</div>
          </div>
        </div>
        <button className="btn-ghost" style={{ padding: "6px 10px" }} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="fee-line" style={{ marginTop: 12 }}>
        <span>Standard List: <strong>{formatINR(paisa(quote.listPrice))}</strong></span>
        <i className="info-dot" tabIndex={0}>
          ℹ
          <span className="info-tip">{EXPLAINER_COPY}</span>
        </i>
      </div>

      <div className="step-label" style={{ marginTop: 14 }}>
        Select or Enter Your Offer (Down to ₹0):
      </div>

      {/* Quick discount buttons */}
      <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        <button
          type="button"
          className={`chip ${rupeesInput === Math.round(listRupees * 0.9).toString() ? "selected" : ""}`}
          onClick={() => setRupeesInput(Math.round(listRupees * 0.9).toString())}
        >
          -10% (₹{Math.round(listRupees * 0.9)})
        </button>
        <button
          type="button"
          className={`chip ${rupeesInput === Math.round(listRupees * 0.75).toString() ? "selected" : ""}`}
          onClick={() => setRupeesInput(Math.round(listRupees * 0.75).toString())}
        >
          -25% (₹{Math.round(listRupees * 0.75)})
        </button>
        <button
          type="button"
          className={`chip ${rupeesInput === Math.round(listRupees * 0.5).toString() ? "selected" : ""}`}
          onClick={() => setRupeesInput(Math.round(listRupees * 0.5).toString())}
        >
          -50% (₹{Math.round(listRupees * 0.5)})
        </button>
        <button
          type="button"
          className={`chip ${rupeesInput === "0" ? "selected" : ""}`}
          onClick={() => setRupeesInput("0")}
        >
          🎁 ₹0 (Free)
        </button>
        <button
          type="button"
          className={`chip ${rupeesInput === listRupees.toString() ? "selected" : ""}`}
          onClick={() => setRupeesInput(listRupees.toString())}
        >
          List (₹{listRupees})
        </button>
      </div>

      {/* Direct Rupee Input */}
      <div className="row" style={{ marginTop: 6 }}>
        <span style={{ fontWeight: 800, fontSize: 18, color: "var(--accent-light)" }}>₹</span>
        <input
          inputMode="decimal"
          value={rupeesInput}
          onChange={(e) => setRupeesInput(e.target.value.replace(/[^0-9.]/g, ""))}
          aria-label="Offer amount in rupees"
          placeholder="0"
          style={{ fontSize: 18, fontWeight: 800 }}
        />
      </div>

      <div className="fare-box" style={{ marginTop: 12, padding: "10px 12px" }}>
        <div className="fare-line">
          <span>Driver Take-Home</span>
          <span style={{ color: "var(--accent-light)", fontWeight: 700 }}>{formatINR(paisa(offerPaise))}</span>
        </div>
        <div className="fare-line muted">
          <span>
            Platform Fee (Keeps Lights On){" "}
            <i className="info-dot" tabIndex={0}>
              ℹ
              <span className="info-tip">{EXPLAINER_COPY}</span>
            </i>
          </span>
          <span>{formatINR(paisa(quote.platformFeePaise))}</span>
        </div>
        <div className="fare-line fare-total">
          <span>You Pay Total</span>
          <span style={{ color: "#fff", fontWeight: 800 }}>{formatINR(paisa(totalPreview))}</span>
        </div>
        {savingsVsList > 0 && (
          <div className="ok-text">
            ✓ You save {formatINR(paisa(savingsVsList))} vs list price!
          </div>
        )}
      </div>

      {error && (
        <div className="error-text" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <button
          className="btn-primary"
          style={{ flex: 1 }}
          disabled={busy || !offerValid}
          onClick={() => void submit(true)}
        >
          Offer {formatINR(paisa(offerPaise))} & Negotiate
        </button>
        <button className="btn-ghost" disabled={busy} onClick={() => void submit(false)}>
          Book at List
        </button>
      </div>
    </div>
  );
}
