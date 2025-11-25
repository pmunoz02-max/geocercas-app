// public/sw.js
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

// Si quieres programar un sync: navigator.serviceWorker.ready.then(reg => reg.sync.register('geo-sync'));
// Aquí solo escuchamos el evento y avisamos a la página para que dispare flush.
self.addEventListener("sync", async (event) => {
  if (event.tag === "geo-sync") {
    event.waitUntil((async () => {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: "SW_SYNC_REQUEST" });
      }
    })());
  }
});
