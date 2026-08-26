/* Chalo-X Driver service worker - v2
 * Strategy:
 *   navigations            network-first  -> cached page -> cached "/" -> /offline.html
 *   hashed static assets   stale-while-revalidate
 *   /v1/* API              never intercepted (money data must be fresh)
 */
const VERSION = "v2";
const CACHE = `chalox-driver-${VERSION}`;
const PRECACHE = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("chalox-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/v1/") || url.pathname === "/ws/driver") return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Cache.put rejects navigate-mode requests - key the SPA shell by URL.
          // Only cache good responses so a 5xx never becomes the offline shell.
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(new Request("/", { method: "GET" }), copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match("/")
            .then((hit) => hit || caches.match("/offline.html")),
        ),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const refresh = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          })
          .catch(() => hit);
        return hit || refresh;
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Chalo-X", body: "New ride activity", url: "/", tag: "chalox" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192-maskable.png",
      data: { url: data.url || "/" },
      vibrate: [180, 80, 180],
      tag: data.tag,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow(target);
    }),
  );
});
