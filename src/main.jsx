// src/main.jsx
import "./buildMarker.js";
import React from "react";
import ReactDOM from "react-dom/client";

import { BrowserRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";

import i18n from "./i18n/i18n";
import "./index.css";

// 🔥 Fuente de verdad: mismo módulo del stack
import { AuthProvider } from "@/context/AuthContext.jsx";

import App from "./App.jsx";

// 🔥 MARCADOR FORENSE VISIBLE
try {
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<div id="BOOT_MARK" style="position:fixed;top:8px;left:8px;z-index:999999;background:#fff;color:#000;padding:6px 10px;border:2px solid #000;border-radius:8px;font:12px system-ui">BOOT MAIN: ' +
      new Date().toISOString() +
      "</div>"
  );
} catch (_) {}

ReactDOM.createRoot(document.getElementById("root")).render(
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