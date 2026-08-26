import { useCallback, useEffect, useState } from "react";
import { formatINR, paisa, type TripView } from "@chalo/protocol";
import { Flag, KeyRound, MapPin, Navigation, Rocket, TriangleAlert } from "lucide-react";
import { api } from "./api";
import { NeoCard, NeoButton, NeoBadge, NeoInput } from "./NeoComponents";

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
      <NeoCard elevation="lg" className="trip-panel-overlay" style={{ padding: 22, background: "#ffffff" }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>Loading trip...</h3>
        {err && <div className="error-text" style={{ marginTop: 8 }}>{err}</div>}
      </NeoCard>
    );
  }

  const fare = trip.fareBreakdown;
  const isPickupPhase = trip.state === "DRIVER_ASSIGNED" || trip.state === "ARRIVING";
  const navTarget = isPickupPhase ? trip.pickup : trip.drop;

  return (
    <NeoCard elevation="lg" className="trip-panel-overlay" style={{ padding: 22, background: "#ffffff" }}>
      <div className="spread" style={{ marginBottom: 12 }}>
        <div>
          <NeoBadge variant="primary">{STATE_COPY[trip.state] ?? trip.state}</NeoBadge>
          <div style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 4 }}>
            Trip ID: #{trip.id.slice(0, 8).toUpperCase()}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "var(--ink-muted)", textTransform: "uppercase", fontWeight: 800 }}>
            Your Take-Home Pay
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 900, color: "var(--ink)" }}>
            {fare ? formatINR(paisa(fare.agreedPaise)) : "—"}
          </div>
        </div>
      </div>

      <div
        className="brut-card"
        style={{
          padding: 12,
          background: "var(--paper-subtle)",
          borderRadius: "var(--radius-sm)",
          marginBottom: 12,
        }}
      >
        <div className="spread" style={{ fontSize: 12, padding: "2px 0" }}>
          <span style={{ color: "var(--ink-muted)", fontWeight: 700 }}>Pickup</span>
          <strong style={{ fontSize: 11.5 }}>{trip.pickup.lat.toFixed(4)}, {trip.pickup.lng.toFixed(4)}</strong>
        </div>
        <div className="spread" style={{ fontSize: 12, padding: "2px 0" }}>
          <span style={{ color: "var(--ink-muted)", fontWeight: 700 }}>Drop</span>
          <strong style={{ fontSize: 11.5 }}>{trip.drop.lat.toFixed(4)}, {trip.drop.lng.toFixed(4)}</strong>
        </div>
      </div>

      {err && <div className="error-text" style={{ marginBottom: 12 }} role="alert"><TriangleAlert size={14} /> {err}</div>}

      <div style={{ marginBottom: 12 }}>
        <a
          className="brut-btn brut-btn-white brut-btn-full"
          style={{ textDecoration: "none", padding: "10px 14px", fontSize: 13 }}
          href={`https://www.google.com/maps/dir/?api=1&destination=${navTarget.lat},${navTarget.lng}`}
          target="_blank"
          rel="noreferrer"
        >
          <Navigation size={14} /> Open Navigation to {isPickupPhase ? "Pickup" : "Destination"}
        </a>
      </div>

      {trip.state === "DRIVER_ASSIGNED" && (
        <NeoButton
          variant="primary"
          fullWidth
          disabled={busy}
          onClick={() => act(() => api.tripState(trip.id, "ARRIVING"))}
        >
          <Rocket size={15} /> I'm on my way (ARRIVING)
        </NeoButton>
      )}

      {trip.state === "ARRIVING" && (
        <NeoButton
          variant="primary"
          fullWidth
          disabled={busy}
          onClick={() => act(() => api.tripState(trip.id, "ARRIVED"))}
        >
          <MapPin size={15} /> I have arrived at pickup
        </NeoButton>
      )}

      {trip.state === "ARRIVED" && (
        <div style={{ margin: "8px 0" }}>
          <NeoInput
            label="Passenger's 4-Digit Start OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="····"
            inputMode="numeric"
            autoFocus
          />
          <NeoButton
            variant="green"
            fullWidth
            disabled={busy || otp.length < 4}
            onClick={() => act(() => api.startTrip(trip.id, otp))}
          >
            Start Trip (Verify OTP) <KeyRound size={15} />
          </NeoButton>
        </div>
      )}

      {trip.state === "ONGOING" && (
        <NeoButton
          variant="primary"
          fullWidth
          disabled={busy}
          onClick={() => act(() => api.completeTrip(trip.id, 0))}
        >
          <Flag size={15} /> Complete Trip & Collect {fare ? formatINR(paisa(fare.agreedPaise)) : ""}
        </NeoButton>
      )}

      {trip.state === "COMPLETED" && (
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <NeoBadge variant="green" style={{ marginBottom: 10 }}>TRIP FINISHED</NeoBadge>
          <NeoButton variant="primary" fullWidth onClick={onFinished}>
            Back to Live Radar
          </NeoButton>
        </div>
      )}

      {trip.state.startsWith("CANCELLED") && (
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <NeoBadge variant="red" style={{ marginBottom: 10 }}>{STATE_COPY[trip.state]}</NeoBadge>
          <NeoButton variant="white" fullWidth onClick={onFinished}>
            Back to Live Radar
          </NeoButton>
        </div>
      )}
    </NeoCard>
  );
}
