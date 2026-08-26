import { useCallback, useEffect, useState } from "react";
import { formatINR, paisa, type TripView } from "@chalo/protocol";
import { Flag, KeyRound, MapPin, Navigation, Rocket, Star, TriangleAlert } from "lucide-react";
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

/** Post-ride rating of the rider — mirrors the rider's driver-rating card. */
function RateRiderCard({ trip, onDone }: { trip: TripView; onDone: () => void }): React.ReactElement {
  const [stars, setStars] = useState(trip.myRatingStars ?? 5);
  const [comment, setComment] = useState("");
  const [rated, setRated] = useState(trip.myRatingStars != null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (rated) {
    return (
      <div style={{ textAlign: "center", margin: "10px 0" }}>
        <NeoBadge variant="green" style={{ marginBottom: 10 }}>
          <Star size={11} fill="currentColor" /> You rated this rider {trip.myRatingStars ?? stars}
        </NeoBadge>
        <NeoButton variant="primary" fullWidth onClick={onDone}>
          Back to Live Radar
        </NeoButton>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, textAlign: "left" }}>
      <div className="booking-divider"><span>RATE YOUR RIDER</span></div>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", textAlign: "center", margin: "8px 0" }}>
        How was {(trip.riderName || "the rider").split(" ")[0]}?
      </p>
      <div className="star-row" role="radiogroup" aria-label="Rider rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className={`star-btn ${n <= stars ? "on" : ""}`}
            onClick={() => setStars(n)}
          >
            <Star size={20} fill={n <= stars ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      <NeoInput
        label="Add a note (optional)"
        placeholder="Anything worth mentioning?"
        value={comment}
        maxLength={280}
        onChange={(e) => setComment(e.target.value)}
      />
      {err && (
        <div className="error-text" role="alert" style={{ marginBottom: 8 }}>
          <TriangleAlert size={13} /> {err}
        </div>
      )}
      <div className="col" style={{ gap: 6 }}>
        <NeoButton
          variant="primary"
          fullWidth
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setErr(null);
            void api
              .rateTrip(trip.id, stars, comment.trim() || undefined)
              .then(() => {
                setRated(true);
                trip.myRatingStars = stars;
              })
              .catch((e) => setErr(e instanceof Error ? e.message : "Could not submit rating"))
              .finally(() => setBusy(false));
          }}
        >
          Submit {stars}-star rating
        </NeoButton>
        <NeoButton variant="white" fullWidth onClick={onDone}>
          Skip for now
        </NeoButton>
      </div>
    </div>
  );
}

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
        <div className="spread" style={{ fontSize: 12, padding: "2px 0", alignItems: "flex-start" }}>
          <span style={{ color: "var(--ink-muted)", fontWeight: 700, flexShrink: 0 }}>Pickup</span>
          <strong style={{ fontSize: 11.5, textAlign: "right" }}>
            {trip.pickupLabel ?? `${trip.pickup.lat.toFixed(4)}, ${trip.pickup.lng.toFixed(4)}`}
          </strong>
        </div>
        <div className="spread" style={{ fontSize: 12, padding: "2px 0", alignItems: "flex-start" }}>
          <span style={{ color: "var(--ink-muted)", fontWeight: 700, flexShrink: 0 }}>Drop</span>
          <strong style={{ fontSize: 11.5, textAlign: "right" }}>
            {trip.dropLabel ?? `${trip.drop.lat.toFixed(4)}, ${trip.drop.lng.toFixed(4)}`}
          </strong>
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
          <RateRiderCard trip={trip} onDone={onFinished} />
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
