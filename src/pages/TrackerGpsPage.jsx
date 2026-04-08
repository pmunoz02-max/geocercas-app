import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function getAndroidBridge() {
  if (typeof window === "undefined") return null;
  return window.Android || window.AndroidBridge || null;
}

function mapHealthState(status) {
  const normalized = String(status || "offline").toLowerCase();
  if (["online", "active", "ok", "healthy"].includes(normalized)) return "online";
  if (["idle", "waiting"].includes(normalized)) return "idle";
  if (["offline", "inactive", "disconnected"].includes(normalized)) return "offline";
  return normalized;
}

export default function TrackerGpsPage() {
  const buildMarker =
    import.meta.env.VITE_BUILD_MARKER ||
    import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA ||
    "tracker-gps";

  const autoStartTrackingOnceRef = useRef(false);
  const [serviceBootstrapRequested, setServiceBootstrapRequested] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState({
    permissionsOk: null,
    backgroundAllowed: null,
    serviceRunning: null,
    batteryOptimizationDisabled: null,
  });
  const [requestedOrgId, setRequestedOrgId] = useState(null);
  const [assignmentState, setAssignmentState] = useState({
    loading: true,
    error: null,
    active: false,
    reason: "loading",
    orgAccess: "none",
    orgAccessSource: "backend:/api/tracker-active-assignment",
    requestedOrgId: null,
    effectiveOrgId: null,
    assignment: null,
  });
  const [healthState, setHealthState] = useState({
    loading: true,
    error: null,
    row: null,
  });
  const [lastMessage, setLastMessage] = useState("Sincronizando estado con backend...");
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [batteryOptStatus, setBatteryOptStatus] = useState({
    supported: null,
    ignoring: null,
    raw: null,
  });
  const [batteryOptLoading, setBatteryOptLoading] = useState(false);

  const markMessage = useCallback((message) => {
    setLastMessage(message);
    setLastSyncAt(new Date().toLocaleTimeString());
  }, []);

  const resolveOrgId = useCallback(async () => {
    if (typeof window === "undefined") return null;

    const fromQuery = String(new URLSearchParams(window.location.search).get("org_id") || "").trim();
    if (fromQuery) {
      localStorage.setItem("org_id", fromQuery);
      return fromQuery;
    }

    const fromStorage = String(localStorage.getItem("org_id") || "").trim();
    if (fromStorage) return fromStorage;

    return null;
  }, []);

  const refreshBridgeState = useCallback(() => {
    let attempts = 0;

    const readBridgeStatus = (bridge) => {
      if (!bridge) {
        setBridgeStatus({
          permissionsOk: null,
          backgroundAllowed: null,
          serviceRunning: null,
          batteryOptimizationDisabled: null,
        });
        return;
      }

      try {
        const permissionsOk =
          typeof bridge.isPermissionsOk === "function"
            ? !!bridge.isPermissionsOk()
            : typeof bridge.hasPermissions === "function"
              ? !!bridge.hasPermissions()
              : null;

        const backgroundAllowed =
          typeof bridge.isBackgroundAllowed === "function"
            ? !!bridge.isBackgroundAllowed()
            : null;

        const serviceRunning =
          typeof bridge.isServiceRunning === "function"
            ? !!bridge.isServiceRunning()
            : null;

        const batteryOptimizationDisabled =
          typeof bridge.isIgnoringBatteryOptimizations === "function"
            ? !!bridge.isIgnoringBatteryOptimizations()
            : typeof bridge.getBatteryOptimizationStatus === "function"
              ? (() => {
                  try {
                    const raw = bridge.getBatteryOptimizationStatus();
                    if (typeof raw === "string") {
                      const parsed = JSON.parse(raw);
                      return !!(parsed?.ignoring ?? parsed?.disabled ?? false);
                    }
                    if (raw && typeof raw === "object") {
                      return !!(raw.ignoring ?? raw.disabled ?? false);
                    }
                  } catch {
                    return null;
                  }
                  return null;
                })()
              : null;

        setBridgeStatus({
          permissionsOk,
          backgroundAllowed,
          serviceRunning,
          batteryOptimizationDisabled,
        });
      } catch (error) {
        console.error("[TrackerGpsPage] bridge status read failed", error);
      }
    };

    const tick = () => {
      const bridge = getAndroidBridge();
      readBridgeStatus(bridge);

      if (!bridge && attempts < 10 && typeof window !== "undefined") {
        attempts += 1;
        window.setTimeout(tick, 500);
      }
    };

    tick();
  }, []);

  const requestServiceBootstrapOnce = useCallback(
    ({ backendAssignmentFound, allowNoSessionFallback, effectiveOrgId }) => {
      if (autoStartTrackingOnceRef.current) return false;

      const bridge = getAndroidBridge();
      if (!bridge || typeof bridge.startTracking !== "function") return false;

      const bridgePermissionsOk =
        typeof bridge.isPermissionsOk === "function"
          ? !!bridge.isPermissionsOk()
          : typeof bridge.hasPermissions === "function"
            ? !!bridge.hasPermissions()
            : bridgeStatus.permissionsOk === true;

      if (!bridgePermissionsOk) return false;

      const bridgeServiceRunning =
        typeof bridge.isServiceRunning === "function"
          ? !!bridge.isServiceRunning()
          : bridgeStatus.serviceRunning === true;

      if (bridgeServiceRunning) return false;
      if (!backendAssignmentFound && !allowNoSessionFallback) return false;

      const fallbackOrgId =
        typeof window !== "undefined"
          ? String(new URLSearchParams(window.location.search).get("org_id") || "").trim() ||
            String(localStorage.getItem("org_id") || "").trim() ||
            null
          : null;

      const orgIdForTracking = effectiveOrgId || fallbackOrgId;
      if (!orgIdForTracking) return false;

      try {
        localStorage.setItem("org_id", orgIdForTracking);
        bridge.startTracking();
        autoStartTrackingOnceRef.current = true;
        setServiceBootstrapRequested(true);
        setBridgeStatus((prev) => ({
          ...prev,
          permissionsOk: bridgePermissionsOk,
          serviceRunning: true,
        }));

        markMessage(
          backendAssignmentFound
            ? "Seguimiento iniciado en Android."
            : "Seguimiento iniciado con el contexto local de la organización."
        );

        return true;
      } catch (error) {
        console.error("[TrackerGpsPage] service bootstrap request failed", error);
        return false;
      }
    },
    [bridgeStatus.permissionsOk, bridgeStatus.serviceRunning, markMessage]
  );

  const syncPassiveState = useCallback(async () => {
    try {
      refreshBridgeState();

      const queryOrgId =
        typeof window !== "undefined"
          ? String(new URLSearchParams(window.location.search).get("org_id") || "").trim() || null
          : null;

      if (queryOrgId) {
        localStorage.setItem("org_id", queryOrgId);
        setRequestedOrgId(queryOrgId);
      }

      const trackerAuthRaw = localStorage.getItem("geocercas-tracker-auth");
      let trackerAuth = null;

      try {
        trackerAuth = trackerAuthRaw ? JSON.parse(trackerAuthRaw) : null;
      } catch {
        trackerAuth = null;
      }

      const bearerToken = trackerAuth?.access_token || trackerAuth?.session?.access_token || null;

      const decodeJwtPayload = (token) => {
        try {
          return JSON.parse(atob(token.split(".")[1]));
        } catch {
          return null;
        }
      };

      const bearerPayload = bearerToken ? decodeJwtPayload(bearerToken) : null;
      const trackerUserId = bearerPayload?.sub || null;

      if (!bearerToken || !trackerUserId) {
        const persistedOrgId = String(localStorage.getItem("org_id") || "").trim() || null;

        setRequestedOrgId(persistedOrgId);
        setAssignmentState({
          loading: false,
          error: "no_session",
          active: false,
          reason: "no_session",
          orgAccess: "none",
          orgAccessSource: "backend:/api/tracker-active-assignment",
          requestedOrgId: persistedOrgId,
          effectiveOrgId: persistedOrgId,
          assignment: null,
        });
        setHealthState({ loading: false, error: "no_session", row: null });

        markMessage(
          persistedOrgId
            ? "Sin sesión web activa. Se mantiene el contexto de organización."
            : "Sin sesión web activa. Abre la URL del tracker con org_id."
        );

        requestServiceBootstrapOnce({
          backendAssignmentFound: false,
          allowNoSessionFallback: true,
          effectiveOrgId: persistedOrgId,
        });
        return;
      }

      const resolvedOrgId = await resolveOrgId();
      setRequestedOrgId(resolvedOrgId || null);

      if (!resolvedOrgId) {
        setAssignmentState({
          loading: false,
          error: "missing_org",
          active: false,
          reason: "missing_org",
          orgAccess: "none",
          orgAccessSource: "backend:/api/tracker-active-assignment",
          requestedOrgId: null,
          effectiveOrgId: null,
          assignment: null,
        });
        setHealthState({ loading: false, error: "missing_org", row: null });
        markMessage("No se pudo resolver la organización activa del tracker.");
        return;
      }

      const assignmentRes = await fetch("/api/tracker-active-assignment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({ requested_org_id: resolvedOrgId }),
      });

      const assignmentJson = await assignmentRes.json().catch(() => ({}));

      if (!assignmentRes.ok || !assignmentJson?.ok) {
        setAssignmentState({
          loading: false,
          error: assignmentJson?.error || "assignment_error",
          active: false,
          reason: assignmentJson?.reason || "assignment_error",
          orgAccess: assignmentJson?.org_access || "none",
          orgAccessSource: "backend:/api/tracker-active-assignment",
          requestedOrgId: resolvedOrgId,
          effectiveOrgId:
            assignmentJson?.assignment?.org_id || assignmentJson?.org_id || resolvedOrgId,
          assignment: null,
        });
        setHealthState({ loading: false, error: null, row: null });
        markMessage("No se pudo confirmar una asignación activa desde backend.");
        return;
      }

      const effectiveOrgId =
        assignmentJson?.assignment?.org_id ||
        assignmentJson?.tracker_assignment?.org_id ||
        assignmentJson?.org_id ||
        resolvedOrgId;

      localStorage.setItem("org_id", effectiveOrgId);

      setAssignmentState({
        loading: false,
        error: null,
        active: !!assignmentJson.active,
        reason: assignmentJson.reason || (assignmentJson.active ? "active" : "waiting_for_assignment"),
        orgAccess: assignmentJson.org_access || "none",
        orgAccessSource: "backend:/api/tracker-active-assignment",
        requestedOrgId: resolvedOrgId,
        effectiveOrgId,
        assignment: assignmentJson.assignment || null,
      });

      requestServiceBootstrapOnce({
        backendAssignmentFound: !!assignmentJson.active,
        allowNoSessionFallback: false,
        effectiveOrgId,
      });

      if (!assignmentJson.active) {
        setHealthState({ loading: false, error: null, row: null });

        if (assignmentJson.reason === "no_personal_profile") {
          markMessage("La cuenta no está configurada como personal tracker.");
        } else {
          markMessage("Sesión válida, pero el tracker aún no tiene asignación activa.");
        }
        return;
      }

      const statusRes = await supabase.rpc("rpc_tracker_dashboard_status", {
        p_org_id: effectiveOrgId,
      });

      if (statusRes.error) {
        setHealthState({
          loading: false,
          error: statusRes.error.message,
          row: null,
        });
        markMessage("Asignación activa detectada, pero no se pudo leer tracker_health.");
        return;
      }

      const rows = Array.isArray(statusRes.data) ? statusRes.data : [];
      const ownRow = rows.find(
        (row) => String(row?.tracker_user_id || row?.user_id || "") === String(trackerUserId)
      );

      if (!ownRow) {
        setHealthState({
          loading: false,
          error: "health_row_not_found",
          row: null,
        });
        markMessage("Asignación activa detectada, pero aún no hay fila propia en tracker_health.");
        return;
      }

      setHealthState({
        loading: false,
        error: null,
        row: {
          ...ownRow,
          status: mapHealthState(ownRow?.status),
        },
      });

      markMessage("Estado sincronizado desde backend.");
    } catch (error) {
      console.error("[TrackerGpsPage] sync failed", error);

      setAssignmentState((prev) => ({
        ...prev,
        loading: false,
        error: prev.error || "sync_failed",
        reason: prev.reason === "loading" ? "sync_failed" : prev.reason,
      }));

      setHealthState((prev) => ({
        ...prev,
        loading: false,
        error: prev.error || "sync_failed",
      }));

      markMessage("Error sincronizando estado del tracker.");
    }
  }, [markMessage, refreshBridgeState, requestServiceBootstrapOnce, resolveOrgId]);

  useEffect(() => {
    markMessage(`Build cargado: ${buildMarker}`);

    let attempts = 0;
    let timeoutId = null;
    let cancelled = false;

    const checkBridge = () => {
      if (cancelled) return;

      const bridge = getAndroidBridge();

      if (bridge) {
        setBridgeReady(true);
        refreshBridgeState();
        return;
      }

      setBridgeReady(false);
      setBridgeStatus({
        permissionsOk: null,
        backgroundAllowed: null,
        serviceRunning: null,
        batteryOptimizationDisabled: null,
      });

      if (attempts < 10 && typeof window !== "undefined") {
        attempts += 1;
        timeoutId = window.setTimeout(checkBridge, 500);
      }
    };

    checkBridge();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [buildMarker, markMessage, refreshBridgeState]);

  useEffect(() => {
    let disposed = false;
    let timerId = null;

    const run = async () => {
      if (disposed) return;
      await syncPassiveState();
      if (disposed) return;
      timerId = window.setTimeout(run, 30_000);
    };

    void run();

    return () => {
      disposed = true;
      if (timerId) window.clearTimeout(timerId);
    };
  }, [syncPassiveState]);

  const effectiveOrgId = useMemo(
    () => assignmentState.effectiveOrgId || assignmentState.assignment?.org_id || requestedOrgId || null,
    [assignmentState.assignment, assignmentState.effectiveOrgId, requestedOrgId]
  );

  useEffect(() => {
    if (!bridgeReady) return;

    requestServiceBootstrapOnce({
      backendAssignmentFound: assignmentState.active === true,
      allowNoSessionFallback: assignmentState.reason === "no_session",
      effectiveOrgId,
    });
  }, [
    assignmentState.active,
    assignmentState.reason,
    bridgeReady,
    effectiveOrgId,
    requestServiceBootstrapOnce,
  ]);

  const refreshBatteryOptStatus = useCallback(() => {
    const bridge = getAndroidBridge();
    if (!bridge) {
      setBatteryOptStatus({ supported: null, ignoring: null, raw: null });
      return;
    }

    try {
      if (typeof bridge.getBatteryOptimizationStatus === "function") {
        const raw = bridge.getBatteryOptimizationStatus();
        let parsed = raw;
        if (typeof raw === "string") {
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = { raw };
          }
        }

        const ignoring = !!(parsed?.ignoring ?? parsed?.disabled ?? false);
        setBatteryOptStatus({ supported: true, ignoring, raw: parsed });
        setBridgeStatus((prev) => ({
          ...prev,
          batteryOptimizationDisabled: ignoring,
        }));
        return;
      }

      if (typeof bridge.isIgnoringBatteryOptimizations === "function") {
        const ignoring = !!bridge.isIgnoringBatteryOptimizations();
        setBatteryOptStatus({ supported: true, ignoring, raw: { ignoring } });
        setBridgeStatus((prev) => ({
          ...prev,
          batteryOptimizationDisabled: ignoring,
        }));
        return;
      }
    } catch (error) {
      console.error("[TrackerGpsPage] battery optimization status failed", error);
    }

    setBatteryOptStatus({ supported: false, ignoring: null, raw: null });
  }, []);

  const openBatteryOptimizationSettings = useCallback(async () => {
    const bridge = getAndroidBridge();
    if (!bridge) return;

    setBatteryOptLoading(true);
    try {
      if (typeof bridge.requestIgnoreBatteryOptimizations === "function") {
        await bridge.requestIgnoreBatteryOptimizations();
      } else if (typeof bridge.requestDisableBatteryOptimization === "function") {
        await bridge.requestDisableBatteryOptimization();
      } else if (typeof bridge.openBatteryOptimizationSettings === "function") {
        await bridge.openBatteryOptimizationSettings();
      }
    } catch (error) {
      console.error("[TrackerGpsPage] battery optimization request failed", error);
    } finally {
      window.setTimeout(() => {
        refreshBatteryOptStatus();
        setBatteryOptLoading(false);
      }, 1200);
    }
  }, [refreshBatteryOptStatus]);

  useEffect(() => {
    refreshBatteryOptStatus();
    const onVisibility = () => window.setTimeout(refreshBatteryOptStatus, 300);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refreshBatteryOptStatus]);

  const renderBatteryOptBlock = () => {
    if (!bridgeReady) return null;

    const batteryOptimizationDisabled =
      batteryOptStatus.ignoring ??
      bridgeStatus.batteryOptimizationDisabled ??
      bridgeStatus.isIgnoringBatteryOptimizations ??
      false;

    const backgroundAllowed = bridgeStatus?.backgroundAllowed ?? false;

    if (batteryOptimizationDisabled && backgroundAllowed) return null;

    return (
      <div
        style={{
          width: "100%",
          maxWidth: 760,
          border: "1px solid #d0d7de",
          borderRadius: 12,
          padding: 20,
          background: "#f8f9fb",
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          Optimización de batería
        </div>

        <div style={{ fontSize: 15, lineHeight: 1.5, marginBottom: 16 }}>
          Para mejorar el envío continuo de ubicación en Android, desactiva las restricciones
          de batería para esta app.
        </div>

        <button
          type="button"
          onClick={openBatteryOptimizationSettings}
          disabled={batteryOptLoading}
          style={{
            border: "none",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 15,
            fontWeight: 600,
            cursor: batteryOptLoading ? "default" : "pointer",
            opacity: batteryOptLoading ? 0.7 : 1,
          }}
        >
          {batteryOptLoading ? "Abriendo ajustes..." : "Abrir ajustes"}
        </button>
      </div>
    );
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 16,
        padding: 24,
        background: "#ffffff",
        color: "#111111",
        fontFamily: "Arial, sans-serif",
        boxSizing: "border-box",
      }}
    >
      {renderBatteryOptBlock()}
    </div>
  );
}
