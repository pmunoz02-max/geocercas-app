// src/tracker/registerServiceWorker.js

function isTrackerContext() {
  // Universal: define dónde SI queremos SW
  // Ajusta si tu tracker usa otra ruta principal.
  const p = window.location.pathname || "";
  return p.startsWith("/tracker-gps") || p.startsWith("/tracker");
}

export async function registerSW() {
  // Solo en tracker, nunca en login/shell general
  if (!isTrackerContext()) return;

  if (!("serviceWorker" in navigator)) return;

  try {
    // Si ya está controlando, no re-registrar
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (!existing) {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }

    // Programa sync al volver online
    window.addEventListener("online", async () => {
      try {
        const ready = await navigator.serviceWorker.ready;
        if (ready && "sync" in ready) {
          await ready.sync.register("geo-sync");
        }
      } catch (_) {}
    });

    // Escucha al SW pidiendo flush
    navigator.serviceWorker.addEventListener("message", (evt) => {
      if (evt?.data?.type === "SW_SYNC_REQUEST") {
        import("./initTracker").then(({ initTrackerSyncLayer }) => {
          const sync = initTrackerSyncLayer();
          sync.flushQueue().catch(() => {});
        });
      }
    });
  } catch (e) {
    console.warn("SW no pudo registrarse:", e);
  }
}
