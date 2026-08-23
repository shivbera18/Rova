import { useCallback, useEffect, useState } from "react";
import { formatINR, paisa, type TripView } from "@chalo/protocol";
import { api } from "./api";

const STATE_COPY: Record<string, string> = {
  DRIVER_ASSIGNED: "Head to Pickup",
  ARRIVING: "On the Way",
  ARRIVED: "At Pickup — Ask for OTP",
  ONGOING: "Ride in Progress",
  COMPLETED: "Ride Finished",
  CANCELLED_RIDER: "Rider Cancelled",
  CANCELLED_DRIVER: "You Cancelled",
};

export function TripPanel({
  tripId,
  onFinished,
}: {
  tripId: string;
  onFinished: () => void;
}) {
  const [trip, setTrip] = useState<TripView | null>(null);
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    api
      .trip(tripId)
      .then(setTrip)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load trip"));
  }, [tripId]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 2500);
    return () => clearInterval(iv);
  }, [refresh]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (!trip) {
    return (
      <div className="trip-panel-overlay">
        <h3 style={{ margin: 0 }}>Loading trip…</h3>
        {err && <div className="error-text" style={{ marginTop: 8 }}>{err}</div>}
      </div>
    );
  }

  const fare = trip.fareBreakdown;
  const isPickupPhase = trip.state === "DRIVER_ASSIGNED" || trip.state === "ARRIVING";
  const navTarget = isPickupPhase ? trip.pickup : trip.drop;

  return (
    <div className="trip-panel-overlay">
      <div className="trip-status-header">
        <div>
          <span className="trip-status-badge">{STATE_COPY[trip.state] ?? trip.state}</span>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Trip ID: {trip.id.slice(0, 8)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Your Pay</div>
          <div className="trip-pay-highlight">{fare ? formatINR(paisa(fare.agreedPaise)) : "—"}</div>
        </div>
      </div>

      <div className="trip-coords-box">
        <div className="coord-row">
          <span className="coord-dot pickup" />
          <div>
            <div className="coord-lbl">PICKUP POINT</div>
            <div className="coord-text">{trip.pickup.lat.toFixed(5)}, {trip.pickup.lng.toFixed(5)}</div>
          </div>
        </div>
        <div className="coord-row">
          <span className="coord-dot drop" />
          <div>
            <div className="coord-lbl">DROP DESTINATION</div>
            <div className="coord-text">{trip.drop.lat.toFixed(5)}, {trip.drop.lng.toFixed(5)}</div>
          </div>
        </div>
      </div>

      {err && <div className="error-text" style={{ marginBottom: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <a
          className="btn btn-counter"
          style={{ textDecoration: "none" }}
          href={`https://www.google.com/maps/dir/?api=1&destination=${navTarget.lat},${navTarget.lng}`}
          target="_blank"
          rel="noreferrer"
        >
          📍 Navigate to {isPickupPhase ? "Pickup" : "Drop"}
        </a>
      </div>

      {trip.state === "DRIVER_ASSIGNED" && (
        <button
          className="btn btn-accept"
          style={{ width: "100%" }}
          disabled={busy}
          onClick={() => act(() => api.tripState(trip.id, "ARRIVING"))}
        >
          🚀 I'm on my way (ARRIVING)
        </button>
      )}

      {trip.state === "ARRIVING" && (
        <button
          className="btn btn-accept"
          style={{ width: "100%" }}
          disabled={busy}
          onClick={() => act(() => api.tripState(trip.id, "ARRIVED"))}
        >
          📍 I have arrived at pickup
        </button>
      )}

      {trip.state === "ARRIVED" && (
        <div className="otp-box">
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
            Enter Passenger's 6-Digit OTP:
          </div>
          <input
            className="otp-input"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="······"
            inputMode="numeric"
            autoFocus
          />
          <button
            className="btn btn-accept"
            style={{ width: "100%", marginTop: 10 }}
            disabled={busy || otp.length !== 6}
            onClick={() => act(() => api.startTrip(trip.id, otp))}
          >
            ✓ Verify OTP & Start Ride
          </button>
        </div>
      )}

      {trip.state === "ONGOING" && (
        <button
          className="btn btn-accept"
          style={{ width: "100%" }}
          disabled={busy}
          onClick={() => act(() => api.completeTrip(trip.id, 0))}
        >
          🏁 Complete Ride & Settle Pay
        </button>
      )}

      {trip.state === "COMPLETED" && (
        <div>
          <div style={{ background: "var(--good-dim)", color: "var(--good)", padding: 12, borderRadius: 10, textAlign: "center", fontWeight: 700, marginBottom: 12 }}>
            ✓ Ride Complete — {fare ? formatINR(paisa(fare.agreedPaise)) : ""} credited to your wallet!
          </div>
          <button className="btn btn-accept" style={{ width: "100%" }} onClick={onFinished}>
            Back Online for Next Ride
          </button>
        </div>
      )}
      {(trip.state === "CANCELLED_RIDER" || trip.state === "CANCELLED_DRIVER") && (
        <div>
          <div style={{ background: "var(--bad-dim)", color: "var(--bad)", padding: 12, borderRadius: 10, textAlign: "center", fontWeight: 700, marginBottom: 12 }}>
            ✕ Ride Cancelled ({trip.state === "CANCELLED_RIDER" ? "By Passenger" : "By You"})
          </div>
          <button className="btn btn-accept" style={{ width: "100%" }} onClick={onFinished}>
            Back Online for Next Ride
          </button>
        </div>
      )}
    </div>
  );
}
