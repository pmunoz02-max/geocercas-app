import { useEffect, useMemo, useState } from "react";

export default function TrackerGpsPage() {
  const [buildMarker] = useState("2026-04-04-D");
  const [bridgeReady, setBridgeReady] = useState(false);
  const [autoStartStatus, setAutoStartStatus] = useState("pending");
  const [permissionStatus, setPermissionStatus] = useState("unknown");
  const [attemptCount, setAttemptCount] = useState(0);
  const [lastMessage, setLastMessage] = useState("Inicializando tracker...");

  const pageStyle = useMemo(
    () => ({
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "16px",
      padding: "24px",
      background: "#ffffff",
      color: "#111111",
      fontFamily: "Arial, sans-serif",
      textAlign: "center",
    }),
    []
  );

  const cardStyle = useMemo(
    () => ({
      width: "100%",
      maxWidth: "720px",
      border: "1px solid #d0d7de",
      borderRadius: "12px",
      padding: "20px",
      background: "#f8f9fb",
      boxSizing: "border-box",
    }),
    []
  );

  const titleStyle = useMemo(
    () => ({
      fontSize: "40px",
      fontWeight: 700,
      color: "red",
      margin: 0,
    }),
    []
  );

  const rowStyle = useMemo(
    () => ({
      display: "flex",
      justifyContent: "space-between",
      gap: "16px",
      padding: "8px 0",
      borderBottom: "1px solid #e5e7eb",
      fontSize: "16px",
    }),
    []
  );

  useEffect(() => {
    console.log("[TRACKER_BUILD]", buildMarker);
    setLastMessage(`Build cargado: ${buildMarker}`);
  }, [buildMarker]);

  useEffect(() => {
    let attempts = 0;
    let cancelled = false;
    let timerId = null;

    const checkPermissions = () => {
      try {
        const hasBridge =
          typeof window !== "undefined" &&
          window.Android &&
          typeof window.Android.hasLocationPermissions === "function";

        if (!hasBridge) {
          setPermissionStatus("bridge_unavailable");
          return;
        }

        const result = window.Android.hasLocationPermissions();
        const normalized = result ? "granted" : "missing";

        console.log("[TRACKER_PERMISSIONS] hasLocationPermissions=", normalized);
        setPermissionStatus(normalized);
      } catch (error) {
        console.error("[TRACKER_PERMISSIONS] check failed", error);
        setPermissionStatus("error");
      }
    };

    const tryStart = () => {
      if (cancelled) return;

      attempts += 1;
      setAttemptCount(attempts);

      const hasBridge =
        typeof window !== "undefined" &&
        window.Android &&
        typeof window.Android.startTracking === "function";

      setBridgeReady(Boolean(hasBridge));

      console.log("[TRACKER_AUTOSTART] attempt=", attempts, "hasBridge=", hasBridge);

      if (hasBridge) {
        setLastMessage("Bridge Android detectado. Intentando iniciar tracking...");
        setAutoStartStatus("starting");

        try {
          checkPermissions();
          window.Android.startTracking();

          console.log("[TRACKER_AUTOSTART] AUTO START TRACKING OK");
          setAutoStartStatus("started");
          setLastMessage("Tracking solicitado a Android correctamente.");
        } catch (error) {
          console.error("[TRACKER_AUTOSTART] startTracking failed", error);
          setAutoStartStatus("error");
          setLastMessage("Falló startTracking(). Revisa Logcat.");
        }

        return;
      }

      setLastMessage(`Esperando bridge Android... intento ${attempts}/10`);

      if (attempts < 10) {
        timerId = window.setTimeout(tryStart, 500);
      } else {
        console.log("[TRACKER_AUTOSTART] AUTO START TRACKING FAILED");
        setAutoStartStatus("failed");
        setLastMessage("No se encontró window.Android después de 10 intentos.");
      }
    };

    tryStart();

    return () => {
      cancelled = true;
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>TRACKER OK 2026 FINAL</h1>

        <div style={{ marginTop: "20px" }}>
          <div style={rowStyle}>
            <strong>Build</strong>
            <span>{buildMarker}</span>
          </div>

          <div style={rowStyle}>
            <strong>Bridge Android</strong>
            <span>{bridgeReady ? "READY" : "WAITING"}</span>
          </div>

          <div style={rowStyle}>
            <strong>Auto start</strong>
            <span>{autoStartStatus}</span>
          </div>

          <div style={rowStyle}>
            <strong>Permisos GPS</strong>
            <span>{permissionStatus}</span>
          </div>

          <div style={{ ...rowStyle, borderBottom: "none" }}>
            <strong>Intentos</strong>
            <span>{attemptCount}</span>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>
          Estado actual
        </div>
        <div style={{ fontSize: "16px" }}>{lastMessage}</div>
      </div>
    </div>
  );
}