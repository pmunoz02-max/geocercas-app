import React from "react";
import { useSearchParams } from "react-router-dom";

export default function TrackerInstall() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const orgId = params.get("org_id") || "";
  const userId = params.get("userId") || "";
  const referrer = encodeURIComponent(`token=${token}&org_id=${orgId}&userId=${userId}`);
  const playUrl = `https://play.google.com/store/apps/details?id=com.tugeocercas.app&referrer=${referrer}`;

  return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <h1>Instala la app Geocercas</h1>
      <p>
        Para usar el rastreo, necesitas instalar la app Geocercas en tu teléfono Android.
      </p>
      <a
        href={playUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "inline-block", marginTop: 24, fontSize: 18, color: "#1976d2" }}
      >
        Ir a Google Play
      </a>
    </div>
  );
}
