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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* 👇 Toda la app queda DENTRO del AuthProvider */}
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
