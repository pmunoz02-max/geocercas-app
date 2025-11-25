// src/tracker/registerServiceWorker.js
export async function registerSW() {
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      // Programa un sync cada vez que vuelvas a tener conexión
      window.addEventListener("online", async () => {
        try {
          const ready = await navigator.serviceWorker.ready;
          if ("sync" in ready) {
            await ready.sync.register("geo-sync");
          }
        } catch (e) {}
      });

      // Escucha al SW pidiendo un flush:
      navigator.serviceWorker.addEventListener("message", (evt) => {
        if (evt?.data?.type === "SW_SYNC_REQUEST") {
          // Puedes importar tu sync y dispararlo:
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
}
