import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CircleCheck, Link2, PhoneCall, Plus, Share2, ShieldCheck, Trash2, UserRoundCheck, X } from "lucide-react";
import { getContacts, getShareLink, getTrip, saveContacts } from "../api";
import { NeoCard, NeoButton, NeoInput } from "./NeoComponents";

const ACTIVE_TRIP_KEY = "chalox.rider.trip";
const ACTIVE_TRIP_STATES = ["DRIVER_ASSIGNED", "ARRIVING", "ARRIVED", "ONGOING"];

type Contact = { name: string; phone: string };

export function SafetyPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [saved, setSaved] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveTripId, setLiveTripId] = useState<string | null>(null);

  // The cached trip may be stale (closed tab mid-ride) — confirm against the
  // server before offering a "live" share.
  useEffect(() => {
    let stale = false;
    try {
      const raw = localStorage.getItem(ACTIVE_TRIP_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id: string; state: string };
      if (!parsed.id || !ACTIVE_TRIP_STATES.includes(parsed.state)) return;
      void getTrip(parsed.id)
        .then((t) => {
          if (!stale && ACTIVE_TRIP_STATES.includes(t.state)) setLiveTripId(parsed.id);
        })
        .catch(() => undefined);
    } catch {
      /* corrupted key — ignore */
    }
    return () => {
      stale = true;
    };
  }, []);

  useEffect(() => {
    let stale = false;
    void getContacts()
      .then((res) => {
        if (stale) return;
        setContacts(res.contacts.length ? res.contacts : [{ name: "", phone: "" }]);
      })
      .catch(() => {
        if (!stale) setContacts([{ name: "", phone: "" }]);
      });
    return () => {
      stale = true;
    };
  }, []);

  async function shareTrip(): Promise<void> {
    setError(null);
    try {
      let url: string;
      if (liveTripId) {
        url = (await getShareLink(liveTripId)).url;
      } else {
        // no live trip — the landing page is all we can honestly share
        url = window.location.origin;
      }
      setShareUrl(url);
      const data = {
        title: "My Chalo-X journey",
        text: liveTripId ? "Track my live Chalo-X ride. If I need help, please contact me." : "Chalo-X — I'll share my live ride link once booked.",
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

  async function saveAll(): Promise<void> {
    setError(null);
    const filled = contacts.filter((c) => c.name.trim() || c.phone.trim());
    try {
      await saveContacts({ contacts: filled });
      setSaved(true);
      setContacts(filled.length ? filled : [{ name: "", phone: "" }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save contacts");
    }
  }

  function updateContact(idx: number, patch: Partial<Contact>): void {
    setSaved(false);
    setContacts((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
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
                <span>{liveTripId ? "Share Live Journey Link" : "Share App Link"}</span>
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

            <div className="booking-divider"><span>TRUSTED CONTACTS</span></div>

            <div style={{ marginTop: 12 }}>
              {contacts.map((c, idx) => (
                <div key={idx} className="row" style={{ gap: 6, alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <NeoInput
                      label={idx === 0 ? "Contact Name (optional)" : ""}
                      type="text"
                      placeholder={`Contact ${idx + 1}`}
                      value={c.name}
                      onChange={(e) => updateContact(idx, { name: e.target.value })}
                    />
                  </div>
                  <div style={{ flex: 2 }}>
                    <NeoInput
                      label={idx === 0 ? "Phone (+91…)" : ""}
                      type="tel"
                      placeholder="+91..."
                      value={c.phone}
                      onChange={(e) => updateContact(idx, { phone: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove contact ${idx + 1}`}
                    className="brut-btn brut-btn-white brut-btn-sm"
                    style={{ marginTop: idx === 0 ? 24 : 4, width: 28, height: 28, padding: 0 }}
                    onClick={() => setContacts((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {contacts.length < 3 && (
                <NeoButton
                  variant="white"
                  size="sm"
                  onClick={() => setContacts((prev) => [...prev, { name: "", phone: "" }])}
                >
                  <Plus size={14} /> Add contact
                </NeoButton>
              )}
              <NeoButton variant="primary" fullWidth onClick={() => void saveAll()}>
                <UserRoundCheck size={16} />
                <span>Save Trusted Contacts</span>
              </NeoButton>
            </div>

            {saved && (
              <div className="ok-text" style={{ marginTop: 12 }}>
                <CircleCheck size={14} /> Trusted contacts saved to your account
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
