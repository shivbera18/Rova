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
    <section className="card panel-card fare-builder">
      <div className="spread">
        <div className="row" style={{ gap: 10 }}>
          <span className="vehicle-big-icon">{meta.icon}</span>
          <div>
            <h3 style={{ fontSize: 18, textTransform: "none" }}>{meta.label}</h3>
            <small className="muted">{meta.seats} · {quote.distanceKm} km · ~{quote.etaMin} min</small>
          </div>
        </div>
        <button className="btn-ghost compact" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="standard-fare-banner">
        <span>STANDARD ESTIMATE</span>
        <strong>{formatINR(paisa(quote.listPrice))}</strong>
      </div>

      <div className="fare-builder-title">
        <span className="eyebrow">BUILD YOUR OFFER</span>
        <h3>Choose where your money goes</h3>
        <p>Both parts are editable. The driver sees only their take-home amount.</p>
      </div>

      <div className="fare-control driver-control">
        <div className="fare-control-head">
          <span className="fare-control-icon">🛵</span>
          <div>
            <strong>Driver take-home</strong>
            <small>100% goes to your driver</small>
          </div>
          <span className="brut-badge brut-badge-green">NEGOTIABLE</span>
        </div>
        <div className="money-input">
          <span>₹</span>
          <input
            aria-label="Amount going to driver"
            inputMode="decimal"
            value={driverInput}
            onChange={(e) => setDriverInput(e.target.value.replace(/[^0-9.]/g, ""))}
          />
        </div>
        <div className="amount-chips">
          {[0, 0.5, 0.75, 0.9, 1].map((ratio) => {
            const amount = Math.round((quote.tripFare / 100) * ratio);
            return (
              <button key={ratio} type="button" onClick={() => setDriverInput(String(amount))}>
                {ratio === 0 ? "₹0" : ratio === 1 ? `Full ₹${amount}` : `${Math.round(ratio * 100)}% · ₹${amount}`}
              </button>
            );
          })}
        </div>
      </div>

      <div className="fare-control platform-control">
        <div className="fare-control-head">
          <span className="fare-control-icon">⚡</span>
          <div>
            <strong>Platform contribution</strong>
            <small>Servers, dispatch, support & safety</small>
          </div>
          <i className="info-dot" tabIndex={0}>i<span className="info-tip">{EXPLAINER_COPY}</span></i>
          <span className="brut-badge brut-badge-yellow">NEGOTIABLE</span>
        </div>
        <div className="money-input">
          <span>₹</span>
          <input
            aria-label="Platform contribution"
            inputMode="decimal"
            value={platformInput}
            onChange={(e) => setPlatformInput(e.target.value.replace(/[^0-9.]/g, ""))}
          />
        </div>
        <div className="amount-chips">
          {[0, 0.5, 1, 1.5].map((ratio) => {
            const amount = Math.round((quote.platformFeePaise / 100) * ratio * 100) / 100;
            return (
              <button key={ratio} type="button" onClick={() => setPlatformInput(String(amount))}>
                {ratio === 0 ? "₹0" : ratio === 1 ? `Suggested ₹${amount}` : `${ratio}× · ₹${amount}`}
              </button>
            );
          })}
        </div>
      </div>

      <div className="net-total-card">
        <div>
          <span>YOUR NET TOTAL</span>
          <strong>{formatINR(paisa(totalPaise))}</strong>
        </div>
        <div className="net-breakdown">
          <span>Driver {formatINR(paisa(Math.max(0, driverPaise)))}</span>
          <b>+</b>
          <span>Platform {formatINR(paisa(Math.max(0, platformPaise)))}</span>
        </div>
        {savingsVsList > 0 && <small>You save {formatINR(paisa(savingsVsList))} vs standard estimate</small>}
        {savingsVsList < 0 && <small className="generous">You contribute {formatINR(paisa(-savingsVsList))} above estimate</small>}
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="row" style={{ marginTop: 14 }}>
        <button
          className="btn-primary"
          style={{ flex: 1 }}
          disabled={busy || !amountsValid}
          onClick={() => void submit(true)}
        >
          Send {formatINR(paisa(totalPaise))} Offer
        </button>
        <button className="btn-ghost" disabled={busy} onClick={() => void submit(false)}>
          Book standard
        </button>
      </div>
    </section>
  );
}
