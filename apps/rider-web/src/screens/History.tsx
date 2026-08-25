import { useEffect, useState } from "react";
import { formatINR, paisa } from "@chalo/protocol";
import { CarFront, Share2, TriangleAlert, X } from "lucide-react";
import { listTrips, type TripListResponse, type TripView } from "../api";
import { NeoCard, NeoButton, NeoBadge } from "../components/NeoComponents";

const stateLabel = (state: string) => {
  switch (state) {
    case "COMPLETED":
      return "Completed";
    case "CANCELLED_RIDER":
      return "You cancelled";
    case "CANCELLED_DRIVER":
      return "Driver cancelled";
    default:
      return state;
  }
};

const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "—";

const chargedTotal = (trip: TripView) =>
  trip.state.startsWith("CANCELLED") ? 0 : trip.fareBreakdown.riderTotalPaise + (trip.fareBreakdown.tipPaise ?? 0);

export default function History(): React.ReactElement {
  const [trips, setTrips] = useState<TripView[] | null>(null);
  const [selected, setSelected] = useState<TripView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTrips()
      .then((r: TripListResponse) => setTrips(r.trips))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load trips"));
  }, []);

  async function shareReceipt(trip: TripView): Promise<void> {
    const amount = trip.state.startsWith("CANCELLED") ? "Not charged" : formatINR(paisa(chargedTotal(trip)));
    const text = `Chalo-X receipt #${trip.id.slice(0, 8)}: ${amount} via ${trip.paymentMethod ?? "UPI"} on ${formatDate(trip.startedAt)}`;
    if (navigator.share) await navigator.share({ title: "Chalo-X ride receipt", text }).catch(() => undefined);
    else await navigator.clipboard.writeText(text);
  }

  if (error) {
    return (
      <div style={{ maxWidth: 640, margin: "24px auto", padding: "0 16px" }}>
        <div className="error-text" role="alert"><TriangleAlert size={14} /> {error}</div>
      </div>
    );
  }

  if (!trips) {
    return (
      <div style={{ maxWidth: 640, margin: "24px auto", padding: "0 16px" }}>
        <NeoCard style={{ padding: 24, textAlign: "center" }}>
          <span style={{ fontWeight: 700, color: "var(--ink-muted)" }}>Loading your trip receipts...</span>
        </NeoCard>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, height: "100%", margin: "0 auto", overflowY: "auto", padding: "24px 16px 80px" }}>
      <div style={{ marginBottom: 20 }}>
        <span className="eyebrow">YOUR JOURNEYS</span>
        <h2 style={{ fontSize: 26, fontWeight: 900, textTransform: "none", marginTop: 2 }}>
          Trips & Receipts
        </h2>
      </div>

      {trips.length === 0 ? (
        <NeoCard style={{ padding: 32, textAlign: "center" }}>
          <CarFront size={36} style={{ margin: "0 auto 8px", color: "var(--ink-muted)" }} />
          <h3 style={{ fontSize: 18, marginBottom: 6 }}>No rides recorded yet</h3>
          <p style={{ color: "var(--ink-muted)", fontSize: 13 }}>
            Completed and cancelled trips will appear here with full invoice breakdowns.
          </p>
        </NeoCard>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {trips.map((trip) => (
            <NeoCard
              key={trip.id}
              elevation="sm"
              style={{
                padding: "16px 18px",
                cursor: "pointer",
                transition: "transform 0.08s, box-shadow 0.08s",
              }}
              onClick={() => setSelected(trip)}
            >
              <div className="spread" style={{ marginBottom: 6 }}>
                <div>
                  <strong style={{ fontSize: 15, color: "var(--ink)" }}>
                    {trip.vehicleClass.replaceAll("_", " ")}
                  </strong>
                  <div style={{ fontSize: 11.5, color: "var(--ink-muted)", marginTop: 2 }}>
                    {formatDate(trip.startedAt)}
                  </div>
                </div>
                <NeoBadge variant={trip.state === "COMPLETED" ? "green" : "red"}>
                  {stateLabel(trip.state)}
                </NeoBadge>
              </div>

              <div className="spread" style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8, marginTop: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-muted)" }}>
                  {trip.paymentMethod ?? "UPI"}
                </span>
                <strong style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--ink)" }}>
                  {trip.state.startsWith("CANCELLED") ? "Not charged" : formatINR(paisa(chargedTotal(trip)))}
                </strong>
              </div>
            </NeoCard>
          ))}
        </div>
      )}

      {selected && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <NeoCard elevation="lg" style={{ width: "min(480px, calc(100vw - 32px))", padding: 26, background: "#ffffff" }}>
            <div className="spread" style={{ marginBottom: 12 }}>
              <div>
                <span className="eyebrow">CHALO-X RECEIPT</span>
                <h2 style={{ fontSize: 22, fontWeight: 900, marginTop: 2 }}>Ride Invoice</h2>
              </div>
              <button
                className="brut-btn brut-btn-white brut-btn-sm"
                onClick={() => setSelected(null)}
                aria-label="Close invoice"
                style={{ width: 28, height: 28, padding: 0 }}
              >
                <X size={14} />
              </button>
            </div>

            <div
              className="brut-card"
              style={{
                padding: "12px 16px",
                background: "var(--paper-subtle)",
                borderRadius: "var(--radius-sm)",
                marginBottom: 14,
              }}
            >
              <div className="spread" style={{ fontSize: 12.5, padding: "3px 0" }}>
                <span style={{ color: "var(--ink-muted)" }}>Receipt ID</span>
                <strong>#{selected.id.slice(0, 8).toUpperCase()}</strong>
              </div>
              <div className="spread" style={{ fontSize: 12.5, padding: "3px 0" }}>
                <span style={{ color: "var(--ink-muted)" }}>Date & Time</span>
                <span>{formatDate(selected.startedAt)}</span>
              </div>
              <div className="spread" style={{ fontSize: 12.5, padding: "3px 0" }}>
                <span style={{ color: "var(--ink-muted)" }}>Vehicle</span>
                <strong>{selected.vehicleClass}</strong>
              </div>
              <div className="spread" style={{ fontSize: 12.5, padding: "3px 0" }}>
                <span style={{ color: "var(--ink-muted)" }}>Status</span>
                <NeoBadge variant={selected.state === "COMPLETED" ? "green" : "red"}>
                  {stateLabel(selected.state)}
                </NeoBadge>
              </div>
            </div>

            <div className="fare-box">
              {selected.state.startsWith("CANCELLED") ? (
                <div className="ok-text">This ride was cancelled. You were not charged.</div>
              ) : (
                <>
                  <div className="fare-line">
                    <span>Driver Fare (Take-Home)</span>
                    <strong>{formatINR(paisa(selected.fareBreakdown.agreedPaise))}</strong>
                  </div>
                  <div className="fare-line">
                    <span>Platform Fee</span>
                    <strong>{formatINR(paisa(selected.fareBreakdown.platformFeePaise))}</strong>
                  </div>
                  {(selected.fareBreakdown.tipPaise ?? 0) > 0 && (
                    <div className="fare-line">
                      <span>Driver Tip</span>
                      <strong>{formatINR(paisa(selected.fareBreakdown.tipPaise!))}</strong>
                    </div>
                  )}
                  <div className="fare-line fare-total spread">
                    <span>Total Paid</span>
                    <strong>{formatINR(paisa(chargedTotal(selected)))}</strong>
                  </div>
                </>
              )}
            </div>

            <div className="row" style={{ gap: 10, marginTop: 18 }}>
              <NeoButton variant="primary" fullWidth onClick={() => void shareReceipt(selected)}>
                <Share2 size={15} /> Share Receipt
              </NeoButton>
              <NeoButton variant="white" onClick={() => setSelected(null)}>
                Close
              </NeoButton>
            </div>
          </NeoCard>
        </div>
      )}
    </div>
  );
}
