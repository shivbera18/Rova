import { useEffect, useState } from "react";
import { formatINR, paisa } from "@chalo/protocol";
import { listTrips, type TripListResponse, type TripView } from "../api";

const stateLabel = (state: string) => state === "COMPLETED" ? "Completed" : state === "CANCELLED_RIDER" ? "You cancelled" : state === "CANCELLED_DRIVER" ? "Driver cancelled" : state.replaceAll("_", " ");
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const chargedTotal = (trip: TripView) => trip.state.startsWith("CANCELLED") ? 0 : trip.fareBreakdown.riderTotalPaise + (trip.fareBreakdown.tipPaise ?? 0);

export default function History(): React.ReactElement {
  const [trips, setTrips] = useState<TripView[] | null>(null);
  const [selected, setSelected] = useState<TripView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { listTrips().then((r: TripListResponse) => setTrips(r.trips)).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load history")); }, []);

  async function shareReceipt(trip: TripView): Promise<void> {
    const amount = trip.state.startsWith("CANCELLED") ? "Not charged" : formatINR(paisa(chargedTotal(trip)));
    const text = `Chalo-X receipt ${trip.id.slice(0, 8)}: ${amount} via ${trip.paymentMethod ?? "UPI"} on ${formatDate(trip.endedAt)}`;
    if (navigator.share) await navigator.share({ title: "Chalo-X ride receipt", text }).catch(() => undefined);
    else await navigator.clipboard.writeText(text);
  }

  if (error) return <div className="card panel-card error-text">{error}</div>;
  if (!trips) return <div className="history-list"><div className="card">Loading your trips…</div></div>;

  return (
    <div className="history-list">
      <div className="history-heading"><span className="eyebrow">YOUR JOURNEYS</span><h2>Trips & receipts</h2></div>
      {trips.length === 0 ? <div className="card panel-card"><h3>No rides yet</h3><p className="muted">Finished rides and receipts appear here.</p></div> : trips.map((trip) => (
        <button key={trip.id} className="card history-card receipt-row" onClick={() => setSelected(trip)}>
          <div className="spread"><div><strong>{trip.vehicleClass.replaceAll("_", " ")}</strong><small>{formatDate(trip.endedAt ?? trip.startedAt)}</small></div><span className="pill">{stateLabel(trip.state)}</span></div>
          <div className="receipt-row-bottom"><span>{trip.paymentMethod ?? "UPI"}</span><strong>{trip.state.startsWith("CANCELLED") ? "Not charged" : formatINR(paisa(chargedTotal(trip)))}</strong></div>
        </button>
      ))}

      {selected && <div className="modal-backdrop receipt-modal" role="dialog" aria-modal="true">
        <article className="brut-card invoice-card">
          <div className="spread"><div><span className="eyebrow">CHALO-X RECEIPT</span><h2>Ride invoice</h2></div><button className="btn-ghost compact" onClick={() => setSelected(null)}>×</button></div>
          <div className="invoice-meta"><span>Receipt</span><strong>#{selected.id.slice(0, 8).toUpperCase()}</strong><span>Started</span><strong>{formatDate(selected.startedAt)}</strong><span>Completed</span><strong>{formatDate(selected.endedAt)}</strong><span>Payment</span><strong>{selected.paymentMethod ?? "UPI"}</strong><span>Vehicle</span><strong>{selected.vehicleClass.replaceAll("_", " ")}</strong></div>
          <div className="fare-box">
            {selected.state.startsWith("CANCELLED") ? <div className="ok-text">This ride was cancelled. You were not charged.</div> : <>
              <div className="fare-line"><span>Driver fare</span><strong>{formatINR(paisa(selected.fareBreakdown.agreedPaise))}</strong></div>
              <div className="fare-line"><span>Platform contribution</span><strong>{formatINR(paisa(selected.fareBreakdown.platformFeePaise))}</strong></div>
              {(selected.fareBreakdown.tipPaise ?? 0) > 0 && <div className="fare-line"><span>Driver tip</span><strong>{formatINR(paisa(selected.fareBreakdown.tipPaise!))}</strong></div>}
              <div className="fare-line fare-total"><span>Total paid</span><strong>{formatINR(paisa(chargedTotal(selected)))}</strong></div>
            </>}
          </div>
          <div className="row invoice-actions"><button className="brut-btn brut-btn-primary" onClick={() => void shareReceipt(selected)}>↗ Share</button><button className="brut-btn brut-btn-white" onClick={() => window.print()}>⇩ Print / PDF</button></div>
        </article>
      </div>}
    </div>
  );
}
