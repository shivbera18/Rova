import { useCallback, useEffect, useState } from "react";
import { formatINR, paisa, type TripView } from "@chalo/protocol";
import { api } from "./api";

const STATE_COPY: Record<string, string> = {
  DRIVER_ASSIGNED: "Ride assigned — head to the pickup point",
  ARRIVING: "Arriving at pickup",
  ARRIVED: "At pickup — ask the rider for the OTP",
  ONGOING: "Ride in progress",
  COMPLETED: "Ride completed",
};

function navUrl(dest: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}`;
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
  const [tip, setTip] = useState("");
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
    const iv = setInterval(refresh, 3000);
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
      <div className="trip-panel">
        <h3>Loading trip…</h3>
        {err && <div className="err">{err}</div>}
      </div>
    );
  }

  const fare = trip.fareBreakdown;

  return (
    <div className="trip-panel">
      <h3>Trip in progress</h3>
      <div className="trip-state-line">
        Status: <b>{STATE_COPY[trip.state] ?? trip.state}</b>
      </div>
      <div className="stop pickup">
        <span className="dot" />
        <div>
          {trip.pickup.lat.toFixed(5)}, {trip.pickup.lng.toFixed(5)}
          <br />
          <span>Pickup</span>
        </div>
      </div>
      <div className="stop drop">
        <span className="dot" />
        <div>
          {trip.drop.lat.toFixed(5)}, {trip.drop.lng.toFixed(5)}
          <br />
          <span>Drop</span>
        </div>
      </div>
      <div className="trip-fare">
        <span>
          Your pay ({fare.mode === "NEGOTIATED" ? "negotiated" : "list"})
          {fare.tipPaise > 0 ? ` + ${formatINR(paisa(fare.tipPaise))} tip` : ""}
        </span>
        <b>{formatINR(paisa(fare.agreedPaise + fare.tipPaise))}</b>
      </div>

      {(trip.state === "DRIVER_ASSIGNED" || trip.state === "ARRIVING") && (
        <div className="btn-row">
          <button className="primary" onClick={() => window.open(navUrl(trip.pickup), "_blank")}>
            Navigate to pickup
          </button>
          {trip.state === "DRIVER_ASSIGNED" ? (
            <button
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await api.tripState(tripId, "ARRIVING");
                })
              }
            >
              I'm on my way (ARRIVING)
            </button>
          ) : (
            <button
              className="good"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await api.tripState(tripId, "ARRIVED");
                })
              }
            >
              I've arrived (ARRIVED)
            </button>
          )}
        </div>
      )}

      {trip.state === "ARRIVED" && (
        <form
          className="btn-row"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api.startTrip(tripId, otp.trim());
            });
          }}
        >
          <div className="otp-row">
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="OTP"
              inputMode="numeric"
              maxLength={6}
              autoFocus
            />
          </div>
          <button className="good" type="submit" disabled={busy || otp.trim().length === 0}>
            Start ride
          </button>
        </form>
      )}

      {trip.state === "ONGOING" && (
        <form
          className="btn-row"
          onSubmit={(e) => {
            e.preventDefault();
            const tipPaise = Math.max(0, Math.round(Number(tip || "0") * 100));
            void act(async () => {
              await api.completeTrip(tripId, Number.isFinite(tipPaise) ? tipPaise : 0);
            });
          }}
        >
          <button className="primary" type="button" onClick={() => window.open(navUrl(trip.drop), "_blank")}>
            Navigate to drop
          </button>
          <div className="tip-row">
            Tip (₹, optional)
            <input value={tip} onChange={(e) => setTip(e.target.value)} inputMode="decimal" />
          </div>
          <button className="good" type="submit" disabled={busy}>
            Complete ride
          </button>
        </form>
      )}

      {trip.state === "COMPLETED" && (
        <div className="btn-row">
          <div style={{ color: "var(--good)", fontWeight: 700 }}>
            Ride complete — earnings updated.
          </div>
          <button className="primary" onClick={onFinished}>
            Back online
          </button>
        </div>
      )}

      {(trip.state === "CANCELLED_RIDER" || trip.state === "CANCELLED_DRIVER") && (
        <div className="btn-row">
          <div style={{ color: "var(--bad)" }}>This ride was cancelled.</div>
          <button onClick={onFinished}>Close</button>
        </div>
      )}

      {err && <div className="err">{err}</div>}
    </div>
  );
}
