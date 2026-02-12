// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
<<<<<<< HEAD
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

import { ensureInit } from "./i18n/index.js"; // <-- IMPORTA ensureInit (no solo side-effect)
=======
>>>>>>> preview
import { AuthProvider } from "./context/AuthContext.jsx";
import App from "./App.jsx";
import "./index.css";

<<<<<<< HEAD
async function boot() {
  // Asegura bundles + idioma inicial (?lang -> storage -> navigator -> es)
  await ensureInit();

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
}

boot();
=======
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
>>>>>>> preview
