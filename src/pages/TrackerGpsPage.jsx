import { useEffect, useMemo, useRef, useState } from "react";

function getStorageItem(key) {
  try {
    const localValue = localStorage.getItem(key);
    if (localValue) return localValue;

    const sessionValue = sessionStorage.getItem(key);
    if (sessionValue) return sessionValue;

    return null;
  } catch {
    return null;
  }
}

function setStorageItem(key, value) {
  try {
    if (value == null || value === "") return;
    localStorage.setItem(key, value);
    sessionStorage.setItem(key, value);
  } catch {
    // no-op
  }
}

function readRuntimeSessionFromStorage() {
  try {
    const runtimeToken =
      getStorageItem("tracker_runtime_token") ||
      getStorageItem("tracker_access_token") ||
      (typeof window !== "undefined" ? window.runtimeInviteToken || null : null);

    const trackerUserId =
      getStorageItem("tracker_user_id") ||
      getStorageItem("user_id") ||
      (typeof window !== "undefined" ? window.trackerUserId || null : null);

    const orgId =
      getStorageItem("tracker_org_id") ||
      getStorageItem("org_id") ||
      (typeof window !== "undefined" ? window.orgId || null : null);

    return {
      runtimeToken: runtimeToken || null,
      trackerUserId: trackerUserId || null,
      orgId: orgId || null,
    };
  } catch {
    return { runtimeToken: null, trackerUserId: null, orgId: null };
  }
}

function syncRuntimeSession(session) {
  try {
    const runtimeToken = session?.runtimeToken || null;
    const trackerUserId = session?.trackerUserId || null;
    const orgId = session?.orgId || null;

    if (runtimeToken) {
      setStorageItem("tracker_runtime_token", runtimeToken);
      setStorageItem("tracker_access_token", runtimeToken);
      if (typeof window !== "undefined") {
        window.runtimeInviteToken = runtimeToken;
      }
    }

    if (trackerUserId) {
      setStorageItem("tracker_user_id", trackerUserId);
      setStorageItem("user_id", trackerUserId);
      if (typeof window !== "undefined") {
        window.trackerUserId = trackerUserId;
      }
    }

    if (orgId) {
      setStorageItem("tracker_org_id", orgId);
      setStorageItem("org_id", orgId);
      if (typeof window !== "undefined") {
        window.orgId = orgId;
      }
    }
  } catch {
    // no-op
  }
}

