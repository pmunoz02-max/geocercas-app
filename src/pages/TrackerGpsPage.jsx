import { useCallback, useEffect, useMemo, useState } from "react";

function getAndroidBridge() {
  if (typeof window === "undefined") return null;
  if (!window.Android) return null;
  return window.Android;
}

export default function TrackerGpsPage() {
  const [buildMarker] = useState("2026-04-04-E");
  const [bridgeReady, setBridgeReady] = useState(false);
  const [autoStartStatus, setAutoStartStatus] = useState("pending");
  const [permissionStatus, setPermissionStatus] = useState("unknown");
  const [attemptCount, setAttemptCount] = useState(0);
  const [lastMessage, setLastMessage] = useState("Inicializando tracker...");
  const [lastActionAt, setLastActionAt] = useState(null);

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
      boxSizing: "border-box",
    }),
    []
  );

  const cardStyle = useMemo(
    () => ({
      width: "100%",
      maxWidth: "760px",
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
      fontSize: "36px",
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
      padding: "10px 0",
      borderBottom: "1px solid #e5e7eb",
      fontSize: "16px",
    }),
    []
  );

  const buttonRowStyle = useMemo(
    () => ({
      display: "flex",
      flexWrap: "wrap",
      gap: "12px",
      justifyContent: "center",
      marginTop: "16px",
    }),
    []
  );

  const buttonStyle = useMemo(
    () => ({
      padding: "12px 16px",
      borderRadius: "10px",
      border: "1px solid #cbd5e1",
      background: "#ffffff",
      cursor: "pointer",
      fontSize: "15px",
      fontWeight: 600,
    }),
    []
  );

  const markAction = useCallback((message) => {
    setLastMessage(message);
    setLastActionAt(new Date().toLocaleTimeString());
  }, []);

  const refreshBridgeState = useCallback(() => {
    const bridge = getAndroidBridge();
    const ready = !!bridge;
    setBridgeReady(ready);
    return bridge;
  }, []);

  const checkPermissions = useCallback(() => {
    try {
      const bridge = refreshBridgeState();

      if (!bridge || typeof bridge.hasLocationPermissions !== "function") {
        setPermissionStatus("bridge_unavailable");
        markAction("Bridge Android no disponible para consultar permisos.");
        return false;
      }

      const result = bridge.hasLocationPermissions();
      const normalized = result ? "granted" : "missing";

      console.log("[TRACKER_PERMISSIONS] hasLocationPermissions=", normalized);
      setPermissionStatus(normalized);
      markAction(
        result
          ? "Permisos de ubicación confirmados."
          : "Faltan permisos de ubicación."
      );

      return result;
    } catch (error) {
      console.error("[TRACKER_PERMISSIONS] check failed", error);
      setPermissionStatus("error");
      markAction("Error al consultar permisos de ubicación.");
      return false;
    }
  }, [markAction, refreshBridgeState]);

  const startTracking = useCallback(() => {
    try {
      const bridge = refreshBridgeState();

      if (!bridge || typeof bridge.startTracking !== "function") {
        setAutoStartStatus("bridge_missing");
        markAction("Bridge Android no disponible para iniciar tracking.");
        return;
      }

      markAction("Solicitando inicio de tracking a Android...");
      bridge.startTracking();
      setAutoStartStatus("started");
      console.log("[TRACKER_MANUAL] startTracking called");
    } catch (error) {
      console.error("[TRACKER_MANUAL] startTracking failed", error);
      setAutoStartStatus("error");
      markAction("Falló startTracking(). Revisa Logcat.");
    }
  }, [markAction, refreshBridgeState]);

  const stopTracking = useCallback(() => {
    try {
      const bridge = refreshBridgeState();

      if (!bridge || typeof bridge.stopTracking !== "function") {
        markAction("Bridge Android no disponible para detener tracking.");
        return;
      }

      bridge.stopTracking();
      setAutoStartStatus("stopped");
      console.log("[TRACKER_MANUAL] stopTracking called");
      markAction("Tracking detenido desde la página.");
    } catch (error) {
      console.error("[TRACKER_MANUAL] stopTracking failed", error);
      markAction("Falló stopTracking(). Revisa Logcat.");
    }
  }, [markAction, refreshBridgeState]);

  const runAutoStart = useCallback(() => {
    let attempts = 0;
    let cancelled = false;
    let timerId = null;

    const tryStart = () => {
      if (cancelled) return;

      attempts += 1;
      setAttemptCount(attempts);

      const bridge = refreshBridgeState();
      const hasStart =
        !!bridge && typeof bridge.startTracking === "function";

      console.log("[TRACKER_AUTOSTART] attempt=", attempts, "hasBridge=", hasStart);

      if (hasStart) {
        setAutoStartStatus("starting");
        markAction("Bridge Android detectado. Intentando iniciar tracking...");

        try {
          checkPermissions();
          bridge.startTracking();
          console.log("[TRACKER_AUTOSTART] AUTO START TRACKING OK");
          setAutoStartStatus("started");
          markAction("Tracking solicitado a Android correctamente.");
        } catch (error) {
          console.error("[TRACKER_AUTOSTART] startTracking failed", error);
          setAutoStartStatus("error");
          markAction("Falló auto-start. Revisa Logcat.");
        }

        return;
      }

      markAction(`Esperando bridge Android... intento ${attempts}/10`);

      if (attempts < 10) {
        timerId = window.setTimeout(tryStart, 500);
      } else {
        console.log("[TRACKER_AUTOSTART] AUTO START TRACKING FAILED");
        setAutoStartStatus("failed");
        markAction("No se encontró window.Android después de 10 intentos.");
      }
    };

    tryStart();

    return () => {
      cancelled = true;
      if (timerId) window.clearTimeout(timerId);
    };
  }, [checkPermissions, markAction, refreshBridgeState]);

  useEffect(() => {
    console.log("[TRACKER_BUILD]", buildMarker);
    markAction(`Build cargado: ${buildMarker}`);
    refreshBridgeState();
  }, [buildMarker, markAction, refreshBridgeState]);

  useEffect(() => {
    const cleanup = runAutoStart();
    return cleanup;
  }, [runAutoStart]);

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
            <strong>Estado tracking</strong>
            <span>{autoStartStatus}</span>
          </div>

          <div style={rowStyle}>
            <strong>Permisos GPS</strong>
            <span>{permissionStatus}</span>
          </div>

          <div style={rowStyle}>
            <strong>Intentos auto-start</strong>
            <span>{attemptCount}</span>
          </div>

          <div style={{ ...rowStyle, borderBottom: "none" }}>
            <strong>Última acción</strong>
            <span>{lastActionAt || "-"}</span>
          </div>
        </div>

        <div style={buttonRowStyle}>
          <button type="button" style={buttonStyle} onClick={startTracking}>
            Iniciar tracking
          </button>

          <button type="button" style={buttonStyle} onClick={stopTracking}>
            Detener tracking
          </button>

          <button type="button" style={buttonStyle} onClick={checkPermissions}>
            Revisar permisos
          </button>

          <button
            type="button"
            style={buttonStyle}
            onClick={() => {
              setAttemptCount(0);
              setAutoStartStatus("pending");
              markAction("Reintentando auto-start manualmente...");
              runAutoStart();
            }}
          >
            Reintentar auto-start
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>
          Estado actual
        </div>
        <div style={{ fontSize: "16px", lineHeight: 1.5 }}>{lastMessage}</div>
      </div>
    </div>
  );
}