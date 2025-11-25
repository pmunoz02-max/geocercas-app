// background.js (Manifest V3, service worker)

function isExtensionContext() {
  // En MV3 background service worker, 'chrome' existe y tiene runtime y tabs.
  return typeof chrome !== "undefined" &&
         chrome.runtime &&
         chrome.tabs &&
         typeof chrome.tabs.query === "function";
}

async function getCurrentTab() {
  if (!isExtensionContext()) {
    // Estamos fuera del contexto de extensión (por ejemplo, una web normal).
    console.info("[App Geocerca Helper] background.js cargado fuera de extensión; no hago nada.");
    return null;
  }

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    });
    return tab || null;
  } catch (err) {
    console.error("[App Geocerca Helper] Error en chrome.tabs.query:", err);
    return null;
  }
}

// Ejemplo de uso seguro:
(async () => {
  const tab = await getCurrentTab();
  if (!tab) return;

  console.log("[App Geocerca Helper] Pestaña activa:", {
    id: tab.id,
    url: tab.url,
    title: tab.title
  });

  // Aquí puedes poner más lógica de extensión si la necesitas,
  // siempre detrás del guard de isExtensionContext().
})();

// Mensajes desde otros scripts de la extensión
if (isExtensionContext()) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "PING") {
      sendResponse({ ok: true, ts: Date.now() });
    }
    // Indica que puedes responder de forma asíncrona si lo requieres:
    return false;
  });
}
