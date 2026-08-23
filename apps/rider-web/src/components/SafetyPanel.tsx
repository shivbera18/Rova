import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { PhoneCall, Share2, ShieldCheck, UserRoundCheck, X } from "lucide-react";

export function SafetyPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const [contact, setContact] = useState(() => localStorage.getItem("chalox.safety.contact") ?? "");
  const [saved, setSaved] = useState(false);

  async function shareTrip(): Promise<void> {
    const data = { title: "My Chalo-X trip", text: "Track my current Chalo-X ride. If I need help, please contact me.", url: window.location.href };
    if (navigator.share) { await navigator.share(data).catch(() => undefined); return; }
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
        <Dialog.Content className="brut-card safety-panel radix-safety-content" aria-describedby="safety-description">
          <div className="spread">
            <div><span className="eyebrow">SAFETY CENTRE</span><Dialog.Title asChild><h2>Help is one tap away</h2></Dialog.Title></div>
            <Dialog.Close asChild><button className="btn-ghost compact" aria-label="Close Safety Centre"><X size={20} /></button></Dialog.Close>
          </div>
          <Dialog.Description id="safety-description" className="muted">Emergency, sharing, and trusted contact tools for your ride.</Dialog.Description>

          <a className="safety-action emergency" href="tel:112"><PhoneCall size={25}/><div><strong>Call emergency services</strong><small>Dial 112 in India</small></div><b>→</b></a>
          <button className="safety-action share" onClick={() => void shareTrip()}><Share2 size={25}/><div><strong>Share my trip</strong><small>Send your live app link to someone you trust</small></div><b>→</b></button>

          <div className="trusted-contact">
            <label className="step-label" htmlFor="trusted-phone"><UserRoundCheck size={15}/> Trusted contact</label>
            <div className="row"><input id="trusted-phone" className="brut-input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="+91 phone number" inputMode="tel"/><button className="brut-btn brut-btn-primary" onClick={saveContact}>Save</button></div>
          </div>
          {saved && <div className="ok-text">✓ Saved / copied successfully</div>}

          <div className="safety-tips"><strong><ShieldCheck size={16}/> Before every ride</strong><ul><li>Match the driver name and number plate.</li><li>Never share your OTP before meeting the driver.</li><li>Use Share Trip when travelling late.</li></ul></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
