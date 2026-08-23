import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, getToken, setToken } from "../api";

type Mode = "OTP" | "PASSWORD";
type Step = "PHONE" | "OTP";

export default function Login({ onAuth }: { onAuth: () => void }): React.ReactElement {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("OTP");
  const [phone, setPhone] = useState("+919900000001");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let token: string | undefined;
      if (mode === "PASSWORD") {
        const res = await api<{ token?: string }>("/v1/auth/login/password", {
          body: { phone, password, role: "RIDER" },
        });
        token = res.token;
      } else if (!sent) {
        await api("/v1/auth/otp/send", { body: { phone } });
        setSent(true);
      } else {
        const res = await api<{ token: string }>("/v1/auth/otp/verify", {
          body: { phone, otp, role: "RIDER" },
        });
        token = res.token;
      }
      if (!token) throw new ApiError(400, "NO_TOKEN", "Sign-in did not return a session — try OTP mode.");
      setToken(token);
      localStorage.setItem("chalox.rider.seenLanding", "1");
      onAuth();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    !busy &&
    phone.length >= 6 &&
    (mode === "PASSWORD" ? password.length >= 4 : sent ? otp.length >= 6 : true);

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        position: "relative",
        overflowY: "auto",
      }}
    >
      {/* decorative brutal shapes */}
      <div aria-hidden style={{ position: "absolute", top: -40, right: -60, width: 200, height: 200, background: "var(--blue)", border: "3px solid var(--ink)", borderRadius: "50%", boxShadow: "8px 8px 0 var(--ink)" }} />
      <div aria-hidden style={{ position: "absolute", bottom: -50, left: -40, width: 170, height: 170, background: "var(--pink)", border: "3px solid var(--ink)", borderRadius: "50%", boxShadow: "6px 6px 0 var(--ink)" }} />

      <div className="brut-card" style={{ width: "100%", maxWidth: 420, position: "relative", zIndex: 2 }}>
        <div className="spread" style={{ marginBottom: 6 }}>
          <h1 style={{ fontSize: 30 }}>
            CHALO<span style={{ color: "var(--blue)" }}>-X</span>
          </h1>
          <span className="brut-badge brut-badge-yellow">RIDER</span>
        </div>
        <p className="muted" style={{ fontWeight: 700, marginBottom: 18 }}>
          Name your price. Riders set the fare — drivers decide.
        </p>

        <div className="brut-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "OTP"}
            className={`brut-tab ${mode === "OTP" ? "active" : ""}`}
            onClick={() => {
              setMode("OTP");
              setError(null);
            }}
          >
            📱 OTP Login
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "PASSWORD"}
            className={`brut-tab ${mode === "PASSWORD" ? "active" : ""}`}
            onClick={() => {
              setMode("PASSWORD");
              setError(null);
            }}
          >
            🔒 Password
          </button>
        </div>

        <form onSubmit={(e) => void submit(e)} noValidate>
          <label className="step-label" htmlFor="phone">
            Phone number
          </label>
          <input
            id="phone"
            className="brut-input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+919876543210"
            autoComplete="tel"
          />

          {mode === "OTP" && sent && (
            <>
              <label className="step-label" htmlFor="otp">
                Enter OTP <span className="pill">dev: 123456</span>
              </label>
              <input
                id="otp"
                className="brut-input"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="••••••"
                inputMode="numeric"
                autoFocus
              />
            </>
          )}

          {mode === "PASSWORD" && (
            <>
              <label className="step-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="brut-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                autoFocus
              />
              <div className="ok-text" style={{ marginTop: 10 }}>
                First time? Any password ≥ 4 chars registers this phone automatically.
              </div>
            </>
          )}

          {error && <div className="error-text">{error}</div>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="brut-btn brut-btn-primary brut-btn-full"
            style={{ marginTop: 16, fontSize: 16 }}
          >
            {busy
              ? "Please wait…"
              : mode === "PASSWORD"
                ? "🔒 Sign in with password"
                : sent
                  ? "✅ Verify & sign in"
                  : "📲 Send OTP"}
          </button>

          {mode === "OTP" && sent && (
            <button
              type="button"
              className="brut-btn brut-btn-white brut-btn-full"
              style={{ marginTop: 10, fontSize: 12.5 }}
              disabled={busy}
              onClick={() => setSent(false)}
            >
              ← Use a different number
            </button>
          )}
        </form>

        {!getToken() && (
          <button
            type="button"
            className="brut-btn brut-btn-white brut-btn-full"
            style={{ marginTop: 14, fontSize: 12.5 }}
            onClick={() => navigate("/")}
          >
            ← Back to home
          </button>
        )}
      </div>
    </div>
  );
}
