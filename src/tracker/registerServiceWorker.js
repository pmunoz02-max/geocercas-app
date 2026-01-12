// src/tracker/registerServiceWorker.js

const SW_URL = "/sw.js";
const SW_SCOPE = "/";

// Define universalmente dónde SI se permite SW
function isTrackerContext() {
  const p = window.location.pathname || "";
  return p.startsWith("/tracker-gps") || p.startsWith("/tracker");
}

/**
 * Universal safety net:
 * - Si NO es tracker: desregistra cualquier SW y libera el control.
 * - Si ES tracker: registra (si no existe) y prepara background sync.
 */
export async function applyServiceWorkerPolicy() {
  if (!("serviceWorker" in navigator)) return;

  const tracker = isTrackerContext();

  try {
    // Obtiene todas las registraciones (por si hay más de una)
    const regs = await navigator.serviceWorker.getRegistrations();

    if (!tracker) {
      // Fuera de tracker: desregistrar TODO
      if (regs.length) {
        await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
      }

      // Si esta página estaba controlada, recarga 1 vez para salir del control
      if (navigator.serviceWorker.controller) {
        // evita loop de recarga
        const k = "sw_unreg_reloaded_v1";
        if (!sessionStorage.getItem(k)) {
          sessionStorage.setItem(k, "1");
          window.location.reload();
        }
      }
      return;
    }

    // Dentro de tracker: registrar si no existe
    const existing = regs.find((r) => {
      const url = r?.active?.scriptURL || r?.installing?.scriptURL || r?.waiting?.scriptURL || "";
      return url.includes(SW_URL);
    });

    if (!existing) {
      await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
    }

    // Cuando vuelva online, intentar background sync
    window.addEventListener("online", async () => {
      try {
        const ready = await navigator.serviceWorker.ready;
        if (ready && "sync" in ready) {
          await ready.sync.register("geo-sync");
        }
      } catch (_) {}
    });

    // Mensaje del SW pidiendo flush de cola
    navigator.serviceWorker.addEventListener("message", (evt) => {
      if (evt?.data?.type === "SW_SYNC_REQUEST") {
        import("./initTracker").then(({ initTrackerSyncLayer }) => {
          const sync = initTrackerSyncLayer();
          sync.flushQueue().catch(() => {});
        });
      }
    });
  } catch (e) {
    console.warn("[SW] applyServiceWorkerPolicy failed:", e);
  }
}
