import { useState } from "react";
import type { LatLon } from "@chalo/protocol";
import { formatINR, paisa } from "@chalo/protocol";
import type { RequestSessionView, Quote } from "../api";
import { createRequest } from "../api";

export const EXPLAINER_COPY =
  "This contribution funds Chalo-X servers, dispatch, support and safety. You may change it — even to ₹0 — before sending your offer.";

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

function paiseFromInput(value: string): number {
  const rupees = Number(value);
  return Number.isFinite(rupees) && rupees >= 0 ? Math.round(rupees * 100) : -1;
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
  const [driverInput, setDriverInput] = useState((quote.softFloor / 100).toFixed(0));
  const [platformInput, setPlatformInput] = useState((quote.platformFeePaise / 100).toFixed(2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const driverPaise = paiseFromInput(driverInput);
  const platformPaise = paiseFromInput(platformInput);
  const amountsValid = driverPaise >= 0 && platformPaise >= 0;
  const totalPaise = Math.max(0, driverPaise) + Math.max(0, platformPaise);
  const savingsVsList = quote.listPrice - totalPaise;
  const meta = VEHICLE_META[quote.vehicleClass] ?? { label: quote.vehicleClass, icon: "🚗", seats: "4 seats" };

  async function submit(negotiate: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const session = await createRequest({
        quoteToken: quote.quoteToken,
        vehicleClass: quote.vehicleClass as never,
        paymentMethod: payMethod as never,
        ...(negotiate
          ? {
              offerPaise: driverPaise,
              platformFeePaise: platformPaise,
            }
          : {}),
        pickup,
        drop,
      });
      onBooked(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place request");
      setBusy(false);
    }
  }

  return (
    <section className="brut-card brut-card-elevated" style={{ padding: 22, maxWidth: 480, margin: "0 auto", background: "#ffffff" }}>
      {/* Header */}
      <div className="spread" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 12 }}>
          <span style={{ fontSize: 32, padding: "4px 8px", background: "var(--paper-subtle)", borderRadius: "var(--radius-sm)", border: "var(--brut-border-thin)" }}>
            {meta.icon}
          </span>
          <div>
            <h3 style={{ fontSize: 18, textTransform: "none" }}>{meta.label}</h3>
            <span style={{ fontSize: 12, color: "var(--ink-muted)", fontWeight: 600 }}>
              {meta.seats} · {quote.distanceKm} km · ~{quote.etaMin} min
            </span>
          </div>
        </div>
        <button
          className="brut-btn brut-btn-white brut-btn-sm"
          onClick={onClose}
          aria-label="Close"
          style={{ width: 32, height: 32, padding: 0, fontSize: 16 }}
        >
          ✕
        </button>
      </div>

      {/* Benchmark Standard Fare Banner */}
      <div
        className="spread"
        style={{
          padding: "10px 14px",
          background: "var(--paper-subtle)",
          border: "var(--brut-border-thin)",
          borderRadius: "var(--radius-sm)",
          marginBottom: 18,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--ink-muted)", letterSpacing: "0.04em" }}>
          Standard Benchmark Fare
        </span>
        <strong style={{ fontFamily: "var(--font-display)", fontSize: 17, color: "var(--ink)" }}>
          {formatINR(paisa(quote.listPrice))}
        </strong>
      </div>

      {/* Driver Take-home Fare Input */}
      <div
        className="brut-card"
        style={{
          padding: 16,
          marginBottom: 14,
          background: "#ffffff",
          borderColor: "var(--ink)",
        }}
      >
        <div className="spread" style={{ marginBottom: 8 }}>
          <div className="row" style={{ gap: 6 }}>
            <span style={{ fontSize: 16 }}>🛵</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Driver Take-Home</div>
              <div style={{ fontSize: 11, color: "var(--ink-muted)" }}>100% goes directly to driver</div>
            </div>
          </div>
          <span className="brut-badge brut-badge-green">YOUR OFFER</span>
        </div>

        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--ink)" }}>₹</span>
          <input
            className="brut-input"
            style={{ fontSize: 18, fontWeight: 700, padding: "8px 12px" }}
            aria-label="Amount going to driver"
            inputMode="decimal"
            value={driverInput}
            onChange={(e) => setDriverInput(e.target.value.replace(/[^0-9.]/g, ""))}
          />
        </div>

        <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {[0, 0.5, 0.75, 0.9, 1].map((ratio) => {
            const amount = Math.round((quote.tripFare / 100) * ratio);
            return (
              <button
                key={ratio}
                type="button"
                className="brut-btn brut-btn-white brut-btn-sm"
                style={{ padding: "4px 8px", fontSize: 11.5 }}
                onClick={() => setDriverInput(String(amount))}
              >
                {ratio === 0 ? "₹0" : ratio === 1 ? `Full ₹${amount}` : `${Math.round(ratio * 100)}% · ₹${amount}`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Platform Contribution Input */}
      <div
        className="brut-card"
        style={{
          padding: 16,
          marginBottom: 16,
          background: "var(--paper-subtle)",
          borderColor: "var(--ink)",
        }}
      >
        <div className="spread" style={{ marginBottom: 8 }}>
          <div className="row" style={{ gap: 6 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Platform Fee</div>
              <div style={{ fontSize: 11, color: "var(--ink-muted)" }}>Servers, safety & dispatch</div>
            </div>
          </div>
          <span className="brut-badge brut-badge-primary">TRANSPARENT</span>
        </div>

        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--ink)" }}>₹</span>
          <input
            className="brut-input"
            style={{ fontSize: 18, fontWeight: 700, padding: "8px 12px", background: "#ffffff" }}
            aria-label="Platform contribution"
            inputMode="decimal"
            value={platformInput}
            onChange={(e) => setPlatformInput(e.target.value.replace(/[^0-9.]/g, ""))}
          />
        </div>

        <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {[0, 0.5, 1, 1.5].map((ratio) => {
            const amount = Math.round((quote.platformFeePaise / 100) * ratio * 100) / 100;
            return (
              <button
                key={ratio}
                type="button"
                className="brut-btn brut-btn-white brut-btn-sm"
                style={{ padding: "4px 8px", fontSize: 11.5 }}
                onClick={() => setPlatformInput(String(amount))}
              >
                {ratio === 0 ? "₹0" : ratio === 1 ? `Standard ₹${amount}` : `${ratio}× · ₹${amount}`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Net Total Summary Card */}
      <div
        className="brut-card brut-card-primary"
        style={{
          padding: 16,
          marginBottom: 16,
          borderRadius: "var(--radius-sm)",
        }}
      >
        <div className="spread">
          <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", color: "var(--primary)" }}>
            Total You Pay
          </span>
          <strong style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--ink)" }}>
            {formatINR(paisa(totalPaise))}
          </strong>
        </div>

        <div className="row" style={{ gap: 8, fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>
          <span>Driver: {formatINR(paisa(Math.max(0, driverPaise)))}</span>
          <span>+</span>
          <span>Platform: {formatINR(paisa(Math.max(0, platformPaise)))}</span>
        </div>

        {savingsVsList > 0 && (
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--green)", marginTop: 6 }}>
            ✨ You save {formatINR(paisa(savingsVsList))} compared to standard estimate
          </div>
        )}
      </div>

      {error && (
        <div
          className="brut-badge brut-badge-red"
          style={{ width: "100%", padding: "8px 12px", marginBottom: 12, textTransform: "none", fontSize: 13 }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Actions */}
      <div className="row" style={{ gap: 10 }}>
        <button
          className="brut-btn brut-btn-primary"
          style={{ flex: 1, padding: "12px 18px", fontSize: 14 }}
          disabled={busy || !amountsValid}
          onClick={() => void submit(true)}
        >
          Send {formatINR(paisa(totalPaise))} Offer
        </button>
        <button
          className="brut-btn brut-btn-white"
          style={{ padding: "12px 18px", fontSize: 14 }}
          disabled={busy}
          onClick={() => void submit(false)}
        >
          Book Standard
        </button>
      </div>
    </section>
  );
}
