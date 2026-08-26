import { useState } from "react";
import { formatINR, paisa } from "@chalo/protocol";
import { Rocket, TriangleAlert } from "lucide-react";
import { useCountdown } from "../ws";
import { riderAccept, riderDecline, riderFinal } from "../api";
import { vehicleLabel } from "./OfferSheet";
import { NeoCard, NeoButton, NeoBadge, NeoInput } from "./NeoComponents";

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
  minimumDriverPaise = 0,
  onClose,
  onResolved = () => {},
  onAccept,
  onFinalOffer,
  onDecline,
}: {
  counter: DriverCounter;
  vehicleClass?: string;
  platformFeePaise?: number;
  minimumDriverPaise?: number;
  onClose?: () => void;
  onResolved?: (outcome: "accepted" | "declined" | "final") => void;
  onAccept?: () => void;
  onFinalOffer?: () => void;
  onDecline?: () => void;
}): React.ReactElement {
  const secs = useCountdown(counter.expiresAt);
  const [finalRupees, setFinalRupees] = useState((counter.paise / 100).toFixed(0));
  const [platformRupees, setPlatformRupees] = useState(((platformFeePaise ?? 0) / 100).toFixed(2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expired = (secs ?? 0) <= 0;
  const driverFinalPaise = Math.max(0, Math.round(Number(finalRupees || 0) * 100));
  const finalPlatformPaise = Math.max(0, Math.round(Number(platformRupees || 0) * 100));

  async function handleAccept(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await riderAccept(counter.negotiationId);
      onResolved("accepted");
      onAccept?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accept failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDecline(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await riderDecline(counter.negotiationId);
      onResolved("declined");
      onDecline?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decline failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleFinal(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await riderFinal(counter.negotiationId, driverFinalPaise, finalPlatformPaise);
      onResolved("final");
      onFinalOffer?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Final offer failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <NeoCard elevation="lg" className="modal" style={{ maxWidth: 440, padding: 26, background: "#ffffff" }}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <span className="eyebrow">COUNTER BID RECEIVED</span>
          <NeoBadge variant={expired ? "red" : "green"}>
            {expired ? "EXPIRED" : `⏱ ${secs}s`}
          </NeoBadge>
        </div>

        <h3 style={{ fontSize: 20, marginBottom: 4 }}>
          Driver Counter{vehicleClass ? ` — ${vehicleLabel(vehicleClass)}` : ""}
        </h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-muted)", marginBottom: 16 }}>
          Round {counter.round} of 3 · Negotiate take-home pay
        </p>

        <NeoCard variant="primary" elevation="none" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--primary)", letterSpacing: "0.04em" }}>
            Driver Requests
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 900, color: "var(--ink)" }}>
            {formatINR(paisa(counter.paise))}
          </div>
          {(platformFeePaise ?? 0) > 0 && (
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
              Net Total with Platform: {formatINR(paisa(counter.paise + platformFeePaise!))}
            </div>
          )}
        </NeoCard>

        {error && (
          <div className="error-text" style={{ marginBottom: 14 }} role="alert">
            <TriangleAlert size={14} /> {error}
          </div>
        )}

        {!expired ? (
          <div className="col" style={{ gap: 10 }}>
            <NeoButton
              variant="primary"
              fullWidth
              disabled={busy}
              onClick={() => void handleAccept()}
            >
              <Rocket size={15} /> Accept {formatINR(paisa(counter.paise))} Deal
            </NeoButton>

            <div className="booking-divider"><span>OR PROPOSE FINAL COUNTER</span></div>

            <div className="row" style={{ gap: 10 }}>
              <div style={{ flex: 1 }}>
                <NeoInput
                  label="Driver Take-Home (₹)"
                  value={finalRupees}
                  onChange={(e) => setFinalRupees(e.target.value.replace(/[^0-9.]/g, ""))}
                />
              </div>
              <div style={{ flex: 1 }}>
                <NeoInput
                  label="Platform Fee (₹)"
                  value={platformRupees}
                  onChange={(e) => setPlatformRupees(e.target.value.replace(/[^0-9.]/g, ""))}
                />
              </div>
            </div>

            <NeoButton
              variant="accent"
              fullWidth
              disabled={busy || driverFinalPaise < minimumDriverPaise}
              onClick={() => void handleFinal()}
            >
              Send Final Offer ({formatINR(paisa(driverFinalPaise + finalPlatformPaise))}) →
            </NeoButton>

            <NeoButton
              variant="red"
              fullWidth
              disabled={busy}
              onClick={() => void handleDecline()}
            >
              Decline Counter
            </NeoButton>
          </div>
        ) : (
          <div>
            <p className="muted" style={{ margin: "14px 0" }}>
              This counter bid has expired. Check your live radar matching card.
            </p>
            <NeoButton variant="white" fullWidth onClick={onClose}>
              Close Window
            </NeoButton>
          </div>
        )}
      </NeoCard>
    </div>
  );
}
