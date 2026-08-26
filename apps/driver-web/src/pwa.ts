/** PWA lifecycle: service-worker registration, update flow and install prompt. */

const DISMISS_KEY = "chalox.pwa.installDismissedAt";
const DISMISS_DAYS = 14;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let reloaded = false;
let updateRequested = false;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function installAvailable(): boolean {
  return deferredPrompt !== null;
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredPrompt) return "unavailable";
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  window.dispatchEvent(new Event("chalox-install-state-changed"));
  return choice.outcome;
}

export function recentlyDismissed(): boolean {
  const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
  return Date.now() - at < DISMISS_DAYS * 24 * 3600_000;
}

export function dismissInstall(): void {
  localStorage.setItem(DISMISS_KEY, String(Date.now()));
}

/**
 * Registers the service worker, wires the update toast, and captures the
 * browser install prompt. Safe to call once from the app entrypoint.
 */
export function registerPwa(appName: string): void {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event("chalox-install-state-changed"));
  });

  void navigator.serviceWorker.register("/sw.js").then((registration) => {
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        // controller exists = this is an UPDATE, not a first install
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          waitingWorker = worker;
          showUpdateToast(appName);
        }
      });
    });
  });

  // Only reload when the user consented via the update toast — a first-ever
  // install claims clients too, and that must never hard-reload the page.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (updateRequested && !reloaded) {
      reloaded = true;
      location.reload();
    }
  });
}

/** The installed-but-waiting worker — SKIP_WAITING must target THIS, not the
 *  currently-controlling old worker (which may predate the message listener). */
let waitingWorker: ServiceWorker | null = null;

function applyUpdate(): void {
  updateRequested = true;
  if (waitingWorker) {
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    // Safety net: if activation stalls for any reason, force the reload — the
    // waiting worker activates as soon as this tab drops control anyway.
    setTimeout(() => location.reload(), 3000);
  } else {
    location.reload();
  }
}

function showUpdateToast(appName: string): void {
  if (document.getElementById("pwa-update-toast")) return;
  const toast = document.createElement("div");
  toast.id = "pwa-update-toast";
  toast.setAttribute("role", "status");
  toast.style.cssText = [
    "position:fixed", "left:16px", "right:16px", "bottom:16px",
    "z-index:2147483000", "display:flex", "gap:10px", "align-items:center",
    "justify-content:space-between", "padding:12px 14px",
    "background:#0f172a", "color:#fff", "border-radius:10px",
    "font:700 13px system-ui,sans-serif", "box-shadow:0 8px 24px rgba(15,23,42,.35)",
  ].join(";");
  const label = document.createElement("span");
  label.textContent = `New version of ${appName} is ready`;
  const reload = document.createElement("button");
  reload.textContent = "Update now";
  reload.style.cssText =
    "padding:7px 14px;font:800 12px system-ui,sans-serif;color:#fff;background:#4f46e5;border:0;border-radius:8px;cursor:pointer";
  reload.onclick = applyUpdate;
  toast.append(label, reload);
  document.body.append(toast);
}
