// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";

import "./i18n/i18n";
import "./index.css";

import { AuthProvider } from "@/context/auth.js";
import App from "./App.jsx";

// 🔥 FORCE UNREGISTER OLD SERVICE WORKERS (PREVIEW SAFE)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
}

// 🔎 BUILD STAMP
console.log("[BUILD PREVIEW]", {
  mode: import.meta.env.MODE,
  time: new Date().toISOString(),
});

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