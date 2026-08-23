import { useState } from "react";
import type { LatLon } from "@chalo/protocol";
import { formatINR, negotiatedQuote, paisa } from "@chalo/protocol";
import type { RequestSessionView, Quote } from "../api";
import { createRequest } from "../api";

export const EXPLAINER_COPY =
  "You can offer any amount — even ₹0. But this small fee keeps Chalo-X running: servers, support and fair dispatch for every driver.";

const VEHICLE_LABEL: Record<string, string> = {
  BIKE_LITE: "Bike Lite",
  BIKE: "Bike",
  AUTO: "Auto",
  CAB_MINI: "Cab Mini",
  CAB_PRIME: "Cab Prime",
  CAB_XL: "Cab XL",
};

export function vehicleLabel(vc: string): string {
  return VEHICLE_LABEL[vc] ?? vc;
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
  const [chip, setChip] = useState<"soft" | "list">("soft");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customRupees = Number(rupeesInput);
  const offerValid = Number.isFinite(customRupees) && customRupees >= 0;
  const offerPaise = chip === "list" ? quote.listPrice : Math.round(customRupees * 100);
  const totalPreview = riderTotalPreview(offerPaise, quote);

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

  return (
    <div className="card panel-card">
      <div className="spread">
        <strong>{vehicleLabel(quote.vehicleClass)}</strong>
        <button className="btn-ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="fee-line">
        {quote.distanceKm} km · ~{quote.etaMin} min away ·{" "}
        <span style={{ color: "var(--text)" }}>{formatINR(paisa(quote.listPrice))}</span> list
        <i className="info-dot" tabIndex={0}>
          ℹ
          <span className="info-tip">{EXPLAINER_COPY}</span>
        </i>
      </div>

      <div className="step-label" style={{ marginTop: 14 }}>
        Your offer
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className={`chip ${chip === "soft" ? "selected" : ""}`} onClick={() => setChip("soft")}>
          Soft floor {formatINR(paisa(quote.softFloor))}
        </button>
        <button className={`chip ${chip === "list" ? "selected" : ""}`} onClick={() => setChip("list")}>
          List price ✓
        </button>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <span style={{ fontWeight: 700 }}>₹</span>
        <input
          inputMode="decimal"
          value={rupeesInput}
          onChange={(e) => {
            setChip("soft");
            setRupeesInput(e.target.value.replace(/[^0-9.]/g, ""));
          }}
          aria-label="Offer amount in rupees"
        />
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: "8px 0 0" }}>
        Your offer goes to the driver in full — the platform fee is charged separately on top.
        You'd pay about <strong>{formatINR(paisa(totalPreview))}</strong> including the fee.
      </p>

      {error && (
        <div className="error-text" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
      <div className="row" style={{ marginTop: 14 }}>
        <button
          className="btn-primary"
          style={{ flex: 1 }}
          disabled={busy || (chip !== "list" && !offerValid)}
          onClick={() => void submit(true)}
        >
          Offer {formatINR(paisa(offerPaise))} & negotiate
        </button>
        <button className="btn-ghost" disabled={busy} onClick={() => void submit(false)}>
          Book at list
        </button>
      </div>
    </div>
  );
}
