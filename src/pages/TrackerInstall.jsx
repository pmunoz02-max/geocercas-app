
import React from "react";
import { useSearchParams } from "react-router-dom";

export default function TrackerInstall() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const orgId = params.get("org_id") || "";
  const userId = params.get("userId") || "";
  const referrer = encodeURIComponent(`token=${token}&org_id=${orgId}&userId=${userId}`);

  // Branding y package
  const brandName = "GeoField GPS";
  const androidPlayUrl = (import.meta.env.VITE_ANDROID_PLAY_URL || "").trim();
  const hasAndroidPlayUrl = androidPlayUrl.length > 0;
  const androidPackage = (import.meta.env.VITE_ANDROID_PACKAGE_NAME || "com.fenice.geofieldgps").trim();
  const playUrl = hasAndroidPlayUrl
    ? `${androidPlayUrl}${androidPlayUrl.includes('?') ? '&' : '?'}referrer=${referrer}`
    : "";

  return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <h1>Instala la app {brandName}</h1>
      <p>
        Para usar el rastreo, necesitas instalar la app oficial {brandName} en tu teléfono Android.
      </p>
      {hasAndroidPlayUrl ? (
        <a
          href={playUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-block", marginTop: 24, fontSize: 18, color: "#1976d2" }}
        >
          Ir a Google Play
        </a>
      ) : (
        <div style={{ marginTop: 24, color: "#64748b", fontSize: 16 }}>
          La instalación oficial para Android todavía no está disponible desde esta pantalla.<br />
          Abre esta página desde tu teléfono y sigue las instrucciones para instalar o abrir la app autorizada.
        </div>
      )}
    </div>
  );
}
