import { useState } from "react";
import { FileCheck2, LockKeyhole } from "lucide-react";
import { api } from "./api";
import { NeoCard, NeoButton, NeoBadge, NeoInput } from "./NeoComponents";

export function OnboardingCard({
  vehicle,
  status,
  onUpdated,
}: {
  vehicle: string;
  status: string;
  onUpdated: () => void;
}) {
  const [plate, setPlate] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(): Promise<void> {
    try {
      const result = await api.submitOnboarding(plate);
      setMessage(`Documents submitted: ${result.status}`);
      onUpdated();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Submission failed");
    }
  }

  async function approveDev(): Promise<void> {
    try {
      await api.devApproveOnboarding();
      onUpdated();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Approval failed");
    }
  }

  return (
    <main className="driver-onboarding" style={{ minHeight: "100%", display: "grid", placeItems: "center", padding: 20, background: "var(--paper)" }}>
      <NeoCard elevation="lg" style={{ width: "min(480px, 100%)", padding: 32, background: "#ffffff" }}>
        <div className="spread" style={{ marginBottom: 8 }}>
          <span className="eyebrow">DRIVER ONBOARDING</span>
          <NeoBadge variant={status === "APPROVED" ? "green" : "primary"}>
            {status}
          </NeoBadge>
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8, textTransform: "none" }}>
          Complete your vehicle profile
        </h1>

        <div
          className="row"
          style={{
            gap: 8,
            padding: "8px 12px",
            background: "var(--primary-soft)",
            borderRadius: "var(--radius-sm)",
            fontSize: 12.5,
            color: "var(--ink-soft)",
            marginBottom: 20,
          }}
        >
          <LockKeyhole size={16} color="var(--primary)" />
          <span>
            Registered vehicle is locked to <strong>{vehicle}</strong>
          </span>
        </div>

        <NeoInput
          label="Vehicle Registration Plate"
          value={plate}
          placeholder="e.g. KA01AB1234"
          onChange={(e) => setPlate(e.target.value.toUpperCase())}
          autoFocus
        />

        <div className="booking-divider"><span>VERIFICATION REQUIREMENTS</span></div>

        <div className="col" style={{ gap: 8, margin: "14px 0 20px" }}>
          {["Driving License", "Vehicle RC Certificate", "PAN / Bank Details"].map((name) => (
            <div
              key={name}
              className="spread"
              style={{
                padding: "10px 14px",
                background: "var(--paper-subtle)",
                borderRadius: "var(--radius-sm)",
                border: "var(--brut-border-thin)",
              }}
            >
              <div className="row" style={{ gap: 8 }}>
                <FileCheck2 size={16} color="var(--green)" />
                <span style={{ fontWeight: 700, fontSize: 13 }}>{name}</span>
              </div>
              <NeoBadge variant="green">VALIDATED</NeoBadge>
            </div>
          ))}
        </div>

        <NeoButton
          variant="primary"
          fullWidth
          disabled={plate.trim().length < 6}
          onClick={() => void submit()}
        >
          Submit Documents for Review 📄
        </NeoButton>

        {status === "IN_REVIEW" && (
          <NeoButton
            variant="green"
            fullWidth
            style={{ marginTop: 10 }}
            onClick={() => void approveDev()}
          >
            Dev Instant Approve (Pilot Mode) ✓
          </NeoButton>
        )}

        {message && (
          <div className="ok-text" style={{ marginTop: 12 }}>
            {message}
          </div>
        )}
      </NeoCard>
    </main>
  );
}
