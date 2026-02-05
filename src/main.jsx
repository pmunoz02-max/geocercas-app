// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

import { ensureInit } from "./i18n/index.js"; // <-- IMPORTA ensureInit (no solo side-effect)
import { AuthProvider } from "./context/AuthContext.jsx";

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
