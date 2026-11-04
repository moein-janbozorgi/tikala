// Only answers when a page load fails for lack of network, with the offline page; every request still goes to the server.
// The offline page's fonts are cached with it, since the site's own font files have build-specific names.
// Bump CACHE when any of FILES changes, so installed browsers fetch the new copies.
const CACHE = "offline-v2";
const PAGE = "/offline.html";
const FILES = [PAGE, "/fonts/vazirmatn-arabic.woff2", "/fonts/lalezar-arabic.woff2"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") event.respondWith(fetch(event.request).catch(() => caches.match(PAGE)));
  else if (FILES.includes(new URL(event.request.url).pathname)) {
    event.respondWith(caches.match(event.request).then((hit) => hit ?? fetch(event.request)));
  }
});
