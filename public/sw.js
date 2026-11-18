/* LoyerCI — Service Worker minimal.
 * Choix de sécurité : AUCUNE donnée financière ni page authentifiée n'est mise en cache
 * (appareils partagés fréquents). Seule une page hors-ligne générique est servie. */
const CACHE = "loyerci-shell-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/icon.svg"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return; // pas d'interception des API ni des ressources
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
