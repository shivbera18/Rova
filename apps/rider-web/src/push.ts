import { api } from "./api";

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function enablePushNotifications(): Promise<NotificationPermission> {
  if (!pushSupported()) throw new Error("Push notifications are not supported by this browser");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const key = await api<{ publicKey: string }>("/v1/push/vapid-key");
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToUint8Array(key.publicKey),
    });
  }
  await api("/v1/push/subscribe", { body: { subscription: subscription.toJSON() } });
  return permission;
}
function base64ToUint8Array(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
  return bytes.buffer;
}
