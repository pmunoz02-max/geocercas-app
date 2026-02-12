// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./context/AuthContext.jsx";
import App from "./App.jsx";
import "./index.css";

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
