// __SW_BUILD_STAMP__ is replaced at build time by scripts/stamp-sw-version.mjs.
// Changing CACHE_VERSION causes the activate handler to purge stale caches.
const CACHE_VERSION = "indexflow-shell-__SW_BUILD_STAMP__";
const SHELL_ASSETS = ["/", "/dashboard", "/baskets", "/portfolio", "/settings"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/api/")) return;

  // Stale-while-revalidate: serve cached response immediately for fast paint,
  // then update the cache in the background so the next load is fresh.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches
              .open(CACHE_VERSION)
              .then((cache) => cache.put(request, copy))
              .catch(() => undefined);
          }
          return response;
        })
        .catch(() => caches.match("/"));

      return cached || networkFetch;
    })
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = null;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "IndexFlow", body: event.data.text(), url: "/" };
  }

  const title = payload?.title ?? "IndexFlow";
  const body = payload?.body ?? "New protocol update";
  const url = payload?.url ?? "/";
  const tag = payload?.tag ?? "indexflow-notification";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: { url },
      badge: "/icon.svg",
      icon: "/icon.svg",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification?.data?.url ?? "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin) {
          client.navigate(target);
          return client.focus();
        }
      }

      return clients.openWindow(target);
    })
  );
});
