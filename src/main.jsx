// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";

import "./i18n/i18n";            // ✅ Inicializa i18next ANTES de usar la app
import "./index.css";

import { AuthProvider } from "./context/AuthContext.jsx";
import App from "./App.jsx";

// ✅ Guard-rail: si por alguna razón llega /?code=..., lo empujamos a /auth/callback
(function () {
  try {
    const url = new URL(window.location.href);
    const hasCode = url.searchParams.has("code");
    const isRoot = url.pathname === "/";
    if (hasCode && isRoot) {
      window.history.replaceState({}, "", `/auth/callback${url.search}`);
    }
  } catch {}
})();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
