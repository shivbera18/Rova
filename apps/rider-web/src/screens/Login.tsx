import { useState } from "react";
import type { AuthSession } from "@chalo/protocol";
import { ArrowLeft, ArrowRight, Rocket, TriangleAlert, CarFront } from "lucide-react";
import { setToken } from "../api";
import { useNavigate } from "react-router-dom";
import { NeoButton, NeoCard, NeoBadge, NeoInput } from "../components/NeoComponents";

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
      <NeoCard elevation="lg" style={{ width: "100%", maxWidth: 420, padding: 32, background: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ color: "var(--primary)", display: "grid", placeItems: "center", width: 40, height: 40, border: "var(--brut-border-thin)", borderRadius: "var(--radius-sm)", background: "var(--primary-soft)" }}>
            <CarFront size={22} />
          </span>
          <div>
            <h1 style={{ fontSize: 24, textTransform: "uppercase" }}>Rider Sign-In</h1>
            <NeoBadge variant="primary">NAME YOUR FARE</NeoBadge>
          </div>
        </div>

        <p style={{ color: "var(--ink-soft)", fontWeight: 500, fontSize: 13.5, marginBottom: 20 }}>
          {step === "PHONE"
            ? "Enter your phone number to receive an instant verification code"
            : `Enter 6-digit OTP sent to ${phone}`}
        </p>

        {error && (
          <div className="error-text" style={{ marginBottom: 16 }} role="alert">
            <TriangleAlert size={14} /> {error}
          </div>
        )}

        <form onSubmit={submit} noValidate>
          {step === "PHONE" && (
            <NeoInput
              label="Phone Number"
              type="tel"
              placeholder="+91..."
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
            />
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
            {busy
              ? "Authenticating..."
              : step === "PHONE"
                ? <>Get Login Code <ArrowRight size={15} /></>
                : <>Verify & Book Rides <Rocket size={15} /></>}
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
              <ArrowLeft size={14} /> Use a different number
            </NeoButton>
          )}
        </form>

        <NeoButton
          variant="white"
          fullWidth
          type="button"
          style={{ marginTop: 14, fontSize: 12.5 }}
          onClick={() => navigate("/")}
        >
          <ArrowLeft size={14} /> Back to Home
        </NeoButton>
      </NeoCard>
    </div>
  );
}
