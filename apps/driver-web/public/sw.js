self.addEventListener("push", (event) => {
  let data = { title: "Chalo-X Driver", body: "New ride update", url: "/", tag: "chalox-driver" };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    tag: data.tag,
    data: { url: data.url || "/" },
    vibrate: [220, 80, 220, 80, 300],
    requireInteraction: data.tag?.startsWith("ride-") || false,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    for (const client of windows) {
      if ("focus" in client) { client.navigate(target); return client.focus(); }
    }
    return clients.openWindow(target);
  }));
});
