import { useEffect, useMemo, useState } from "react";

function decodeJwtSub(token) {
  try {
    if (!token) return null;

    const payload = token.split(".")[1];
    if (!payload) return null;

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded));

    return decoded?.sub || null;
  } catch {
    return null;
  }
}

function readRuntimeSessionFromStorage() {
  try {
    const authRaw = localStorage.getItem("geocercas-tracker-auth");
    let authParsed = null;

    if (authRaw) {
      try {
        authParsed = JSON.parse(authRaw);
      } catch {
        authParsed = null;
      }
    }

    const runtimeToken =
      localStorage.getItem("tracker_runtime_token") ||
      localStorage.getItem("tracker_access_token") ||
      authParsed?.access_token ||
      null;

    let trackerUserId = localStorage.getItem("tracker_user_id") || null;
    if (!trackerUserId && runtimeToken) {
      trackerUserId = decodeJwtSub(runtimeToken);
    }

    const orgId =
      localStorage.getItem("org_id") ||
      localStorage.getItem("tracker_org_id") ||
      authParsed?.org_id ||
      null;

    return { runtimeToken, trackerUserId, orgId };
  } catch {
    return { runtimeToken: null, trackerUserId: null, orgId: null };
  }
}

export default function TrackerGpsPage() {
  const [msg, setMsg] = useState("Inicializando tracker...");
  const [runtimeSession, setRuntimeSession] = useState(() =>
    readRuntimeSessionFromStorage(),
  );

  const ready = useMemo(
    () =>
      Boolean(
        runtimeSession.runtimeToken &&
          runtimeSession.trackerUserId &&
          runtimeSession.orgId,
      ),
    [runtimeSession],
  );

  function refreshRuntimeSessionState(nextMsgWhenMissing = null) {
    const stored = readRuntimeSessionFromStorage();
    setRuntimeSession(stored);

    const hasCompleteSession = Boolean(
      stored.runtimeToken && stored.trackerUserId && stored.orgId,
    );

    console.log("[TRACKER_SESSION_STATE]", {
      hasRuntimeToken: !!stored.runtimeToken,
      hasTrackerUserId: !!stored.trackerUserId,
      hasOrgId: !!stored.orgId,
      ready: hasCompleteSession,
    });

    if (hasCompleteSession) {
      setMsg((prev) =>
        prev?.startsWith("ERROR") || prev?.startsWith("GEO_ERROR")
          ? prev
          : "Tracker listo",
      );
    } else if (nextMsgWhenMissing) {
      setMsg(nextMsgWhenMissing);
    }

    return stored;
  }

  useEffect(() => {
    refreshRuntimeSessionState("Esperando sesión runtime válida...");
  }, []);

  useEffect(() => {
    if (ready) return;

    let cancelled = false;

    const poll = () => {
      if (cancelled) return;

      const stored = readRuntimeSessionFromStorage();
      const hasSession =
        stored.runtimeToken && stored.trackerUserId && stored.orgId;

      if (hasSession) {
        console.log("[TRACKER_POLL] session detected");
        setRuntimeSession(stored);
        setMsg("Tracker listo");
        return;
      }

      console.log("[TRACKER_POLL] waiting for session...");
      window.setTimeout(poll, 1000);
    };

    poll();

    return () => {
      cancelled = true;
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;

    let watchId = null;
    let disposed = false;

    function handlePosition(pos) {
      if (disposed) return;

      const token = runtimeSession.runtimeToken;
      const org = runtimeSession.orgId;
      const trackerUserId = runtimeSession.trackerUserId;

      const lat = pos?.coords?.latitude;
      const lng = pos?.coords?.longitude;
      const accuracy = pos?.coords?.accuracy;
      const timestamp = new Date().toISOString();

      if (lat == null || lng == null || !token || !org || !trackerUserId) {
        console.error("[SEND_POSITION_BLOCKED] missing runtime session or coordinates", {
          hasToken: !!token,
          hasOrg: !!org,
          hasTrackerUserId: !!trackerUserId,
          lat,
          lng,
        });
        return;
      }

      const body = {
        org_id: org,
        lat,
        lng,
        accuracy,
        timestamp,
        tracker_user_id: trackerUserId,
      };

      fetch("/api/send-position", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
        .then(async (res) => {
          let data = null;
          try {
            data = await res.json();
          } catch {
            data = null;
          }

          if (!res.ok) {
            throw new Error(data?.error || res.statusText);
          }

          setMsg("OK ✔");
        })
        .catch((err) => {
          setMsg("ERROR " + (err?.message || "?"));
        });
    }

    function handleError(err) {
      if (disposed) return;
      setMsg("GEO_ERROR " + (err?.message || err?.code || "?"));
    }

    if (navigator?.geolocation) {
      watchId = navigator.geolocation.watchPosition(handlePosition, handleError, {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 20000,
      });
    } else {
      setMsg("Geolocation API not available");
    }

    return () => {
      disposed = true;
      if (watchId != null && navigator?.geolocation?.clearWatch) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
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
            El tracking está funcionando correctamente.
            <br />
            Último estado: <b>{msg}</b>
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
