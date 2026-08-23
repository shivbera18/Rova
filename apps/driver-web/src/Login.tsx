import { useState } from "react";
import { api, setToken } from "./api";

export function Login({ onAuth }: { onAuth: (token: string) => void }) {
  const [phone, setPhone] = useState("+919900000101");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (step === "phone") {
        await api.sendOtp(phone);
        setStep("otp");
      } else {
        const sess = await api.verifyOtp(phone, otp);
        if (sess.role !== "DRIVER") throw new Error("This account is not a driver");
        setToken(sess.token);
        onAuth(sess.token);
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>
          Chalo-X<span className="x"> Driver</span>
        </h1>
        <div className="sub">Drive your price. Every rupee you agree on is yours.</div>
        <form onSubmit={submit}>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 phone number"
            inputMode="tel"
            autoComplete="tel"
            disabled={busy || step === "otp"}
          />
          {step === "otp" && (
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="6-digit OTP"
              inputMode="numeric"
              autoFocus
              disabled={busy}
            />
          )}
          {err && <div className="err-big">{err}</div>}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Please wait…" : step === "phone" ? "Send OTP" : "Verify & drive"}
          </button>
          {step === "otp" && (
            <button type="button" className="ghost" onClick={() => setStep("phone")} disabled={busy}>
              Use a different number
            </button>
          )}
        </form>
        <div className="login-hint">Dev OTP is always 123456.</div>
      </div>
    </div>
  );
}
