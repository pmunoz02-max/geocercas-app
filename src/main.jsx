// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

/**
 * PKCE GLOBAL CATCHER (antes de React Router)
 * Si Supabase redirige a Site URL con ?code=..., forzamos /auth/callback.
 */
(function pkceGlobalCatcher() {
  try {
    const url = new URL(window.location.href);
    const hasCode = url.searchParams.has("code");
    const isCallback = url.pathname === "/auth/callback";

    if (hasCode && !isCallback) {
      if (!url.searchParams.get("next")) url.searchParams.set("next", "/inicio");

      const target = new URL(window.location.origin);
      target.pathname = "/auth/callback";
      target.search = url.searchParams.toString();

      window.location.replace(target.toString());
    }
  } catch {
    // ignore
  }
})();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
