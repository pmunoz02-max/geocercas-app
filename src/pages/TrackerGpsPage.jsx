import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

function getAndroidBridge() {
  if (typeof window === "undefined") return null;
  if (!window.Android) return null;
  return window.Android;
}

export default function TrackerGpsPage() {
  const [buildMarker] = useState("2026-04-05-passive-status");
  const [bridgeReady, setBridgeReady] = useState(false);
  const [orgId, setOrgId] = useState(null);
  const [assignmentState, setAssignmentState] = useState({
    loading: true,
    error: null,
    active: false,
    reason: "loading",
    assignment: null,
  });
  const [healthState, setHealthState] = useState({
    loading: true,
    error: null,
    row: null,
  });
  const [lastMessage, setLastMessage] = useState("Sincronizando estado con backend...");
  const [lastSyncAt, setLastSyncAt] = useState(null);

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

  const markMessage = useCallback((message) => {
    setLastMessage(message);
    setLastSyncAt(new Date().toLocaleTimeString());
  }, []);

  const refreshBridgeState = useCallback(() => {
    const bridge = getAndroidBridge();
    const ready = !!bridge;
    setBridgeReady(ready);
    return bridge;
  }, []);

  const resolveOrgId = useCallback(async () => {
    const localOrg = localStorage.getItem("org_id");
    if (localOrg) return localOrg;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return null;

    const { data: membership } = await supabase
      .from("memberships")
      .select("org_id, is_default, revoked_at")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    const resolvedOrgId = membership?.org_id || null;
    if (resolvedOrgId) {
      localStorage.setItem("org_id", resolvedOrgId);
    }
    return resolvedOrgId;
  }, []);

  const mapHealthState = useCallback((status) => {
    const v = String(status || "").toLowerCase();
    if (v === "active") return "active";
    if (v === "stale") return "stale";
    if (v === "restricted") return "restricted";
    if (v === "pending_permissions") return "pending_permissions";
    return "offline";
  }, []);

  const syncPassiveState = useCallback(async () => {
    try {
      refreshBridgeState();

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || null;
      const trackerUserId = session?.user?.id || null;

      if (!token || !trackerUserId) {
        setAssignmentState({
          loading: false,
          error: "no_session",
          active: false,
          reason: "no_session",
          assignment: null,
        });
        setHealthState({ loading: false, error: "no_session", row: null });
        markMessage("No hay sesión activa para consultar estado del tracker.");
        return;
      }

      const resolvedOrgId = await resolveOrgId();
      setOrgId(resolvedOrgId);

      if (!resolvedOrgId) {
        setAssignmentState({
          loading: false,
          error: "missing_org",
          active: false,
          reason: "missing_org",
          assignment: null,
        });
        setHealthState({ loading: false, error: "missing_org", row: null });
        markMessage("No se pudo resolver org_id para consultar asignación/health.");
        return;
      }

      const assignmentRes = await fetch("/api/tracker-active-assignment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ org_id: resolvedOrgId }),
      });

      const assignmentJson = await assignmentRes.json().catch(() => ({}));
      if (!assignmentRes.ok || !assignmentJson?.ok) {
        setAssignmentState({
          loading: false,
          error: assignmentJson?.error || "assignment_error",
          active: false,
          reason: assignmentJson?.reason || "assignment_error",
          assignment: null,
        });
      } else {
        setAssignmentState({
          loading: false,
          error: null,
          active: !!assignmentJson.active,
          reason: assignmentJson.reason || (assignmentJson.active ? "active" : "inactive"),
          assignment: assignmentJson.assignment || null,
        });
      }

      await supabase.rpc("rpc_refresh_tracker_health", { p_org_id: resolvedOrgId });
      const statusRes = await supabase.rpc("rpc_tracker_dashboard_status", {
        p_org_id: resolvedOrgId,
      });

      if (statusRes.error) {
        setHealthState({ loading: false, error: statusRes.error.message, row: null });
      } else {
        const rows = Array.isArray(statusRes.data) ? statusRes.data : [];
        const ownRow =
          rows.find(
            (row) => String(row?.tracker_user_id || row?.user_id || "") === String(trackerUserId)
          ) || null;

        if (!ownRow) {
          setHealthState({ loading: false, error: "health_row_not_found", row: null });
        } else {
          setHealthState({
            loading: false,
            error: null,
            row: {
              ...ownRow,
              status: mapHealthState(ownRow?.status),
            },
          });
        }
      }

      markMessage("Estado sincronizado desde assignment + tracker_health.");
    } catch (error) {
      console.error("[TRACKER_PASSIVE] sync failed", error);
      setAssignmentState((prev) => ({
        ...prev,
        loading: false,
        error: prev.error || "sync_failed",
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
    console.log("[TRACKER_BUILD]", buildMarker);
    markMessage(`Build cargado: ${buildMarker}`);
    refreshBridgeState();
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

  const backendState = useMemo(() => {
    if (assignmentState.loading) return "loading";
    if (assignmentState.reason === "no_session") return "missing_session";
    if (assignmentState.reason === "missing_org") return "missing_context";

    const hasValidSessionAndContext =
      assignmentState.reason !== "no_session" &&
      assignmentState.reason !== "missing_org";

    if (!hasValidSessionAndContext) return "missing_context";
    if (assignmentState.error) return "assignment_error";
    if (!assignmentState.active) return "waiting for assignment";

    if (healthState.loading) return "loading";
    return healthState.row?.status || "offline";
  }, [
    assignmentState.active,
    assignmentState.error,
    assignmentState.loading,
    assignmentState.reason,
    healthState.loading,
    healthState.row,
  ]);

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
            <span>{backendState}</span>
          </div>

          <div style={rowStyle}>
            <strong>Asignación activa</strong>
            <span>{assignmentState.active ? "YES" : "NO"}</span>
          </div>

          <div style={rowStyle}>
            <strong>Reason asignación</strong>
            <span>{assignmentState.reason || "-"}</span>
          </div>

          <div style={rowStyle}>
            <strong>Org ID</strong>
            <span>{orgId || "-"}</span>
          </div>

          <div style={rowStyle}>
            <strong>tracker_health.status</strong>
            <span>{healthState.row?.status || "-"}</span>
          </div>

          <div style={rowStyle}>
            <strong>permissions_ok</strong>
            <span>{String(healthState.row?.permissions_ok ?? "-")}</span>
          </div>

          <div style={rowStyle}>
            <strong>background_allowed</strong>
            <span>{String(healthState.row?.background_allowed ?? "-")}</span>
          </div>

          <div style={rowStyle}>
            <strong>service_running</strong>
            <span>{String(healthState.row?.service_running ?? "-")}</span>
          </div>

          <div style={{ ...rowStyle, borderBottom: "none" }}>
            <strong>Última sincronización</strong>
            <span>{lastSyncAt || "-"}</span>
          </div>
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