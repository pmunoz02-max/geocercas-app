import "./buildMarker.js";
import React from "react";
import ReactDOM from "react-dom/client";

import { BrowserRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";

import i18n from "./i18n/i18n";
import "./index.css";

import { AuthProvider } from "@/auth/AuthProvider.jsx";
import App from "./App.jsx";

// ✅ MARKER INFALIBLE EN RUNTIME (no depende de Vite define)
window.__TG_RUNTIME_MARKER = "RUNTIME_MARKER_2026-02-25_A";
console.log("[TG RUNTIME MARKER]", window.__TG_RUNTIME_MARKER);
console.log("[BUILD_MARKER] preview-send-debug-02");

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