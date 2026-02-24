// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";

import "./i18n/i18n"; // ✅ Inicializa i18next ANTES de usar la app
import "./index.css";

import { AuthProvider } from "@/context/auth.js";
import App from "./App.jsx";

// ✅ Build stamp (cache-bust y verificación en consola)
console.log("[BUILD]", {
  mode: import.meta.env.MODE,
  time: new Date().toISOString(),
  commit: "preview",
});

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