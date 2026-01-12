// src/main.jsx
import "./index.css";

import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";

// i18n
import i18n from "./i18n/i18n.js";
import { I18nextProvider } from "react-i18next";

// ✅ Política universal de Service Worker:
// - En Tracker: permite SW
// - En cualquier otra ruta (login incluido): desregistra y libera control
import { applyServiceWorkerPolicy } from "./tracker/registerServiceWorker.js";

// ⚠️ CRÍTICO: ejecutar ANTES de montar React
applyServiceWorkerPolicy();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </I18nextProvider>
  </React.StrictMode>
);
