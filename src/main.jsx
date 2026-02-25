// src/main.jsx
import "./buildMarker.js";
import React from "react";
import ReactDOM from "react-dom/client";

import { BrowserRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";

import i18n from "./i18n/i18n";
import "./index.css";

import { AuthProvider } from "@/auth/AuthProvider.jsx";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </I18nextProvider>
  </React.StrictMode>
);