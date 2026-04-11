import { useEffect, useMemo, useState } from "react";

const SUPABASE_FUNCTION_URL =
  "https://mujwsfhkocsuuahlrssn.supabase.co/functions/v1/accept-tracker-invite";

function readRuntimeSessionFromStorage() {
  try {
    return {
      runtimeToken: localStorage.getItem("tracker_runtime_token") || null,
      trackerUserId: localStorage.getItem("tracker_user_id") || null,
      orgId: localStorage.getItem("org_id") || null,
    };
  } catch {
    return {
      runtimeToken: null,
      trackerUserId: null,
      orgId: null,
    };
  }
}

function clearLegacyTrackerTokens() {
  try {
    localStorage.removeItem("tracker_access_token");
    localStorage.removeItem("tracker_token");
    localStorage.removeItem("owner_token");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("session_token");
  } catch {
    // ignore storage cleanup errors
  }
}

export default function TrackerGpsPage() {
  const [msg, setMsg] = useState("Inicializando tracker...");
  const [runtimeSession, setRuntimeSession] = useState(() =>
    readRuntimeSessionFromStorage(),
  );
  const [acceptingInvite, setAcceptingInvite] = useState(false);

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

    console.log("[TRACKER_STATE_REFRESH]", {
      hasRuntimeToken: !!stored.runtimeToken,
      hasTrackerUserId: !!stored.trackerUserId,
      hasOrgId: !!stored.orgId,
      hasCompleteSession,
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

  async function acceptTrackerInvite(inviteToken, orgId) {
    console.log("[ACCEPT_DEBUG]", {
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      hasAnonKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY,
      orgId,
      inviteTokenExists: !!inviteToken,
    });

    const resp = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        inviteToken,
        org_id: orgId,
      }),
    });

    const raw = await resp.text();
    console.log("[ACCEPT_RESPONSE_RAW]", resp.status, raw);

    if (!resp.ok) {
      throw new Error(`accept_tracker_invite_failed:${resp.status}:${raw}`);
    }

    const data = JSON.parse(raw);
    const runtimeToken =
      data?.session?.access_token ||
      data?.access_token ||
      null;
    const trackerUserId =
      data?.tracker_user_id ||
      data?.user_id ||
      null;

    if (!runtimeToken || !trackerUserId || !orgId) {
      throw new Error("missing_runtime_session_data");
    }

    try {
      localStorage.setItem("tracker_runtime_token", runtimeToken);
      localStorage.setItem("tracker_user_id", trackerUserId);
      localStorage.setItem("org_id", orgId);
      clearLegacyTrackerTokens();
    } catch (e) {
      console.error("[ACCEPT_STORAGE_ERROR]", e);
      throw e;
    }

    const nextSession = {
      runtimeToken,
      trackerUserId,
      orgId,
    };

    setRuntimeSession(nextSession);

    if (window.Android?.setTrackerSession) {
      try {
        window.Android.setTrackerSession(runtimeToken, trackerUserId, orgId);
      } catch (e) {
        console.error("[ANDROID_SET_TRACKER_SESSION_ERROR]", e);
      }
    }

    if (window.Android?.saveSession) {
      try {
        window.Android.saveSession(runtimeToken, orgId);
      } catch (e) {
        console.error("[ANDROID_SAVE_SESSION_ERROR]", e);
      }
    }

    return nextSession;
  }

  useEffect(() => {
    let cancelled = false;

    refreshRuntimeSessionState("Esperando invitación o sesión runtime...");

    async function runAcceptFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const inviteToken =
        params.get("inviteToken") ||
        params.get("invite_token") ||
        params.get("t");
      const orgId = params.get("org_id") || params.get("orgId");

      console.log("[ACCEPT_URL_PARAMS]", {
        href: window.location.href,
        inviteTokenExists: !!inviteToken,
        orgId,
      });

      if (!inviteToken || !orgId) {
        return;
      }

      const alreadyAccepted = sessionStorage.getItem(
        `accept_tracker_invite_done:${inviteToken}`,
      );
      if (alreadyAccepted) {
        console.log("[ACCEPT_SKIP] already processed");
        if (!cancelled) {
          const stored = refreshRuntimeSessionState(
            "Esperando sesión runtime válida...",
          );
          if (stored.runtimeToken && stored.trackerUserId && stored.orgId) {
            setMsg("Tracker listo");
          }
        }
        return;
      }

      setAcceptingInvite(true);
      setMsg("Aceptando invitación...");

      const acceptedSession = await acceptTrackerInvite(inviteToken, orgId);
      if (cancelled) return;

      sessionStorage.setItem(
        `accept_tracker_invite_done:${inviteToken}`,
        "1",
      );

      console.log("[ACCEPT_DONE]", {
        trackerUserId: acceptedSession.trackerUserId,
        runtimeTokenStored: true,
        orgId: acceptedSession.orgId,
      });

      refreshRuntimeSessionState();
      setMsg("Invitación aceptada. Tracker listo.");
    }

    runAcceptFromUrl()
      .catch((err) => {
        console.error("[ACCEPT_FATAL]", err);
        if (!cancelled) {
          setMsg(`ERROR ACCEPT ${err?.message || "?"}`);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAcceptingInvite(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    console.log("[TRACKER_SESSION_STATE]", {
      hasRuntimeToken: !!runtimeSession.runtimeToken,
      hasTrackerUserId: !!runtimeSession.trackerUserId,
      hasOrgId: !!runtimeSession.orgId,
      ready,
      acceptingInvite,
    });
  }, [runtimeSession, ready, acceptingInvite]);

  useEffect(() => {
    if (!ready) return;

    console.log("[TRACKER_STEP] bridge effect start");

    try {
      console.log("[TRACKER_SESSION_SEND]", {
        tokenPresent: true,
        trackerUserIdPresent: true,
        orgIdPresent: true,
        androidSetTrackerSession: !!window?.Android?.setTrackerSession,
        androidSaveSession: !!window?.Android?.saveSession,
      });

      if (window?.Android?.setTrackerSession) {
        window.Android.setTrackerSession(
          runtimeSession.runtimeToken,
          runtimeSession.trackerUserId,
          runtimeSession.orgId,
        );
      }

      if (window?.Android?.saveSession) {
        window.Android.saveSession(
          runtimeSession.runtimeToken,
          runtimeSession.orgId,
        );
      }
    } catch (e) {
      console.error("[TRACKER_SESSION_SEND] error", e);
    }
  }, [ready, runtimeSession]);

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
        console.error(
          "[SEND_POSITION_BLOCKED] missing runtime session or coordinates",
          {
            hasToken: !!token,
            hasOrg: !!org,
            hasTrackerUserId: !!trackerUserId,
            lat,
            lng,
          },
        );
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

      console.log("[SEND_POSITION_STEP] request started", body);

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

          console.log("[SEND_POSITION_STEP] status", res.status);
          console.log("[SEND_POSITION_STEP] ok", res.ok);
          console.log("[SEND_POSITION_STEP] response", data);

          if (!res.ok) {
            throw new Error(data?.error || res.statusText);
          }

          setMsg("OK ✔");
        })
        .catch((err) => {
          console.error("[SEND_POSITION_STEP] error", err);
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

          <div style={{ fontSize: 15, marginBottom: 8 }}>
            {acceptingInvite ? "Aceptando invitación..." : msg}
          </div>

          <div style={{ fontSize: 13, opacity: 0.75 }}>
            Token runtime: <b>{runtimeSession.runtimeToken ? "sí" : "no"}</b> ·
            {" "}Tracker user: <b>{runtimeSession.trackerUserId ? "sí" : "no"}</b> ·
            {" "}Org: <b>{runtimeSession.orgId ? "sí" : "no"}</b>
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
