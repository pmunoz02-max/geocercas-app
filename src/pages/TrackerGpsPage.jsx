import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function getAndroidBridge() {
  if (typeof window === "undefined") return null;
  console.log("ANDROID BRIDGE:", window["Android"]);
  return window["Android"] || null;
}

function resolveVisibleState(assignmentState, healthState) {
  if (assignmentState.loading || healthState.loading) return "loading";

  if (assignmentState.reason === "no_session") {
    return "no web session yet";
  }

  if (assignmentState.reason === "missing_org") {
    return "missing org context";
  }

  if (assignmentState.reason === "no_personal_profile") {
    return "tracker personnel not configured";
  }

  if (assignmentState.error && !assignmentState.active) {
    return "missing session/context";
  }

  if (!assignmentState.active) {
    return "waiting for assignment";
  }

  return String(healthState.row?.status || "offline");
}

export default function TrackerGpsPage() {
  const [buildMarker] = useState("2026-04-05-passive-status");
  const [bridgeReady, setBridgeReady] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState({
    permissionsOk: null,
    backgroundAllowed: null,
    serviceRunning: null,
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

  const markMessage = useCallback((message) => {
    setLastMessage(message);
    setLastSyncAt(new Date().toLocaleTimeString());
  }, []);

  const refreshBridgeState = useCallback(() => {
    let attempts = 0;

    const readBridgeStatus = (bridge) => {
      if (!bridge) {
        setBridgeStatus({
          permissionsOk: null,
          backgroundAllowed: null,
          serviceRunning: null,
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

        setBridgeStatus({ permissionsOk, backgroundAllowed, serviceRunning });
      } catch (e) {
        console.error("[TrackerGpsPage] readBridgeStatus error", e);
      }
    };

    const check = () => {
      const bridge = getAndroidBridge();

      if (typeof window !== "undefined") {
        console.log("window.Android:", window.Android);
      }

      if (bridge) {
        console.log("[BRIDGE] detected");
        setBridgeReady(true);
        readBridgeStatus(bridge);
        return true;
      }

      setBridgeReady(false);
      setBridgeStatus({
        permissionsOk: null,
        backgroundAllowed: null,
        serviceRunning: null,
      });

      if (attempts < 20) {
        attempts += 1;
        setTimeout(check, 300);
      }

      return false;
    };

    check();
  }, []);

  const resolveOrgId = useCallback(async (userId) => {
    const queryOrg =
      typeof window !== "undefined"
        ? String(new URLSearchParams(window.location.search).get("org_id") || "").trim()
        : "";

    if (queryOrg) {
      localStorage.setItem("org_id", queryOrg);
      return queryOrg;
    }

    const localOrg = String(localStorage.getItem("org_id") || "").trim();
    if (localOrg) return localOrg;

    if (!userId) return null;

    const { data: membership, error } = await supabase
      .from("memberships")
      .select("org_id, is_default, revoked_at")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[TrackerGpsPage] memberships error", error);
      return null;
    }

    const resolvedOrgId = membership?.org_id || null;
    if (resolvedOrgId) localStorage.setItem("org_id", resolvedOrgId);
    return resolvedOrgId;
  }, []);

  const mapHealthState = useCallback((status) => {
    const v = String(status || "").toLowerCase();
    if (["active", "stale", "restricted", "pending_permissions", "offline"].includes(v)) {
      return v;
    }
    return "offline";
  }, []);

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

      const bearerToken =
        trackerAuth?.access_token ||
        trackerAuth?.session?.access_token ||
        null;

      const decodeJwtPayload = (token) => {
        try {
          return JSON.parse(atob(token.split(".")[1]));
        } catch {
          return null;
        }
      };

      const bearerPayload = bearerToken ? decodeJwtPayload(bearerToken) : null;

      console.log("[TRACKER_FETCH_TOKEN]", {
        sub: bearerPayload?.sub,
        email: bearerPayload?.email,
      });

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
            ? "No web session yet. Organization context preserved from URL/localStorage."
            : "No web session yet. Open tracker URL with org_id to preserve org context."
        );
        return;
      }

      const resolvedOrgId = await resolveOrgId(trackerUserId);
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
            assignmentJson?.assignment?.org_id ||
            assignmentJson?.org_id ||
            resolvedOrgId,
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

      if (!assignmentJson.active) {
        setHealthState({ loading: false, error: null, row: null });

        if (assignmentJson.reason === "no_personal_profile") {
          if (assignmentJson.org_access === "owner") {
            markMessage("You own this organization but are not configured as tracker personnel.");
          } else {
            markMessage("You have organization access but are not configured as tracker personnel.");
          }
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

      markMessage("Estado sincronizado desde backend (assignment + tracker_health).");
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

      markMessage("Error sincronizando estado pasivo del tracker.");
    }
  }, [mapHealthState, markMessage, refreshBridgeState, resolveOrgId]);

  useEffect(() => {
    markMessage(`Build cargado: ${buildMarker}`);

    let attempts = 0;
    let timeoutId = null;
    let cancelled = false;

    const checkBridge = () => {
      if (cancelled) return;

      const bridge = typeof window !== "undefined" ? window.Android : null;

      if (bridge) {
        setBridgeReady(true);

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

          setBridgeStatus({ permissionsOk, backgroundAllowed, serviceRunning });
        } catch (e) {
          console.error("[TrackerGpsPage] initial bridge status read failed", e);
        }

        return;
      }

      setBridgeReady(false);
      setBridgeStatus({
        permissionsOk: null,
        backgroundAllowed: null,
        serviceRunning: null,
      });

      if (attempts < 10) {
        attempts += 1;
        timeoutId = window.setTimeout(checkBridge, 500);
      }
    };

    checkBridge();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [buildMarker, markMessage]);

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

  const assignmentWindow = useMemo(() => {
    const start =
      assignmentState.assignment?.start_time ||
      assignmentState.assignment?.start_date ||
      null;

    const end =
      assignmentState.assignment?.end_time ||
      assignmentState.assignment?.end_date ||
      null;

    if (!start && !end) return "-";
    return `${start || "-"} → ${end || "-"}`;
  }, [assignmentState.assignment]);

  const visibleState = useMemo(
    () => resolveVisibleState(assignmentState, healthState),
    [assignmentState, healthState]
  );

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
        <h1 style={{ fontSize: 36, fontWeight: 700, color: "red", margin: 0 }}>
          TRACKER OK 2026 FINAL
        </h1>

        <div style={{ marginTop: 20 }}>
          {[
            ["Build", buildMarker],
            ["Bridge Android", bridgeReady ? "READY" : "WAITING"],
            ["Estado tracking", visibleState],
            ["Asignación activa", assignmentState.active ? "YES" : "NO"],
            ["Reason asignación", assignmentState.reason || "-"],
            ["Org access", assignmentState.orgAccess || "-"],
            ["Org access source", assignmentState.orgAccessSource || "-"],
            ["Org ID solicitado", assignmentState.requestedOrgId || requestedOrgId || "-"],
            ["Org ID efectivo", effectiveOrgId || "-"],
            ["Assignment ID", assignmentState.assignment?.id || "-"],
            ["Ventana asignación", assignmentWindow],
            ["tracker_health.status", healthState.row?.status || "-"],
            ["permissions_ok", String(bridgeStatus.permissionsOk ?? healthState.row?.permissions_ok ?? "-")],
            ["background_allowed", String(bridgeStatus.backgroundAllowed ?? healthState.row?.background_allowed ?? "-")],
            ["service_running", String(bridgeStatus.serviceRunning ?? healthState.row?.service_running ?? "-")],
            ["Última sincronización", lastSyncAt || "-"],
          ].map(([label, value], idx, arr) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                padding: "10px 0",
                borderBottom: idx === arr.length - 1 ? "none" : "1px solid #e5e7eb",
                fontSize: 16,
              }}
            >
              <strong>{label}</strong>
              <span style={{ textAlign: "right" }}>{value}</span>
            </div>
          ))}
        </div>


      </div>

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
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Estado actual</div>
        <div style={{ fontSize: 16, lineHeight: 1.5 }}>{lastMessage}</div>
      </div>
    </div>
  );
}