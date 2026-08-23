import { useState } from "react";
import { api, setToken } from "./api";
import { NeoButton, NeoCard, NeoBadge, NeoInput } from "./NeoComponents";

type Mode = "OTP" | "PASSWORD";
type Step = "PHONE" | "OTP";

export function Login({ onAuth }: { onAuth: (token: string) => void }) {
  const [mode] = useState<Mode>("OTP");
  const [step, setStep] = useState<Step>("PHONE");
  const [phone, setPhone] = useState(import.meta.env.DEV ? "+919900000101" : "");
  const [otp, setOtp] = useState("");
  const [vehicleClass, setVehicleClass] = useState("BIKE");
  const [password] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (mode === "PASSWORD") {
        const sess = await api.passwordLogin(phone, password, "DRIVER", vehicleClass);
        if (sess.role !== "DRIVER") throw new Error("This account is not a driver");
        setToken(sess.token);
        localStorage.setItem("chalox.driver.seenLanding", "1");
        onAuth(sess.token);
      } else if (step === "PHONE") {
        const res = await api.sendOtp(phone);
        if (res.devHint) setOtp(res.devHint);
        setStep("OTP");
      } else {
        const sess = await api.verifyOtp(phone, otp, vehicleClass, newPassword || undefined);
        if (sess.role !== "DRIVER") throw new Error("This account is not a driver");
        setToken(sess.token);
        localStorage.setItem("chalox.driver.seenLanding", "1");
        onAuth(sess.token);
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative", background: "var(--paper)" }}>
      <NeoCard elevation="lg" style={{ width: "100%", maxWidth: 420, padding: 32, zIndex: 2, background: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 28 }}>🛵</span>
          <div>
            <h1 style={{ fontSize: 24, textTransform: "uppercase" }}>Driver Partner</h1>
            <NeoBadge variant="green">100% FARE TAKE-HOME</NeoBadge>
          </div>
        </div>

        <p style={{ color: "var(--ink-soft)", fontWeight: 500, fontSize: 13.5, marginBottom: 20 }}>
          {step === "PHONE"
            ? "Enter your phone number to receive an instant verification code"
            : `Enter 6-digit OTP sent to ${phone}`}
        </p>

        {err && (
          <div className="error-text" style={{ marginBottom: 16 }}>
            ⚠️ {err}
          </div>
        )}

        <form onSubmit={submit} noValidate>
          {step === "PHONE" && (
            <>
              <label
                htmlFor="vehicle-type"
                style={{
                  display: "block",
                  marginBottom: 6,
                  fontWeight: 700,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "var(--ink)",
                }}
              >
                Vehicle Type
              </label>
              <select
                id="vehicle-type"
                className="brut-select"
                style={{ marginBottom: 14, cursor: "pointer" }}
                value={vehicleClass}
                onChange={(e) => setVehicleClass(e.target.value)}
              >
                <option value="BIKE">🏍️ Bike Taxi</option>
                <option value="AUTO">🛺 Auto Rickshaw</option>
                <option value="CAB_MINI">🚗 Mini Cab</option>
                <option value="CAB_PRIME">🚘 Prime Sedan</option>
              </select>

              <NeoInput
                label="Phone Number"
                type="tel"
                placeholder="+91..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
              />
            </>
          )}

          {step === "OTP" && (
            <>
              <NeoInput
                label="Verification OTP"
                type="text"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                autoFocus
              />

              <NeoInput
                label="Set Password (Optional)"
                type="password"
                placeholder="Optional login password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </>
          )}

          <NeoButton variant="primary" fullWidth type="submit" disabled={busy}>
            {busy ? "Authenticating..." : step === "PHONE" ? "Get Login Code →" : "Verify & Launch Radar 🚀"}
          </NeoButton>

          {step === "OTP" && (
            <NeoButton
              variant="white"
              fullWidth
              type="button"
              style={{ marginTop: 10, fontSize: 12.5 }}
              disabled={busy}
              onClick={() => setStep("PHONE")}
            >
              ← Use a different number
            </NeoButton>
          )}
        </form>

        <NeoButton
          variant="white"
          fullWidth
          type="button"
          style={{ marginTop: 14, fontSize: 12.5 }}
          onClick={() => window.open("http://localhost:5173/", "_blank")}
        >
          Switch to Rider App →
        </NeoButton>
      </NeoCard>
    </div>
  );
}
