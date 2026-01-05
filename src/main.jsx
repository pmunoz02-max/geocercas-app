import React from "react";
import ReactDOM from "react-dom/client";

// 🔥 IMPORT CRÍTICO – NO BORRAR – NO MOVER
import "./i18n/i18n"; // o "./i18n/i18n.js" según tu path real

import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
