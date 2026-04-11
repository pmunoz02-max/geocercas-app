import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const SUPABASE_FUNCTION_URL =
  "https://mujwsfhkocsuuahlrssn.supabase.co/functions/v1/accept-tracker-invite";

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
      authParsed?.org_id ||
      null;

    return { runtimeToken, trackerUserId, orgId };
  } catch {
    return { runtimeToken: null, trackerUserId: null, orgId: null };
  }
}

function clearLegacyTrackerTokens() {
  try {
    localStorage.removeItem("tracker_token");
    localStorage.removeItem("owner_token");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("session_token");
  } catch {
    // ignore
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

    console.log("[TRACKER_SESSION_STATE]", {
      runtimeToken: stored.runtimeToken,
      trackerUserId: stored.trackerUserId,
      orgId: stored.orgId,
      ready: hasCompleteSession,
      acceptingInvite,
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

  async function acceptTrackerInvite(inviteToken, orgId, lang) {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    console.log("[ACCEPT_DEBUG]", {
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      hasAccessToken: !!accessToken,
      hasAnonKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY,
      sessionError: sessionError?.message ?? null,
      orgId,
      inviteTokenExists: !!inviteToken,
    });

    if (!accessToken) {
      throw new Error("missing_owner_session_access_token");
    }

    const resp = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
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
      data?.runtimeToken ||
      data?.tracker_runtime_token ||
      data?.token ||
      null;

    let trackerUserId =
      data?.tracker_user_id ||
      data?.trackerUserId ||
      data?.user_id ||
      data?.user?.id ||
      data?.session?.user?.id ||
      null;

    if (!trackerUserId && runtimeToken) {
      trackerUserId = decodeJwtSub(runtimeToken);
    }

    console.log("[ACCEPT_PARSED]", {
      runtimeToken,
      trackerUserId,
      orgId,
      raw: data,
    });

    if (!runtimeToken || !trackerUserId || !orgId) {
      throw new Error("missing_runtime_session_data");
    }

    localStorage.setItem(
      "geocercas-tracker-auth",
      JSON.stringify({
        access_token: runtimeToken,
        org_id: orgId,
      }),
    );
    localStorage.setItem("tracker_access_token", runtimeToken);
    localStorage.setItem("tracker_runtime_token", runtimeToken);
    localStorage.setItem("tracker_user_id", trackerUserId);
    localStorage.setItem("org_id", orgId);
    clearLegacyTrackerTokens();

    console.log("[ACCEPT_LOCALSTORAGE_WRITTEN]", {
      geocercasTrackerAuthExists: !!localStorage.getItem("geocercas-tracker-auth"),
      trackerAccessTokenExists: !!localStorage.getItem("tracker_access_token"),
      trackerRuntimeTokenExists: !!localStorage.getItem("tracker_runtime_token"),
      trackerUserId: localStorage.getItem("tracker_user_id"),
      orgId: localStorage.getItem("org_id"),
    });

    const nextSession = { runtimeToken, trackerUserId, orgId };
    setRuntimeSession(nextSession);

    try {
      if (window.Android?.setTrackerSession) {
        window.Android.setTrackerSession(runtimeToken, trackerUserId, orgId);
      }
      if (window.Android?.saveSession) {
        window.Android.saveSession(runtimeToken, orgId);
      }
    } catch (e) {
      console.error("[TRACKER_SESSION_SEND] error", e);
    }

    const nextUrl = `/tracker-gps?org_id=${encodeURIComponent(orgId)}&lang=${encodeURIComponent(lang || "es")}`;
    console.log("[ACCEPT_REDIRECT_TRACKER_GPS]", { nextUrl });
    window.location.href = nextUrl;

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
      const lang = params.get("lang") || "es";

      console.log("[ACCEPT_URL_PARAMS]", {
        href: window.location.href,
        inviteTokenExists: !!inviteToken,
        orgId,
        lang,
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
          refreshRuntimeSessionState("Esperando sesión runtime válida...");
        }
        return;
      }

      setAcceptingInvite(true);
      setMsg("Aceptando invitación...");

      await acceptTrackerInvite(inviteToken, orgId, lang);
      if (cancelled) return;

      sessionStorage.setItem(`accept_tracker_invite_done:${inviteToken}`, "1");
      console.log("[ACCEPT_DONE]", { orgId });
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
        <div style={{ width: "100%", maxWidth: 760, border: "1px solid #d0d7de", borderRadius: 12, padding: 20, background: "#f8f9fb", marginTop: 24, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            Inicializando tracker...
          </div>

          <div style={{ fontSize: 15, marginBottom: 8 }}>
            {acceptingInvite ? "Aceptando invitación..." : msg}
          </div>

          <div style={{ fontSize: 13, opacity: 0.75 }}>
            Token runtime: <b>{runtimeSession.runtimeToken ? "sí" : "no"}</b> ·{" "}
            Tracker user: <b>{runtimeSession.trackerUserId ? "sí" : "no"}</b> ·{" "}
            Org: <b>{runtimeSession.orgId ? "sí" : "no"}</b>
          </div>
        </div>
      ) : (
        <div style={{ width: "100%", maxWidth: 760, border: "1px solid #d0d7de", borderRadius: 12, padding: 20, background: "#f8f9fb", marginTop: 24, textAlign: "center" }}>
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
            onClick={() => refreshRuntimeSessionState("Esperando sesión runtime válida...")}
            style={{ border: "none", borderRadius: 10, padding: "12px 16px", fontSize: 15, fontWeight: 600, cursor: "pointer", background: "#222", color: "#fff", marginTop: 12 }}
          >
            Refrescar estado
          </button>
        </div>
      )}
    </div>
  );
}