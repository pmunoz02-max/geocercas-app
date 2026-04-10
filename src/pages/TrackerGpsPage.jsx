import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import supabaseTracker from "../lib/supabaseTrackerClient";

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
  // --- LOG Y EXTRACCIÓN DE PARAMS AL MONTAR ---
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const href = window.location.href;
    const search = window.location.search;
    const params = Object.fromEntries(new URLSearchParams(search).entries());
    // Extraer inviteToken de forma flexible: inviteToken > token > t
    let inviteTokenRaw = params.inviteToken || params.invite_token || params.token || params.t || null;
    if (inviteTokenRaw) {
      try {
        sessionStorage.setItem('trackerInviteToken', inviteTokenRaw);
        console.log('[TRACKER_PAGE] inviteToken persisted to sessionStorage:', inviteTokenRaw);
      } catch {}
    } else {
      // Si no viene en query, intenta recuperar de sessionStorage
      try {
        inviteTokenRaw = sessionStorage.getItem('trackerInviteToken') || null;
      } catch {}
    }
    console.log('[TRACKER_PAGE] href=', href);
    console.log('[TRACKER_PAGE] search=', search);
    console.log('[TRACKER_PAGE] params=', params);
    console.log('[TRACKER_PAGE] inviteToken=', inviteTokenRaw);
  }, []);
  // Log mount
  useEffect(() => {
    console.log('[TRACKER_PAGE] mounted');
  }, []);
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
  // Assignment and health state removed from render logic
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

      // [TRACKER_BOOT] reactive check log (JSON.stringify for readable output)
      let token = null;
      let orgId = null;
      try {
        const trackerAuthRaw = typeof window !== "undefined" ? localStorage.getItem("geocercas-tracker-auth") : null;
        let trackerAuth = null;
        try { trackerAuth = trackerAuthRaw ? JSON.parse(trackerAuthRaw) : null; } catch { trackerAuth = null; }
        token = trackerAuth?.access_token || trackerAuth?.session?.access_token || null;
        orgId = typeof window !== "undefined" ? localStorage.getItem("org_id") : null;
      } catch {}
      console.log(
        "[TRACKER_BOOT] reactive check " +
        JSON.stringify({
          tokenPresent: !!token,
          orgIdPresent: !!orgId,
          ready: !!token && !!orgId,
        })
      );

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

  // --- Android session bridge: send session to native layer if available ---
  useEffect(() => {
    try {
      const token = localStorage.getItem("tracker_access_token");
      const orgId = localStorage.getItem("org_id");

      console.log(
        "[TRACKER_BOOT] " +
          JSON.stringify({
            tokenPresent: !!token,
            orgIdPresent: !!orgId,
            ready: !!token && !!orgId,
          })
      );

      if (!token || !orgId) return;

      window?.Android?.saveSession?.(token, orgId);
    } catch (e) {
      console.error("[TRACKER_SESSION_SEND] error", e);
    }
  }, []);

  // effectiveOrgId is just requestedOrgId now
  const effectiveOrgId = requestedOrgId;

  // Start tracking immediately if bridge is ready, trackerToken and orgId exist
  useEffect(() => {
    if (!bridgeReady) return;
    if (!trackerToken || !effectiveOrgId) return;
    const bridge = getAndroidBridge();
    if (bridge && typeof bridge.startTracking === "function") {
      try {
        bridge.startTracking();
        setServiceBootstrapRequested(true);
        markMessage("Seguimiento iniciado inmediatamente (sin esperar assignment/status)");
      } catch (e) {
        console.error("[TrackerGpsPage] startTracking failed", e);
      }
    }
  }, [bridgeReady, trackerToken, effectiveOrgId, markMessage]);

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

  // batteryPromptDismissed: siempre leer de localStorage en cada render
  const [batteryPromptDismissedState, setBatteryPromptDismissedState] = useState(() => {
    try {
      return localStorage.getItem("batteryPromptDismissed") === "true";
    } catch {
      return false;
    }
  });

  // Siempre reflejar el valor actual de localStorage en cada render
  const batteryPromptDismissed = (() => {
    try {
      return localStorage.getItem("batteryPromptDismissed") === "true";
    } catch {
      return batteryPromptDismissedState;
    }
  })();

  const handleContinueAnyway = () => {
    try {
      localStorage.setItem("batteryPromptDismissed", "true");
    } catch {}
    setBatteryPromptDismissedState(true); // fuerza rerender inmediato
    // No limpiar search params, no redirigir, no reiniciar nada
    // Solo cerrar el battery gate y continuar el flujo actual
    console.log('[TRACKER_PAGE] battery gate dismissed (continuar de todos modos)');
  };

  const renderBatteryOptBlock = () => {
    if (!bridgeReady) return null;

    const batteryOptimizationDisabled =
      batteryOptStatus.ignoring ??
      bridgeStatus.batteryOptimizationDisabled ??
      bridgeStatus.isIgnoringBatteryOptimizations ??
      false;

    const backgroundAllowed = bridgeStatus?.backgroundAllowed ?? false;

    // Si ya está desactivada la optimización, o el usuario ya la descartó, no mostrar el bloque
    if ((batteryOptimizationDisabled && backgroundAllowed) || batteryPromptDismissed) return null;

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

        <div style={{ display: "flex", gap: 16 }}>
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
          <button
            type="button"
            onClick={handleContinueAnyway}
            style={{
              border: "1px solid #d0d7de",
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 15,
              fontWeight: 600,
              background: "#fff",
              color: "#222",
              cursor: "pointer",
            }}
          >
            Continuar de todos modos
          </button>
        </div>
      </div>
    );
  };

  // --- CRITICAL CHECKS & LOGS ---
  const trackerAuthRaw = typeof window !== "undefined" ? localStorage.getItem("geocercas-tracker-auth") : null;
  let trackerAuth = null;
  try {
    trackerAuth = trackerAuthRaw ? JSON.parse(trackerAuthRaw) : null;
  } catch {
    trackerAuth = null;
  }
  const trackerToken = trackerAuth?.access_token || trackerAuth?.session?.access_token || null;

  // [TRACKER_BOOT] log after reading from storage
  if (typeof window !== "undefined") {
    const orgIdStorage = localStorage.getItem("org_id");
    const tokenPresent = !!trackerToken;
    const orgIdPresent = !!orgIdStorage;
    const ready = tokenPresent && orgIdPresent;
    console.log('[TRACKER_BOOT] storage', {
      tokenPresent,
      orgIdPresent,
      ready,
      trackerToken,
      orgIdStorage,
    });
  }


  // Bootstrap de invitación: lectura única y estado persistente
  const [inviteBootstrap, setInviteBootstrap] = useState({
    loading: true,
    done: false,
    inviteAccepted: false,
    trackerUserId: null,
    orgId: null,
    email: null,
    error: null,
    debug: {},
  });

  useEffect(() => {
    // Solo leer una vez al montar
    if (typeof window === "undefined") return;
    const params = Object.fromEntries(new URLSearchParams(window.location.search).entries());
    let inviteToken = params.inviteToken || params.invite_token || params.token || params.t || null;
    let orgId = params.org_id || localStorage.getItem("org_id") || null;
    if (!inviteToken) {
      try { inviteToken = sessionStorage.getItem('trackerInviteToken') || null; } catch {}
    } else {
      try { sessionStorage.setItem('trackerInviteToken', inviteToken); } catch {}
    }
    // Guardar orgId en localStorage para persistencia posterior
    if (orgId) {
      try { localStorage.setItem("org_id", orgId); } catch {}
    }
    setInviteBootstrap(prev => ({ ...prev, loading: true, done: false, error: null, debug: { params, inviteToken, orgId } }));
    // [TRACKER_BOOT] log after invite bootstrap params
    const tokenPresent = !!inviteToken;
    const orgIdPresent = !!orgId;
    const ready = tokenPresent && orgIdPresent;
    console.log('[TRACKER_BOOT] inviteBootstrap', {
      tokenPresent,
      orgIdPresent,
      ready,
      inviteToken,
      orgId,
      params,
    });
    if (!inviteToken || !orgId) {
      setInviteBootstrap(prev => ({ ...prev, loading: false, done: true, inviteAccepted: false, trackerUserId: null, orgId, email: null, error: "Faltan inviteToken u org_id", debug: { ...prev.debug, fail: true } }));
      return;
    }
    // --- DEBUG: Log inviteToken, t, length, and equality ---
    const urlParams = new URLSearchParams(window.location.search);
    const inviteTokenFromUrl = urlParams.get("inviteToken") || urlParams.get("invite_token") || urlParams.get("token") || urlParams.get("t") || null;
    const tFromUrl = urlParams.get("t") || null;
    console.log('[TRACKER_PAGE] DEBUG inviteToken', {
      inviteToken: inviteTokenFromUrl,
      t: tFromUrl,
      inviteToken_length: inviteTokenFromUrl ? inviteTokenFromUrl.length : null,
      t_length: tFromUrl ? tFromUrl.length : null,
      inviteToken_eq_t: inviteTokenFromUrl === tFromUrl,
    });
    (async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const resp = await fetch(
          `${supabaseUrl}/functions/v1/accept-tracker-invite`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({ inviteToken, org_id: orgId }),
          }
        );
        const result = await resp.json().catch(() => ({}));
        if (!resp.ok || !result?.ok) {
          setInviteBootstrap(prev => ({
            ...prev,
            loading: false,
            done: true,
            inviteAccepted: false,
            trackerUserId: null,
            orgId: result?.org_id ?? orgId ?? null,
            email: result?.email ?? null,
            error: result?.error || `http_${resp.status}`,
            debug: {
              ...prev.debug,
              params,
              inviteToken,
              orgId,
              status: resp.status,
              result,
            },
          }));
          return;
        }


        // --- Custom tracker auth: store access_token and IDs, set sessionSet/trackerSessionReady ---
        const accessToken = result?.session?.access_token || null;
        if (result?.ok && result?.tracker_user_id && result?.org_id && accessToken) {
          try {
            // Always overwrite tracker_access_token with the new invite session access_token
            localStorage.setItem('tracker_access_token', accessToken);
            localStorage.setItem('tracker_user_id', result.tracker_user_id);
            localStorage.setItem('tracker_org_id', result.org_id);
            // Clear any legacy tracker runtime auth tokens
            try { localStorage.removeItem('geocercas-tracker-auth'); } catch {}
            try { localStorage.removeItem('tracker_legacy_token'); } catch {}


            // --- Push new access token and tracker user id to Android native bridge if available ---
            // Después de bootstrap de invitación exitoso, enviar access_token y tracker_user_id al bridge nativo Android
            // Ambos son requeridos para la autenticación nativa estricta
            const trackerUserId = result?.tracker_user_id;
            if (accessToken && trackerUserId && window.Android?.replaceTrackerToken) {
              try {
                window.Android.replaceTrackerToken(accessToken, trackerUserId);
              } catch (e) {
                console.error('[tracker] android replaceTrackerToken failed', e);
              }
            }

            setInviteBootstrap(prev => ({
              ...prev,
              inviteAccepted: true,
              trackerUserId: result.tracker_user_id,
              orgId: result.org_id,
              email: result.email ?? null,
              sessionSet: true,
              trackerSessionReady: true,
              sessionErrorMessage: null,
              debug: {
                ...prev.debug,
                status: resp.status,
                result,
                accessTokenStored: true,
                androidTokenPush: true,
              },
            }));
          } catch (e) {
            setInviteBootstrap(prev => ({
              ...prev,
              sessionSet: false,
              trackerSessionReady: false,
              sessionErrorMessage: e?.message || 'tracker_token_store_failed',
            }));
          }
        }
      } catch (err) {
        setInviteBootstrap(prev => ({
          ...prev,
          loading: false,
          done: true,
          inviteAccepted: false,
          trackerUserId: null,
          orgId,
          email: null,
          error: err?.message || "Excepción desconocida",
          debug: {
            ...prev.debug,
            params,
            inviteToken,
            orgId,
            fetchException: true,
            errorMessage: err?.message ?? null,
            errorName: err?.name ?? null,
            errorContext: err?.context ?? null,
            errorObject: err ? String(err) : null,
          },
        }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);




  // --- RENDER: solo bloquea si faltan trackerToken u orgId ---
  const inviteTrackerToken = inviteBootstrap?.inviteToken || inviteBootstrap?.token || inviteBootstrap?.t || trackerAuth?.access_token || trackerAuth?.session?.access_token || null;
  const orgId = inviteBootstrap?.orgId || effectiveOrgId || null;


  // [TRACKER_BOOT] log before rendering main content
  const tokenPresent = !!inviteTrackerToken;
  const orgIdPresent = !!orgId;
  const ready = tokenPresent && orgIdPresent;
  console.log('[TRACKER_BOOT] renderCheck', {
    tokenPresent,
    orgIdPresent,
    ready,
    inviteTrackerToken,
    orgId,
  });

  if (!inviteTrackerToken || !orgId) {
    return <Inicializando />;
  }

  // 👉 TODO LO DEMÁS NO BLOQUEA
  // Log render principal
  console.log('[TRACKER_PAGE] rendering main content', {
    inviteBootstrap,
    inviteTrackerToken,
    orgId,
    androidBridge: !!bridgeReady,
    batteryPromptDismissed,
  });

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
      <div
        style={{
          width: "100%",
          maxWidth: 760,
          border: "1px solid #d0d7de",
          borderRadius: 12,
          padding: 20,
          background: "#f8f9fb",
          marginTop: 24,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          Tracker activo
        </div>
        <div style={{ fontSize: 15, marginBottom: 8 }}>
          El tracking está funcionando correctamente.<br />
          Último estado: <b>{lastMessage}</b>
        </div>
        <div style={{ fontSize: 13, color: "#555" }}>
          OrgId: <b>{String(orgId)}</b>
        </div>
      </div>
    </div>
  );
}
