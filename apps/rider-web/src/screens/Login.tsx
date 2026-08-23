import { useState } from "react";
import type { AuthSession } from "@chalo/protocol";
import { setToken } from "../api";
import { useNavigate } from "react-router-dom";

type Mode = "OTP" | "PASSWORD";
type Step = "PHONE" | "OTP";

export default function Login({ onAuth }: { onAuth: () => void }): React.ReactElement {
  const [mode] = useState<Mode>("OTP");
  const [step, setStep] = useState<Step>("PHONE");
  const [phone, setPhone] = useState(import.meta.env.DEV ? "+919900000001" : "");
  const [otp, setOtp] = useState("");
  const [password] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "PASSWORD") {
        const res = await fetch("/v1/auth/login/password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phone, password, role: "RIDER" }),
        });
        const json = (await res.json()) as AuthSession & { message?: string };
        if (!res.ok) throw new Error(json.message || "Invalid credentials");
        setToken(json.token);
        onAuth();
      } else if (step === "PHONE") {
        const res = await fetch("/v1/auth/otp/send", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        const json = (await res.json()) as { devHint?: string; message?: string };
        if (!res.ok) throw new Error(json.message || "Failed to send code");
        if (json.devHint) setOtp(json.devHint);
        setStep("OTP");
      } else {
        const res = await fetch("/v1/auth/otp/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phone, otp, role: "RIDER", ...(newPassword ? { newPassword } : {}) }),
        });
        const json = (await res.json()) as AuthSession & { message?: string };
        if (!res.ok) throw new Error(json.message || "Invalid OTP code");
        setToken(json.token);
        onAuth();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--paper)" }}>
      <div className="brut-card" style={{ width: "100%", maxWidth: 420, padding: 32, background: "#ffffff", boxShadow: "var(--shadow-lg)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 28 }}>🚗</span>
          <div>
            <h1 style={{ fontSize: 24, textTransform: "uppercase" }}>Rider Sign-In</h1>
            <span className="brut-badge brut-badge-primary">NAME YOUR FARE</span>
          </div>
        </div>

        <p style={{ color: "var(--ink-soft)", fontWeight: 500, fontSize: 13.5, marginBottom: 20 }}>
          {step === "PHONE"
            ? "Enter your phone number to receive an instant verification code"
            : `Enter 6-digit OTP sent to ${phone}`}
        </p>

        {error && (
          <div className="error-text" style={{ marginBottom: 16 }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={submit} noValidate>
          {step === "PHONE" && (
            <>
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
            {busy ? "Authenticating..." : step === "PHONE" ? "Get Login Code →" : "Verify & Book Rides 🚀"}
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
          onClick={() => navigate("/")}
        >
          ← Back to Home
        </button>
      </div>
    </div>
  );
}
