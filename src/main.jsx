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
 * Uso (en Preview):
 *  - /inicio?diag=1&stage=react   -> solo React (sin providers)
 *  - /inicio?diag=1&stage=i18n    -> React + I18n
 *  - /inicio?diag=1&stage=auth    -> React + I18n + AuthProvider
 *  - /inicio?diag=1&stage=router  -> React + I18n + AuthProvider + Router (sin App)
 *  - /inicio?diag=1&stage=app     -> Todo normal (equivalente al render actual)
 *
 * Si no pones ?diag=1, corre normal (sin afectar uso normal).
 */

// 1) “Prueba de vida” del JS + marcador en DOM
try {
  // Log muy temprano (antes de React)
  console.log("BOOT_MAIN", new Date().toISOString());
  document.documentElement.setAttribute("data-boot-main", "1");
} catch (_) {
  // Nada: si esto falla, el DOM está muy raro.
}

// 2) Captura de errores globales (runtime silencioso)
window.addEventListener("error", (e) => {
  // eslint-disable-next-line no-console
  console.error("GLOBAL_ERROR", e?.error || e?.message, e);
});
window.addEventListener("unhandledrejection", (e) => {
  // eslint-disable-next-line no-console
  console.error("UNHANDLED_REJECTION", e?.reason, e);
});

// 3) Root check (si #root no existe, mostramos FATAL visible)
const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML = `<pre style="padding:16px;font-size:14px">
FATAL: #root not found
Ruta: ${location.pathname}
</pre>`;
  throw new Error("FATAL: #root not found");
}

// Helpers diagnóstico
const params = new URLSearchParams(window.location.search);
const diag = params.get("diag") === "1";
const stage = (params.get("stage") || "").toLowerCase();

// Render mínimo (no depende de CSS/app)
const DiagBox = ({ title, extra }) => (
  <div style={{ padding: 24, fontFamily: "system-ui, Arial", lineHeight: 1.4 }}>
    <div style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
    <div style={{ marginTop: 8, fontSize: 14 }}>
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
  </div>
);

function buildTree() {
  // Si no está en modo diag, comportamiento normal (tu árbol actual)
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

  // Modo diagnóstico: vamos encendiendo piezas según stage
  // stage=react -> solo React
  if (stage === "react") {
    return (
      <React.StrictMode>
        <DiagBox title="DIAG OK: React está vivo" />
      </React.StrictMode>
    );
  }

  // stage=i18n -> React + I18n
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

  // stage=auth -> React + I18n + AuthProvider
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

  // stage=router -> React + I18n + AuthProvider + Router (sin App)
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

  // stage=app o cualquier otro -> árbol completo (normal)
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

// Render final
ReactDOM.createRoot(rootEl).render(buildTree());