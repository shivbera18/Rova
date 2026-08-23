import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, setToken } from "../api";

export default function Login({ onAuth }: { onAuth: () => void }): React.ReactElement {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("+919900000001");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!sent) {
        await api("/v1/auth/otp/send", { body: { phone } });
        setSent(true);
      } else {
        const res = await api<{ token: string }>("/v1/auth/otp/verify", {
          body: { phone, otp, role: "RIDER" },
        });
        setToken(res.token);
        onAuth();
        navigate("/", { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>
          Chalo<span className="brand">-X</span>
        </h1>
        <p className="muted">Name your price. Riders set the fare — drivers decide.</p>
        <form onSubmit={(e) => void submit(e)}>
          <label className="step-label" htmlFor="phone">
            Phone number
          </label>
          <input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+919876543210"
            autoComplete="tel"
          />
          {sent && (
            <>
              <label className="step-label" htmlFor="otp">
                OTP (dev: 123456)
              </label>
              <input
                id="otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                inputMode="numeric"
                autoFocus
              />
            </>
          )}
          {error && <div className="error-text">{error}</div>}
          <button className="btn-primary" disabled={busy || phone.length < 6 || (sent && otp.length < 6)}>
            {sent ? "Verify & sign in" : "Send OTP"}
          </button>
        </form>
      </div>
    </div>
  );
}
