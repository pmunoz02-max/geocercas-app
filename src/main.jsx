import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// ✅ PKCE catcher correcto para Vite producción
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
    <App />
  </React.StrictMode>
);
