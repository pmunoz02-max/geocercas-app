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
    const trackerAuthRaw =
      localStorage.getItem("geocercas-tracker-auth") ||
      localStorage.getItem("tracker_auth_saved") ||
      null;

    let trackerAuth = null;
    try {
      trackerAuth = trackerAuthRaw ? JSON.parse(trackerAuthRaw) : null;
    } catch {
      trackerAuth = null;
    }

    const trackerToken =
      trackerAuth?.access_token ||
      trackerAuth?.session?.access_token ||
      localStorage.getItem("tracker_access_token") ||
      localStorage.getItem("access_token") ||
      null;

    const orgId =
      localStorage.getItem("org_id") ||
      localStorage.getItem("tracker_org_id") ||
      null;

    return {
      trackerToken,
      orgId,
      ready: Boolean(trackerToken && orgId),
    };
  } catch (error) {
    console.error("[TRACKER_BOOT] readTrackerBootstrapState error", error);
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
    if (!isTrackerRoute) return undefined;

    // Check global flag in case event was missed
    if (window.__tracker_session_ready__) {
      console.log("[TRACKER_BOOT] session ready via global flag");
      setBootReady(true);
      return;
    }

    function onTrackerSessionReady() {
      console.log("[TRACKER_BOOT] session injected event");
      setBootReady(true);
    }

    window.addEventListener("tracker-session-ready", onTrackerSessionReady);

    const initialState = readTrackerBootstrapState();
    console.log("[TRACKER_BOOT] initial bootstrap state", initialState);

    if (initialState.ready) {
      setBootReady(true);
      return () => {
        window.removeEventListener("tracker-session-ready", onTrackerSessionReady);
      };
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 12; // ~3s total
    const intervalMs = 250;

    const interval = window.setInterval(() => {
      if (cancelled) return;

      attempts += 1;
      const state = readTrackerBootstrapState();
      console.log("[TRACKER_BOOT] retry bootstrap state", {
        attempts,
        ready: state.ready,
        hasToken: Boolean(state.trackerToken),
        hasOrgId: Boolean(state.orgId),
      });

      if (state.ready || attempts >= maxAttempts) {
        window.clearInterval(interval);
        setBootReady(true); // fail-open controlado
      }
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("tracker-session-ready", onTrackerSessionReady);
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