export default function TrackerGpsPage() {
  const [msg, setMsg] = useState("Inicializando tracker...");
  const [runtimeSession, setRuntimeSession] = useState(() => {
    const initial = readRuntimeSessionFromStorage();
    syncRuntimeSession(initial);
    return initial;
  });

  const [debugInfo, setDebugInfo] = useState(() => ({
    hasRuntimeToken: false,
    hasTrackerUserId: false,
    hasOrgId: false,
    nativeMode: true,
    lastCheckAt: null,
    lastError: null,
  }));

  const bootstrapTimerRef = useRef(null);
  const pollTimerRef = useRef(null);
  const disposedRef = useRef(false);

  const ready = useMemo(() => {
    return Boolean(
      runtimeSession.runtimeToken &&
        runtimeSession.trackerUserId &&
        runtimeSession.orgId,
    );
  }, [runtimeSession]);

  function refreshRuntimeSessionState(nextMsgWhenMissing = null) {
    const stored = readRuntimeSessionFromStorage();
    syncRuntimeSession(stored);
    setRuntimeSession(stored);

    const hasCompleteSession = Boolean(
      stored.runtimeToken && stored.trackerUserId && stored.orgId,
    );

    setDebugInfo((prev) => ({
      ...prev,
      hasRuntimeToken: !!stored.runtimeToken,
      hasTrackerUserId: !!stored.trackerUserId,
      hasOrgId: !!stored.orgId,
      nativeMode: true,
      lastCheckAt: new Date().toISOString(),
    }));

    console.log("[TRACKER_SESSION_STATE]", {
      hasRuntimeToken: !!stored.runtimeToken,
      hasTrackerUserId: !!stored.trackerUserId,
      hasOrgId: !!stored.orgId,
      ready: hasCompleteSession,
      nativeMode: true,
    });

    if (hasCompleteSession) {
      setMsg("Tracker activo (modo nativo)");
    } else if (nextMsgWhenMissing) {
      setMsg(nextMsgWhenMissing);
    }

    return stored;
  }

  useEffect(() => {
    disposedRef.current = false;

    const stored = refreshRuntimeSessionState("Esperando sesión runtime válida...");

    if (!stored.runtimeToken || !stored.trackerUserId || !stored.orgId) {
      bootstrapTimerRef.current = window.setTimeout(() => {
        if (disposedRef.current) return;
        const latest = refreshRuntimeSessionState(
          "Esperando sesión runtime válida...",
        );

        if (!latest.runtimeToken || !latest.trackerUserId || !latest.orgId) {
          setMsg("Esperando sesión runtime válida...");
        }
      }, 300);
    }

    return () => {
      disposedRef.current = true;

      if (bootstrapTimerRef.current) {
        window.clearTimeout(bootstrapTimerRef.current);
        bootstrapTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (ready) return;

    let cancelled = false;

    const poll = () => {
      if (cancelled || disposedRef.current) return;

      const stored = readRuntimeSessionFromStorage();
      const hasSession =
        !!stored.runtimeToken && !!stored.trackerUserId && !!stored.orgId;

      if (hasSession) {
        console.log("[TRACKER_POLL] runtime session detected");
        syncRuntimeSession(stored);
        setRuntimeSession(stored);
        setMsg("Tracker activo (modo nativo)");
        setDebugInfo((prev) => ({
          ...prev,
          hasRuntimeToken: true,
          hasTrackerUserId: true,
          hasOrgId: true,
          nativeMode: true,
          lastCheckAt: new Date().toISOString(),
          lastError: null,
        }));
        return;
      }

      console.log("[TRACKER_POLL] waiting for runtime session...");
      pollTimerRef.current = window.setTimeout(poll, 1000);
    };

    poll();

    return () => {
      cancelled = true;
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (disposedRef.current) return;

    console.log("[TRACKER] JS tracking disabled, using native service only");

    try {
      const bridge = typeof window !== "undefined" ? window.AndroidBridge : null;

      console.log("[TRACKER] bridge exists?", {
        hasAndroidBridge: !!bridge,
        bridgeType: typeof bridge,
        hasSaveTrackerSession: !!bridge?.saveTrackerSession,
        hasRequestStartTracking: !!bridge?.requestStartTracking,
      });

      if (bridge?.saveTrackerSession) {
        console.log("[TRACKER] calling AndroidBridge.saveTrackerSession");
        bridge.saveTrackerSession(
          runtimeSession.runtimeToken,
          runtimeSession.trackerUserId,
          runtimeSession.orgId,
        );
      } else {
        console.warn("[TRACKER] AndroidBridge.saveTrackerSession not available");
      }

      if (bridge?.requestStartTracking) {
        console.log("[TRACKER] calling AndroidBridge.requestStartTracking");
        bridge.requestStartTracking();
      } else {
        console.warn("[TRACKER] AndroidBridge.requestStartTracking not available");
      }

      setMsg("Tracker activo (modo nativo)");
      setDebugInfo((prev) => ({
        ...prev,
        hasRuntimeToken: true,
        hasTrackerUserId: true,
        hasOrgId: true,
        nativeMode: true,
        lastCheckAt: new Date().toISOString(),
        lastError: null,
      }));
    } catch (err) {
      console.error("[TRACKER] native bootstrap failed", err);
      setDebugInfo((prev) => ({
        ...prev,
        lastError: String(err?.message || err || "native bootstrap failed"),
        lastCheckAt: new Date().toISOString(),
      }));
    }
  }, [ready, runtimeSession]);

  return (
    <div style={{ padding: 16 }}>
      {!ready ? (
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
            Inicializando tracker...
          </div>

          <div style={{ fontSize: 15, marginBottom: 8 }}>{msg}</div>

          <div style={{ fontSize: 13, opacity: 0.75 }}>
            Token runtime: <b>{runtimeSession.runtimeToken ? "sí" : "no"}</b> ·{" "}
            Tracker user: <b>{runtimeSession.trackerUserId ? "sí" : "no"}</b> ·{" "}
            Org: <b>{runtimeSession.orgId ? "sí" : "no"}</b>
          </div>
        </div>
      ) : (
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
            El tracking depende del servicio nativo Android.
            <br />
            Último estado: <b>{msg}</b>
          </div>

          <div style={{ fontSize: 13, opacity: 0.8, marginTop: 12 }}>
            Modo: <b>nativo</b>
            <br />
            Última verificación:{" "}
            <b>{debugInfo.lastCheckAt ? debugInfo.lastCheckAt : "sin verificar aún"}</b>
            <br />
            Token runtime: <b>{debugInfo.hasRuntimeToken ? "OK" : "faltante"}</b>
            <br />
            Tracker user: <b>{debugInfo.hasTrackerUserId ? "OK" : "faltante"}</b>
            <br />
            Org: <b>{debugInfo.hasOrgId ? "OK" : "faltante"}</b>
            <br />
            Último error: <b>{debugInfo.lastError || "ninguno"}</b>
          </div>

          <button
            type="button"
            onClick={() =>
              refreshRuntimeSessionState("Esperando sesión runtime válida...")
            }
            style={{
              border: "none",
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              background: "#222",
              color: "#fff",
              marginTop: 12,
            }}
          >
            Refrescar estado
          </button>
        </div>
      )}
    </div>
  );
}