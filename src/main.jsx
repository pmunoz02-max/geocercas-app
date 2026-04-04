import "./buildMarker.js";
import React from "react";
import ReactDOM from "react-dom/client";

import { BrowserRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";

import i18n from "./i18n/i18n";
import "./index.css";

import App from "./App.jsx";

// ✅ MARKER INFALIBLE EN RUNTIME (no depende de Vite define)
window.__TG_RUNTIME_MARKER = "RUNTIME_MARKER_2026-02-25_A";
console.log("[TG RUNTIME MARKER]", window.__TG_RUNTIME_MARKER);
console.log("[BUILD_MARKER] preview-send-debug-02");

// ── Service Worker / PWA bypass para rutas tracker ──────────────────────────
const isTrackerRoute =
  typeof window !== "undefined" && window.location.pathname.startsWith("/tracker-gps");

console.log("[TRACKER_BOOT] main.jsx tracker bypass", { isTrackerRoute });

if (!isTrackerRoute) {
  // Aquí iría registerSW o cualquier bootstrap PWA si se añade en el futuro.
  // Por ahora no hay plugin PWA activo en vite.config.js.
} else {
  // En rutas tracker: desregistrar cualquier SW residual y no montar PWA.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    }).catch(() => {});
  }
}
// ────────────────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nextProvider>
  </React.StrictMode>
);