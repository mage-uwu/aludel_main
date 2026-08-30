// App-shell cache: assets cache-first, /api always network. Bump KEY to invalidate.
const KEY = "aludel-v1";
self.addEventListener("install", (e) => e.waitUntil(caches.open(KEY).then((c) => c.addAll(["/"]))));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== KEY).map((k) => caches.delete(k))))));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/") || e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then((hit) => hit ?? fetch(e.request).then((res) => {
    const copy = res.clone(); void caches.open(KEY).then((c) => c.put(e.request, copy)); return res;
  }).catch(() => caches.match("/"))));
});
