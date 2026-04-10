import "./buildMarker.js";
import React from "react";
import ReactDOM from "react-dom/client";

import { BrowserRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";

import i18n from "./i18n/i18n";
import "./index.css";

import App from "./App.jsx";

// ✅ MARKER INFALIBLE EN RUNTIME
window.__TG_RUNTIME_MARKER = "RUNTIME_MARKER_2026-04-09_MAIN_FIX_A";
console.log("[TG RUNTIME MARKER]", window.__TG_RUNTIME_MARKER);
console.log("[BUILD_MARKER] preview-tracker-main-fix-01");

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

console.log("[TRACKER_BOOT] main.jsx tracker route", {
  isTrackerGps,
  isTrackerAccept,
  hasTokenParam,
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => {
      regs.forEach((r) => r.unregister());
    })
    .catch(() => {});
}
// ────────────────────────────────────────────────────────────────────────────

function readTrackerBootstrapState() {
  try {
    // 🔥 leer TODAS las posibles fuentes
    const rawAuth =
      localStorage.getItem("geocercas-tracker-auth") ||
      localStorage.getItem("tracker_auth_saved") ||
      localStorage.getItem("tracker_auth") ||
      null;

    let parsed = null;
    try {
      parsed = rawAuth ? JSON.parse(rawAuth) : null;
    } catch {}

    const trackerToken =
      parsed?.access_token ||
      parsed?.session?.access_token ||
      localStorage.getItem("tracker_access_token") ||
      localStorage.getItem("access_token") ||
      localStorage.getItem("tg_token") ||
      null;

    const orgId =
      localStorage.getItem("org_id") ||
      localStorage.getItem("tracker_org_id") ||
      localStorage.getItem("tg_org_id") ||
      null;

    console.log("[TRACKER_BOOT] read state", {
      trackerToken: !!trackerToken,
      orgId: !!orgId,
    });

    return {
      trackerToken,
      orgId,
      ready: Boolean(trackerToken && orgId),
    };
  } catch (e) {
    console.error("[TRACKER_BOOT] read error", e);
    return {
      trackerToken: null,
      orgId: null,
      ready: false,
    };
  }
}

function BootstrapScreen() {
  return (
    <div style={{ padding: 32, textAlign: "center", fontSize: 18 }}>
      Inicializando tracker...
    </div>
  );
}

function RootBootstrap() {
  const isTrackerRoute = isTrackerGps || isTrackerAccept;
  const [bootReady, setBootReady] = React.useState(() => {
    if (!isTrackerRoute) return true;
    return readTrackerBootstrapState().ready;
  });

  React.useEffect(() => {
    if (!isTrackerRoute) return;

    let cancelled = false;

    function check() {
      if (cancelled) return;

      const state = readTrackerBootstrapState();

      console.log("[TRACKER_BOOT] reactive check", {
        ready: state.ready,
        hasToken: !!state.trackerToken,
        hasOrgId: !!state.orgId,
      });

      if (state.ready) {
        setBootReady(true);
      } else {
        // seguir intentando SIEMPRE
        setTimeout(check, 250);
      }
    }

    check();

    return () => {
      cancelled = true;
    };
  }, [isTrackerRoute]);

  if (!bootReady) {
    return <BootstrapScreen />;
  }

  return (
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nextProvider>
  );
}

const container = document.getElementById("root");
const root = ReactDOM.createRoot(container);

root.render(
  <React.StrictMode>
    <RootBootstrap />
  </React.StrictMode>
);