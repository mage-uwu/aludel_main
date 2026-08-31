// Navigations are network-first, so a deploy reaches the device on its next load, with the
// cache as the offline fallback. Hashed assets are immutable, so cache-first. /api is never
// cached. skipWaiting + claim make a new worker take over without a second visit.
const KEY = "aludel-v2";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(KEY).then((c) => c.addAll(["/"]))); });
self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== KEY).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/") || e.request.method !== "GET") return;
  const stash = (req) => (res) => { const copy = res.clone(); caches.open(KEY).then((c) => c.put(req, copy)); return res; };
  e.respondWith(
    e.request.mode === "navigate"
      ? fetch(e.request).then(stash("/")).catch(() => caches.match("/"))
      : caches.match(e.request).then((hit) => hit ?? fetch(e.request).then(stash(e.request)).catch(() => caches.match("/"))),
  );
});
