import { useState } from "react";
import { api, setToken } from "./api";

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
      <div className="brut-card" style={{ width: "100%", maxWidth: 420, padding: 32, zIndex: 2, background: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 28 }}>🛵</span>
          <div>
            <h1 style={{ fontSize: 24, textTransform: "uppercase" }}>Driver Partner</h1>
            <span className="brut-badge brut-badge-green">100% FARE TAKE-HOME</span>
          </div>
        </div>

        <p style={{ color: "var(--ink-soft)", fontWeight: 500, fontSize: 13.5, marginBottom: 20 }}>
          {mode === "PASSWORD"
            ? "Sign in with your phone and account password"
            : step === "PHONE"
            ? "Enter your phone number to receive an instant verification code"
            : `Enter 6-digit OTP sent to ${phone}`}
        </p>

        {err && (
          <div className="brut-badge brut-badge-red" style={{ width: "100%", padding: "8px 12px", marginBottom: 16, textTransform: "none", fontSize: 13 }}>
            ⚠️ {err}
          </div>
        )}

        <form onSubmit={submit} noValidate>
          {step === "PHONE" && (
            <>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 700, fontSize: 12.5, textTransform: "uppercase" }}>
                Vehicle Type
              </label>
              <select
                className="brut-input"
                style={{ marginBottom: 16, cursor: "pointer" }}
                value={vehicleClass}
                onChange={(e) => setVehicleClass(e.target.value)}
              >
                <option value="BIKE">🏍️ Bike Taxi</option>
                <option value="AUTO">🛺 Auto Rickshaw</option>
                <option value="CAB_MINI">🚗 Mini Cab</option>
                <option value="CAB_PRIME">🚘 Prime Sedan</option>
              </select>

              <label style={{ display: "block", marginBottom: 6, fontWeight: 700, fontSize: 12.5, textTransform: "uppercase" }}>
                Phone Number
              </label>
              <input
                className="brut-input"
                type="tel"
                placeholder="+91..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{ marginBottom: 16 }}
                autoFocus
              />
            </>
          )}

          {step === "OTP" && (
            <>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 700, fontSize: 12.5, textTransform: "uppercase" }}>
                Verification OTP
              </label>
              <input
                className="brut-input"
                type="text"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                style={{ marginBottom: 16 }}
                autoFocus
              />

              <label style={{ display: "block", marginBottom: 6, fontWeight: 700, fontSize: 12.5, textTransform: "uppercase" }}>
                Set Password (Optional)
              </label>
              <input
                className="brut-input"
                type="password"
                placeholder="Optional login password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ marginBottom: 16 }}
              />
            </>
          )}

          <button className="brut-btn brut-btn-primary brut-btn-full" type="submit" disabled={busy}>
            {busy ? "Authenticating..." : step === "PHONE" ? "Get Login Code →" : "Verify & Launch Radar 🚀"}
          </button>

          {step === "OTP" && (
            <button
              type="button"
              className="brut-btn brut-btn-white brut-btn-full"
              style={{ marginTop: 10, fontSize: 12.5 }}
              disabled={busy}
              onClick={() => setStep("PHONE")}
            >
              ← Use a different number
            </button>
          )}
        </form>

        <button
          type="button"
          className="brut-btn brut-btn-white brut-btn-full"
          style={{ marginTop: 14, fontSize: 12.5 }}
          onClick={() => window.open("http://localhost:5173/", "_blank")}
        >
          Switch to Rider App →
        </button>
      </div>
    </div>
  );
}
