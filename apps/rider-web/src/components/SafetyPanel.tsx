import { useState } from "react";

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
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Safety centre">
      <section className="brut-card safety-panel">
        <div className="spread">
          <div>
            <span className="eyebrow">SAFETY CENTRE</span>
            <h2>Help is one tap away</h2>
          </div>
          <button className="btn-ghost compact" onClick={onClose}>×</button>
        </div>

        <a className="safety-action emergency" href="tel:112">
          <span>🆘</span>
          <div><strong>Call emergency services</strong><small>Dial 112 in India</small></div>
          <b>→</b>
        </a>
        <button className="safety-action share" onClick={() => void shareTrip()}>
          <span>↗️</span>
          <div><strong>Share my trip</strong><small>Send your live app link to someone you trust</small></div>
          <b>→</b>
        </button>

        <div className="trusted-contact">
          <label className="step-label" htmlFor="trusted-phone">Trusted contact</label>
          <div className="row">
            <input
              id="trusted-phone"
              className="brut-input"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="+91 phone number"
              inputMode="tel"
            />
            <button className="brut-btn brut-btn-primary" onClick={saveContact}>Save</button>
          </div>
        </div>
        {saved && <div className="ok-text">✓ Saved / copied successfully</div>}

        <div className="safety-tips">
          <strong>Before every ride</strong>
          <ul>
            <li>Match the driver name and number plate.</li>
            <li>Never share your OTP before meeting the driver.</li>
            <li>Use Share Trip when travelling late.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
