import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CircleCheck, Link2, PhoneCall, Share2, ShieldCheck, UserRoundCheck, X } from "lucide-react";
import { getContacts, getShareLink, saveContacts } from "../api";
import { NeoCard, NeoButton, NeoInput } from "./NeoComponents";

const ACTIVE_TRIP_KEY = "chalox.rider.trip";
const ACTIVE_TRIP_STATES = ["DRIVER_ASSIGNED", "ARRIVING", "ARRIVED", "ONGOING"];

export function SafetyPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const [contact, setContact] = useState("");
  const [contactName, setContactName] = useState("");
  const [saved, setSaved] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tripId] = useState<string | null>(() => {
    try {
      const raw = localStorage.getItem(ACTIVE_TRIP_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { id: string; state: string };
      return parsed.id && ACTIVE_TRIP_STATES.includes(parsed.state) ? parsed.id : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let stale = false;
    void getContacts()
      .then((res) => {
        if (stale) return;
        const first = res.contacts[0];
        if (first) {
          setContact(first.phone);
          setContactName(first.name);
        }
      })
      .catch(() => undefined);
    return () => {
      stale = true;
    };
  }, []);

  async function shareTrip(): Promise<void> {
    setError(null);
    try {
      let url: string;
      if (tripId) {
        url = (await getShareLink(tripId)).url;
      } else {
        // no active trip — the landing page is all we can honestly share
        url = window.location.origin;
      }
      setShareUrl(url);
      const data = {
        title: "My Chalo-X journey",
        text: tripId ? "Track my live Chalo-X ride. If I need help, please contact me." : "Chalo-X — I'll share my live ride link once booked.",
        url,
      };
      if (navigator.share) {
        await navigator.share(data).catch(() => undefined);
        return;
      }
      await navigator.clipboard.writeText(`${data.text} ${data.url}`);
      setSaved(true);
    } catch {
      setError("Could not create a share link");
    }
  }

  async function saveContact(): Promise<void> {
    setError(null);
    try {
      await saveContacts({ contacts: [{ name: contactName || contact, phone: contact }] });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save contact");
    }
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
              Emergency dispatch, a live journey link anyone can open, and your trusted contact synced to your account.
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
                <span>{tripId ? "Share Live Journey Link" : "Share App Link"}</span>
              </NeoButton>
            </div>

            {shareUrl && (
              <div
                className="row"
                style={{
                  gap: 6,
                  marginBottom: 14,
                  padding: "8px 10px",
                  background: "var(--paper-subtle)",
                  border: "var(--brut-border-thin)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 11.5,
                  alignItems: "center",
                }}
              >
                <Link2 size={13} />
                <span style={{ wordBreak: "break-all", fontWeight: 700 }}>{shareUrl}</span>
              </div>
            )}

            <div className="booking-divider"><span>TRUSTED CONTACT</span></div>

            <div style={{ marginTop: 12 }}>
              <NeoInput
                label="Contact Name (optional)"
                type="text"
                placeholder="Mom"
                value={contactName}
                onChange={(e) => {
                  setContactName(e.target.value);
                  setSaved(false);
                }}
              />
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
              <NeoButton variant="primary" fullWidth onClick={() => void saveContact()}>
                <UserRoundCheck size={16} />
                <span>Save Trusted Contact</span>
              </NeoButton>
            </div>

            {saved && (
              <div className="ok-text" style={{ marginTop: 12 }}>
                <CircleCheck size={14} /> Trusted contact saved to your account
              </div>
            )}

            {error && (
              <div className="error-text" role="alert" style={{ marginTop: 12 }}>
                {error}
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
                <li>Verify your start OTP before boarding</li>
                <li>Share your live journey link with someone you trust</li>
              </ul>
            </div>
          </NeoCard>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
