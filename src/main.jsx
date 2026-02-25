// src/main.jsx
import "./buildMarker.js";
import React from "react";
import ReactDOM from "react-dom/client";

import { BrowserRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";

import i18n from "./i18n/i18n";
import "./index.css";

import { AuthProvider } from "@/auth/AuthProvider.jsx";
import App from "./App.jsx";

/**
 * DIAGNÓSTICO UNIVERSAL "PANTALLA BLANCA"
 *
 * Uso (Preview):
 *  - /inicio?diag=1&stage=react
 *  - /inicio?diag=1&stage=i18n
 *  - /inicio?diag=1&stage=auth
 *  - /inicio?diag=1&stage=router
 *  - /inicio?diag=1&stage=app
 *
 * Si no pones ?diag=1, corre normal.
 */

// Marcador temprano (antes de React)
try {
  console.log("BOOT_MAIN", new Date().toISOString());
  document.documentElement.setAttribute("data-boot-main", "1");
} catch (_) {}

// Captura de errores globales (runtime silencioso)
window.addEventListener("error", (e) => {
  // eslint-disable-next-line no-console
  console.error("GLOBAL_ERROR", e?.error || e?.message, e);
});
window.addEventListener("unhandledrejection", (e) => {
  // eslint-disable-next-line no-console
  console.error("UNHANDLED_REJECTION", e?.reason, e);
});

// Root check
const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML = `<pre style="padding:16px;font-size:14px">
FATAL: #root not found
Ruta: ${location.pathname}
</pre>`;
  throw new Error("FATAL: #root not found");
}

// Params
const params = new URLSearchParams(window.location.search);
const diag = params.get("diag") === "1";
const stage = (params.get("stage") || "").toLowerCase();

// En modo diag: forzar fondo blanco (para que no “parezca” blanco por CSS oscuro)
if (diag) {
  try {
    document.documentElement.style.background = "#ffffff";
    document.body.style.background = "#ffffff";
    document.body.style.margin = "0";
  } catch (_) {}
}

// UI diag 100% visible (no depende de index.css)
const DiagBox = ({ title, extra }) => (
  <div
    style={{
      padding: 24,
      fontFamily: "system-ui, Arial",
      lineHeight: 1.4,
      background: "#ffffff",
      color: "#111111",
      minHeight: "100vh",
      boxSizing: "border-box",
    }}
  >
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        border: "2px solid #111",
        borderRadius: 12,
        padding: 18,
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 800 }}>{title}</div>
      <div style={{ marginTop: 10, fontSize: 14 }}>
        <div>
          <b>path:</b> {location.pathname}
        </div>
        <div>
          <b>search:</b> {location.search}
        </div>
        <div>
          <b>time:</b> {new Date().toISOString()}
        </div>
        {extra ? <div style={{ marginTop: 10 }}>{extra}</div> : null}
      </div>
      <div style={{ marginTop: 14, fontSize: 12, opacity: 0.75 }}>
        Tip: cambia stage=react / i18n / auth / router / app
      </div>
    </div>
  </div>
);

function buildTree() {
  // Normal (sin diag): tu árbol original
  if (!diag) {
    return (
      <React.StrictMode>
        <I18nextProvider i18n={i18n}>
          <AuthProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </AuthProvider>
        </I18nextProvider>
      </React.StrictMode>
    );
  }

  // Diagnóstico por etapas
  if (stage === "react") {
    return (
      <React.StrictMode>
        <DiagBox title="DIAG OK: React está vivo (solo React)" />
      </React.StrictMode>
    );
  }

  if (stage === "i18n") {
    return (
      <React.StrictMode>
        <I18nextProvider i18n={i18n}>
          <DiagBox
            title="DIAG OK: React + i18n"
            extra={
              <div>
                <b>i18n.language:</b> {i18n?.language || "(sin language)"}
              </div>
            }
          />
        </I18nextProvider>
      </React.StrictMode>
    );
  }

  if (stage === "auth") {
    return (
      <React.StrictMode>
        <I18nextProvider i18n={i18n}>
          <AuthProvider>
            <DiagBox title="DIAG OK: React + i18n + AuthProvider" />
          </AuthProvider>
        </I18nextProvider>
      </React.StrictMode>
    );
  }

  if (stage === "router") {
    return (
      <React.StrictMode>
        <I18nextProvider i18n={i18n}>
          <AuthProvider>
            <BrowserRouter>
              <DiagBox title="DIAG OK: React + i18n + Auth + Router" />
            </BrowserRouter>
          </AuthProvider>
        </I18nextProvider>
      </React.StrictMode>
    );
  }

  // stage=app (o cualquier otro): full app
  return (
    <React.StrictMode>
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </I18nextProvider>
    </React.StrictMode>
  );
}

ReactDOM.createRoot(rootEl).render(buildTree());