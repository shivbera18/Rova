import { useEffect, useState } from "react";
import { formatINR, paisa } from "@chalo/protocol";
import { listTrips, type TripListResponse, type TripView } from "../api";

function stateLabel(s: string): string {
  switch (s) {
    case "DRIVER_ASSIGNED":
    case "ARRIVING":
      return "On the way";
    case "ARRIVED":
      return "Arrived";
    case "ONGOING":
      return "Ongoing";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED_RIDER":
      return "You cancelled";
    case "CANCELLED_DRIVER":
      return "Driver cancelled";
    default:
      return s;
  }
}

export default function History(): React.ReactElement {
  const [trips, setTrips] = useState<TripView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTrips()
      .then((r: TripListResponse) => setTrips(r.trips))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load history"));
  }, []);

  if (error) return <div className="card panel-card error-text">{error}</div>;
  if (!trips) return <p className="muted">Loading…</p>;
  if (trips.length === 0) {
    return (
      <div className="card panel-card">
        <h3 style={{ margin: "0 0 6px" }}>No rides yet</h3>
        <p className="muted" style={{ margin: 0 }}>
          Your finished rides and invoices will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="history-list">
      {trips.map((t) => (
        <div key={t.id} className="card history-card">
          <div className="spread">
            <strong>{t.vehicleClass}</strong>
            <span className="pill">{stateLabel(t.state)}</span>
          </div>
          <div className="fare-box" style={{ marginTop: 8 }}>
            <div className="fare-line">
              <span>Fare</span>
              <span>{formatINR(paisa(t.fareBreakdown.agreedPaise))}</span>
            </div>
            <div className="fare-line muted">
              <span>Platform fee</span>
              <span>{formatINR(paisa(t.fareBreakdown.platformFeePaise))}</span>
            </div>
            <div className="fare-line fare-total">
              <span>Total</span>
              <span>{formatINR(paisa(t.fareBreakdown.riderTotalPaise))}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
