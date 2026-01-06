// src/main.jsx
import "./index.css"; // ✅ Primero: asegura estilos desde el inicio

import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";

// i18n ya configurado
import i18n from "./i18n/i18n.js";
import { I18nextProvider } from "react-i18next";

/**
 * Nota:
 * El shim de `process` debe estar en index.html (antes del bundle),
 * no aquí, para evitar efectos raros en ESM y asegurar compatibilidad
 * con vendors que leen process durante el import.
 */

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </I18nextProvider>
  </React.StrictMode>
);
