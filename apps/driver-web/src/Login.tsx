import { useState } from "react";
import { api, setToken } from "./api";
import { Landing } from "./Landing";

type Mode = "OTP" | "PASSWORD";
type Step = "PHONE" | "OTP";

export function Login({ onAuth }: { onAuth: (token: string) => void }) {
  const [mode, setMode] = useState<Mode>("OTP");
  const [step, setStep] = useState<Step>("PHONE");
  const [phone, setPhone] = useState("+919900000101");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (mode === "PASSWORD") {
        const sess = await api.passwordLogin(phone, password, "DRIVER");
        if (sess.role !== "DRIVER") throw new Error("This account is not a driver");
        setToken(sess.token);
        localStorage.setItem("chalox.driver.seenLanding", "1");
        onAuth(sess.token);
      } else if (step === "PHONE") {
        await api.sendOtp(phone);
        setStep("OTP");
      } else {
        const sess = await api.verifyOtp(phone, otp);
        if (sess.role !== "DRIVER") throw new Error("This account is not a driver");
        setToken(sess.token);
        localStorage.setItem("chalox.driver.seenLanding", "1");
        onAuth(sess.token);
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative" }}>
      {/* decorative brutal shapes */}
      <div aria-hidden style={{ position: "absolute", top: -50, left: -60, width: 220, height: 220, background: "var(--teal)", border: "3px solid var(--ink)", borderRadius: "50%", boxShadow: "8px 8px 0 var(--ink)" }} />
      <div aria-hidden style={{ position: "absolute", bottom: -60, right: -40, width: 180, height: 180, background: "var(--yellow)", border: "3px solid var(--ink)", borderRadius: "50%", boxShadow: "6px 6px 0 var(--ink)" }} />

      <div className="brut-card" style={{ width: "100%", maxWidth: 420, zIndex: 2 }}>
        <div className="spread" style={{ marginBottom: 6 }}>
          <h1 style={{ fontSize: 30 }}>CHALO<span style={{ color: "var(--teal)" }}>-X</span></h1>
          <span className="brut-badge brut-badge-blue">🛵 DRIVER</span>
        </div>
        <div className="muted" style={{ fontWeight: 700, marginBottom: 18 }}>
          Drive your price. Every rupee you agree on is yours.
        </div>

        <div className="brut-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "OTP"} className={`brut-tab ${mode === "OTP" ? "active" : ""}`}
            onClick={() => { setMode("OTP"); setErr(null); }}>
            📱 OTP Login
          </button>
          <button type="button" role="tab" aria-selected={mode === "PASSWORD"} className={`brut-tab ${mode === "PASSWORD" ? "active" : ""}`}
            onClick={() => { setMode("PASSWORD"); setErr(null); }}>
            🔒 Password
          </button>
        </div>

        <form onSubmit={submit} noValidate>
          <label className="step-label" htmlFor="dphone">Phone number</label>
          <input id="dphone" className="brut-input" value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 phone number" inputMode="tel" autoComplete="tel"
            disabled={busy || (mode === "OTP" && step === "OTP")} />

          {mode === "OTP" && step === "OTP" && (
            <>
              <label className="step-label" htmlFor="dotp">
                Enter OTP <span className="pill">dev: 123456</span>
              </label>
              <input id="dotp" className="brut-input" value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="••••••" inputMode="numeric" autoFocus disabled={busy} />
            </>
          )}

          {mode === "PASSWORD" && (
            <>
              <label className="step-label" htmlFor="dpass">Password</label>
              <input id="dpass" className="brut-input" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="Your password"
                autoComplete="current-password" autoFocus />
              <div className="ok-text" style={{ marginTop: 10 }}>
                First time? Any password ≥ 4 chars registers this phone automatically.
              </div>
            </>
          )}

          {err && <div className="error-text">{err}</div>}

          <button className="brut-btn brut-btn-primary brut-btn-full" type="submit"
            style={{ marginTop: 16, fontSize: 16 }}
            disabled={busy || phone.length < 6 || (mode === "PASSWORD" ? password.length < 4 : step === "OTP" && otp.length < 6)}>
            {busy
              ? "Please wait…"
              : mode === "PASSWORD"
                ? "🔒 Sign in with password"
                : step === "PHONE"
                  ? "📲 Send OTP"
                  : "✅ Verify & drive"}
          </button>

          {mode === "OTP" && step === "OTP" && (
            <button type="button" className="brut-btn brut-btn-white brut-btn-full"
              style={{ marginTop: 10, fontSize: 12.5 }}
              disabled={busy} onClick={() => setStep("PHONE")}>
              ← Use a different number
            </button>
          )}
        </form>

        <button type="button" className="brut-btn brut-btn-white brut-btn-full" style={{ marginTop: 14, fontSize: 12.5 }}
          onClick={() => window.open("http://localhost:5173/", "_blank")}>
          Switch to Rider app →
        </button>
      </div>
    </div>
  );
}

export function DriverLanding({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <Landing audience="DRIVER" onGetStarted={onGetStarted} onDriverLogin={() => window.open("http://localhost:5173/", "_blank")} />
  );
}
