// src/main.jsx

// Shim por si algún vendor toca `process` en runtime (dev/CSR)
if (typeof window !== "undefined") {
  window.process = window.process || {};
  window.process.env = window.process.env || {};
}

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import "./index.css";

// 👉 Importamos la instancia de i18n YA configurada
import i18n from "./i18n/i18n.js";
import { I18nextProvider } from "react-i18next";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Proveedor de i18n para toda la app */}
    <I18nextProvider i18n={i18n}>
      {/* Toda la lógica de auth queda igual que antes */}
      <AuthProvider>
        <App />
      </AuthProvider>
    </I18nextProvider>
  </React.StrictMode>
);
