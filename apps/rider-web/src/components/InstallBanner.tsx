import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { dismissInstall, installAvailable, isStandalone, promptInstall, recentlyDismissed } from "../pwa";

/** Bottom install card — appears once the browser fires beforeinstallprompt. */
export function InstallBanner({ appName }: { appName: string }): React.ReactElement | null {
  const [installable, setInstallable] = useState(installAvailable());
  const [hidden, setHidden] = useState(isStandalone() || recentlyDismissed());

  useEffect(() => {
    const onState = (): void => setInstallable(installAvailable());
    window.addEventListener("chalox-install-state-changed", onState);
    return () => window.removeEventListener("chalox-install-state-changed", onState);
  }, []);

  if (hidden || !installable) return null;

  return (
    <div
      role="dialog"
      aria-label={`Install ${appName}`}
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 60,
        display: "flex",
        gap: 10,
        alignItems: "center",
        padding: "12px 14px",
        background: "#ffffff",
        border: "var(--brut-border)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: 38,
          height: 38,
          flexShrink: 0,
          background: "var(--primary-soft)",
          border: "var(--brut-border-thin)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        <Download size={19} color="var(--primary)" />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>Install {appName}</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
          Full-screen app, faster loads, works with flaky networks.
        </div>
      </div>
      <button
        className="brut-btn brut-btn-sm brut-btn-primary"
        onClick={() => {
          void promptInstall().then((outcome) => {
            if (outcome === "accepted") setHidden(true);
          });
        }}
      >
        Install
      </button>
      <button
        aria-label="Dismiss install suggestion"
        onClick={() => {
          dismissInstall();
          setHidden(true);
        }}
        style={{ background: "none", border: 0, cursor: "pointer", padding: 4 }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
