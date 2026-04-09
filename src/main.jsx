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
function urlHasAnyTokenParam() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return (
    params.has("inviteToken") ||
    params.has("invite_token") ||
    params.has("token") ||
    params.has("t")
  );
}

const pathname = typeof window !== "undefined" ? window.location.pathname : "";
const isTrackerAccept = pathname === "/tracker-accept";
const isTrackerGps = pathname === "/tracker-gps";
const hasTokenParam = urlHasAnyTokenParam();

const shouldBypass =
  (isTrackerGps || isTrackerAccept) && !hasTokenParam;

console.log("[TRACKER_BOOT] main.jsx tracker bypass", { isTrackerGps, isTrackerAccept, hasTokenParam, shouldBypass });

if ("serviceWorker" in navigator) {
  // PWA/SW hard-disabled globally: unregister any residual service worker.
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  }).catch(() => {});
}
// ────────────────────────────────────────────────────────────────────────────

// 🔥 TRACKER BYPASS: nunca return null ni pantalla blanca
if (shouldBypass) {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <div style={{padding: 32, textAlign: 'center', fontSize: 18}}>
      Inicializando tracker...
    </div>
  );
} else {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <I18nextProvider i18n={i18n}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </I18nextProvider>
    </React.StrictMode>
  );
}