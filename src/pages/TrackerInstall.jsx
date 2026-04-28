import React from "react";

export default function TrackerInstall() {
  return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <h1>Instala la app Geocercas</h1>
      <p>
        Para usar el rastreo, necesitas instalar la app Geocercas en tu teléfono Android.
      </p>
      <a
        href="https://play.google.com/store/apps/details?id=com.tugeocercas.app"
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "inline-block", marginTop: 24, fontSize: 18, color: "#1976d2" }}
      >
        Ir a Google Play
      </a>
    </div>
  );
}
