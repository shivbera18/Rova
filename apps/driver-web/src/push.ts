import { getToken } from "./api";

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function enablePushNotifications(): Promise<NotificationPermission> {
  if (!pushSupported()) throw new Error("Push notifications are not supported by this browser");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;
  const token = getToken();
  if (!token) throw new Error("Sign in before enabling notifications");

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const keyResponse = await fetch("/v1/push/vapid-key");
  const key = (await keyResponse.json()) as { publicKey: string };
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToArrayBuffer(key.publicKey),
    });
  }
  const response = await fetch("/v1/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!response.ok) throw new Error("Could not save push subscription");
  return permission;
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0))).buffer;
}
