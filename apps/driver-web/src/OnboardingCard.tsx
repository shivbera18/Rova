import { useState } from "react";
import { FileCheck2, LockKeyhole } from "lucide-react";
import { api } from "./api";

export function OnboardingCard({ vehicle, status, onUpdated }: { vehicle: string; status: string; onUpdated: () => void }): React.ReactElement {
  const [plate, setPlate] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(): Promise<void> {
    try { const result = await api.submitOnboarding(plate); setMessage(`Documents submitted: ${result.status}`); onUpdated(); }
    catch (err) { setMessage(err instanceof Error ? err.message : "Submission failed"); }
  }
  async function approveDev(): Promise<void> {
    try { await api.devApproveOnboarding(); onUpdated(); }
    catch (err) { setMessage(err instanceof Error ? err.message : "Approval failed"); }
  }

  return (
    <main className="driver-onboarding">
      <section className="brut-card onboarding-card">
        <span className="eyebrow">DRIVER ONBOARDING</span>
        <h1>Complete your vehicle profile</h1>
        <p className="onboarding-lock-copy"><LockKeyhole size={16}/> Your registered vehicle is locked to <strong>{vehicle.replaceAll("_", " ")}</strong>. Submit its plate for review.</p>
        <div className="onboarding-steps"><span className="done">1<br/><small>Account</small></span><i/><span className={status === "PENDING_DOCS" ? "current" : "done"}>2<br/><small>Vehicle</small></span><i/><span className={status === "IN_REVIEW" ? "current" : ""}>3<br/><small>Review</small></span></div>
        <label className="step-label" htmlFor="plate">Vehicle registration plate</label>
        <input id="plate" className="brut-input" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="KA 01 AB 1234" />
        <div className="document-list">
          {['Driver licence','Vehicle RC','PAN / bank'].map((name) => <div key={name}><FileCheck2 size={15}/><b>{name}</b><small>Demo verification</small></div>)}
        </div>
        <button className="brut-btn brut-btn-primary brut-btn-full" disabled={plate.trim().length < 6} onClick={() => void submit()}>Submit for review</button>
        {status === "IN_REVIEW" && <button className="brut-btn brut-btn-green brut-btn-full" style={{ marginTop: 10 }} onClick={() => void approveDev()}>Approve demo profile</button>}
        {message && <div className="ok-text">{message}</div>}
      </section>
    </main>
  );
}
