import "./buildMarker.js";
import React from "react";
import ReactDOM from "react-dom/client";

import { BrowserRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";

import i18n from "./i18n/i18n";
import "./index.css";

import App from "./App.jsx";

window.__TG_RUNTIME_MARKER = "RUNTIME_MARKER_2026-04-09_MAIN_SINGLE_ROOT_A";
console.log("[TG RUNTIME MARKER]", window.__TG_RUNTIME_MARKER);
console.log("[BUILD_MARKER] preview-tracker-single-root-01");

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
const isTrackerRoute = isTrackerGps || isTrackerAccept;
const hasTokenParam = urlHasAnyTokenParam();

console.log("[TRACKER_BOOT] main.jsx tracker route", {
  isTrackerGps,
  isTrackerAccept,
  hasTokenParam,
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  }).catch(() => {});
}

function readTrackerBootstrapState() {
  try {
    const rawAuth =
      localStorage.getItem("geocercas-tracker-auth") ||
      localStorage.getItem("tracker_auth_saved") ||
      localStorage.getItem("tracker_auth") ||
      null;

    let parsed = null;
    try {
      parsed = rawAuth ? JSON.parse(rawAuth) : null;
    } catch {
      parsed = null;
    }

    const trackerToken =
      parsed?.access_token ||
      parsed?.session?.access_token ||
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
  const [bootReady, setBootReady] = React.useState(() => {
    if (!isTrackerRoute) return true;
    return readTrackerBootstrapState().ready;
  });

  React.useEffect(() => {
    if (!isTrackerRoute) return undefined;

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
        window.setTimeout(check, 250);
      }
    }

    check();

    return () => {
      cancelled = true;
    };
  }, []);

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