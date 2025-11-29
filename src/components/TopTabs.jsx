// src/components/TopTabs.jsx
import React from "react";

export default function TopTabs() {
  console.log("[TopTabs DEBUG] Esta es la versión ROJA de TopTabs.jsx");

  return (
    <div
      style={{
        backgroundColor: "red",
        color: "white",
        padding: "16px",
        fontWeight: "bold",
        textAlign: "center",
      }}
    >
      DEBUG TOP TABS – SI VES ESTA BARRA ROJA, ESTE ES EL TopTabs.jsx QUE USA
      LA APP
    </div>
  );
}
