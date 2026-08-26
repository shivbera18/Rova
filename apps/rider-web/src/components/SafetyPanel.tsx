import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CircleCheck, PhoneCall, Share2, ShieldCheck, UserRoundCheck, X } from "lucide-react";
import { NeoCard, NeoButton, NeoInput } from "./NeoComponents";

export function SafetyPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const [contact, setContact] = useState(() => localStorage.getItem("chalox.safety.contact") ?? "");
  const [saved, setSaved] = useState(false);

  async function shareTrip(): Promise<void> {
    const data = {
      title: "My Chalo-X trip",
      text: "Track my current Chalo-X ride. If I need help, please contact me.",
      url: window.location.href,
    };
    if (navigator.share) {
      await navigator.share(data).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(`${data.text} ${data.url}`);
    setSaved(true);
  }

  function saveContact(): void {
    localStorage.setItem("chalox.safety.contact", contact);
    setSaved(true);
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop" />
        <Dialog.Content
          className="radix-safety-content"
          aria-describedby="safety-description"
          style={{ width: "min(460px, calc(100vw - 32px))", outline: "none" }}
        >
          <NeoCard elevation="lg" style={{ padding: 26, background: "#ffffff" }}>
            <div className="spread" style={{ marginBottom: 8 }}>
              <span className="eyebrow">RIDER SAFETY CENTRE</span>
              <Dialog.Close asChild>
                <button
                  className="brut-btn brut-btn-white brut-btn-sm"
                  aria-label="Close Safety Centre"
                  style={{ width: 28, height: 28, padding: 0 }}
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <Dialog.Title asChild>
              <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>
                Help is one tap away
              </h2>
            </Dialog.Title>

            <Dialog.Description id="safety-description" className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
              Direct emergency dispatch, live journey sharing, and trusted contact alerts.
            </Dialog.Description>

            <div className="col" style={{ gap: 10, marginBottom: 18 }}>
              <a
                className="brut-btn brut-btn-red brut-btn-full"
                href="tel:112"
                style={{ textDecoration: "none", padding: "12px 18px", gap: 10 }}
              >
                <PhoneCall size={18} />
                <span>Call Emergency Police (112)</span>
              </a>

              <NeoButton
                variant="white"
                fullWidth
                onClick={() => void shareTrip()}
                style={{ padding: "12px 18px", gap: 10 }}
              >
                <Share2 size={18} />
                <span>Share Live Journey Link</span>
              </NeoButton>
            </div>

            <div className="booking-divider"><span>TRUSTED CONTACT</span></div>

            <div style={{ marginTop: 12 }}>
              <NeoInput
                label="Trusted Phone Number"
                type="tel"
                placeholder="+91..."
                value={contact}
                onChange={(e) => {
                  setContact(e.target.value);
                  setSaved(false);
                }}
              />
              <NeoButton variant="primary" fullWidth onClick={saveContact}>
                <UserRoundCheck size={16} />
                <span>Save Trusted Contact</span>
              </NeoButton>
            </div>

            {saved && (
              <div className="ok-text" style={{ marginTop: 12 }}>
                <CircleCheck size={14} /> Trusted contact saved successfully
              </div>
            )}

            <div
              className="brut-card"
              style={{
                marginTop: 18,
                padding: 14,
                background: "var(--paper-subtle)",
                borderRadius: "var(--radius-sm)",
                borderColor: "var(--ink)",
              }}
            >
              <div className="row" style={{ gap: 6, fontWeight: 800, fontSize: 12.5, color: "var(--ink)" }}>
                <ShieldCheck size={16} color="var(--green)" />
                <span>Before Every Ride</span>
              </div>
              <ul style={{ margin: "8px 0 0 18px", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.5 }}>
                <li>Match license plate number with your driver's app</li>
                <li>Verify your 4-digit start OTP before boarding</li>
                <li>Track live road telemetry during your trip</li>
              </ul>
            </div>
          </NeoCard>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
