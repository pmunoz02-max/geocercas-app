// public/sw.js

self.addEventListener("install", (event) => {
  // Activar rápido
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Tomar control rápido, pero sin interferir con navegación
  event.waitUntil(self.clients.claim());
});

/**
 * UNIVERSAL SAFETY:
 * No interceptar navegación ni assets.
 * Esto evita pantallas blancas en SPAs cuando el SW queda "controlando"
 * y el build cambia.
 */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Nunca interceptar navegación (document requests)
  if (req.mode === "navigate") return;

  // Nunca interceptar assets estáticos o APIs: passthrough
  // (Si en el futuro quieres caching, lo hacemos con estrategia explícita y versionada)
  return;
});

// Background Sync: pide a la app que haga flush de la cola
self.addEventListener("sync", (event) => {
  if (event.tag === "geo-sync") {
    event.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        for (const client of clients) {
          client.postMessage({ type: "SW_SYNC_REQUEST" });
        }
      })()
    );
  }
});
