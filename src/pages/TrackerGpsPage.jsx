// src/pages/TrackerGpsPage.jsx
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function getSupabaseUrl() {
  return (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
}

function resolveOrgId(sess) {
  return (
    sess?.org_id ||
    sess?.current_org_id ||
    sess?.org?.id ||
    sess?.organizations?.[0]?.id ||
    null
  );
}

function resolveEmail(sess) {
  return (
    sess?.user?.email ||
    sess?.email ||
    sess?.profile?.email ||
    ""
  );
}

function getAccessTokenFromLocalStorage() {
  try {
    const keys = Object.keys(window.localStorage || {});
    const k = keys.find((x) => /^sb-.*-auth-token$/i.test(String(x)));
    if (!k) return "";
    const raw = window.localStorage.getItem(k);
    if (!raw) return "";
    const j = JSON.parse(raw);
    return (
      j?.access_token ||
      j?.currentSession?.access_token ||
      j?.data?.session?.access_token ||
      ""
    );
  } catch {
    return "";
  }
}

async function getAccessTokenBestEffort() {
  const ls = getAccessTokenFromLocalStorage();
  if (ls) return ls;

  // fallback: supabase session (cuando el storage no está listo aún)
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || "";
  } catch {
    return "";
  }
}

export default function TrackerGpsPage() {
  const [loading, setLoading] = useState(true);
  const [sessionApi, setSessionApi] = useState(null);
  const [error, setError] = useState(null);

  const [permission, setPermission] = useState("unknown");
  const [gpsActive, setGpsActive] = useState(false);

  const [lastPosition, setLastPosition] = useState(null);
  const [lastSend, setLastSend] = useState(null);
  const [sendStatus, setSendStatus] = useState("idle");
  const [sendError, setSendError] = useState(null);

  const [intervalSec, setIntervalSec] = useState(30);

  // gating
  const [canSend, setCanSend] = useState(false);
  const [gateMsg, setGateMsg] = useState("Esperando asignación…");
  const [gateInfo, setGateInfo] = useState(null);

  const lastSentAtRef = useRef(0);
  const watchIdRef = useRef(null);
  const gatePollRef = useRef(null);

  async function loadSessionApi() {
    const res = await fetch("/api/auth/session", { credentials: "include" });
    const json = await res.json().catch(() => ({}));
    setSessionApi(json);

    if (!json?.authenticated) throw new Error("No autenticado");
    const role = String(json?.role || "").toLowerCase();
    if (role !== "tracker") throw new Error(`Rol inválido para tracker-gps: ${role || "(vacío)"}`);
    return json;
  }

  async function loadIntervalFromPersonal(org_id, email) {
    try {
      const token = await getAccessTokenBestEffort();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const url = `/api/personal?onlyActive=1&limit=50&org_id=${encodeURIComponent(org_id)}&q=${encodeURIComponent(email)}`;
      const res = await fetch(url, { headers });
      const j = await res.json().catch(() => ({}));
      const items = j?.items || j?.data || [];

      const found = Array.isArray(items)
        ? items.find((p) => String(p.email_norm || p.email || "").toLowerCase() === String(email).toLowerCase())
        : null;

      const sec = Number(found?.position_interval_sec);
      if (Number.isFinite(sec) && sec > 0) setIntervalSec(sec);
    } catch {
      // ignore
    }
  }

  async function refreshGate(orgId) {
    try {
      // ✅ RPC: tracker_can_send() basado en tracker_assignments
      const { data, error } = await supabase.rpc("tracker_can_send", { p_org_id: orgId });

      if (error) {
        setCanSend(false);
        setGateMsg(`Gate error: ${error.message || "rpc_error"}`);
        setGateInfo(null);
        return;
      }

      const ok = !!data?.can_send;
      setCanSend(ok);
      setGateInfo(data || null);

      if (!ok) {
        setGateMsg(data?.reason || "Esperando asignación…");
      } else {
        const sec = Number(data?.frequency_sec);
        if (Number.isFinite(sec) && sec > 0) setIntervalSec(sec);
        setGateMsg("Asignación activa ✅ (enviando según frecuencia)");
      }
    } catch (e) {
      setCanSend(false);
      setGateMsg(`Gate exception: ${e?.message || "exception"}`);
      setGateInfo(null);
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const s = await loadSessionApi();
        if (!alive) return;

        setLoading(false);

        if ("permissions" in navigator) {
          try {
            const p = await navigator.permissions.query({ name: "geolocation" });
            if (!alive) return;
            setPermission(p.state);
          } catch {
            setPermission("unknown");
          }
        }

        const orgId = resolveOrgId(s);
        const email = resolveEmail(s);

        if (orgId) {
          await refreshGate(orgId);
          gatePollRef.current = setInterval(() => refreshGate(orgId), 15000);
        }

        if (orgId && email) loadIntervalFromPersonal(orgId, email);
      } catch (e) {
        if (!alive) return;
        setError(e.message || "Error cargando sesión");
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
      if (gatePollRef.current) clearInterval(gatePollRef.current);
    };
  }, []);

  async function sendPosition(pos, org_id) {
    // 1) gating
    if (!canSend) return;

    // 2) throttle
    const now = Date.now();
    const minMs = Math.max(5, Number(intervalSec || 30)) * 1000;
    if (now - lastSentAtRef.current < minMs) return;
    lastSentAtRef.current = now;

    const token = await getAccessTokenBestEffort();
    if (!token) {
      setSendStatus("error");
      setSendError("No access_token. El tracker debe entrar por el magic link de invitación.");
      return;
    }

    const supabaseUrl = getSupabaseUrl();
    const url = `${supabaseUrl}/functions/v1/send_position`;

    const payload = {
      org_id,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      heading: pos.coords.heading ?? null,
      speed: pos.coords.speed ?? null,
      altitude: pos.coords.altitude ?? null,
      ts: new Date().toISOString(),
      source: "tracker-gps",
      // opcional (si tu edge lo usa):
      geofence_id: gateInfo?.geofence_id ?? null,
      assignment_id: gateInfo?.assignment_id ?? null,
    };

    setSendStatus("sending");
    setSendError(null);

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const j = await r.json().catch(() => ({}));

    if (!r.ok || !j?.ok) {
      setSendStatus("error");
      setSendError(j?.error || j?.details || "Error enviando posición");
      return;
    }

    setSendStatus("ok");
    setLastSend({ ts: payload.ts, table: j.table });
  }

  function startTracking() {
    if (!("geolocation" in navigator)) {
      setError("Este dispositivo no soporta GPS.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async () => {
        setPermission("granted");

        const orgId = resolveOrgId(sessionApi);
        if (!orgId) {
          setError("org_id no disponible en sesión (usa current_org_id).");
          return;
        }

        // refresh gate al momento de activar
        await refreshGate(orgId);

        watchIdRef.current = navigator.geolocation.watchPosition(
          async (pos) => {
            setGpsActive(true);

            const current = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              ts: new Date().toISOString(),
            };
            setLastPosition(current);

            await sendPosition(pos, orgId);
          },
          (err) => {
            setGpsActive(false);
            setError(err.message || "Error obteniendo ubicación");
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        );
      },
      () => {
        setPermission("denied");
        setError("Permiso de ubicación denegado.");
      }
    );
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-600">Cargando tracker…</div>;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full bg-white border rounded-xl p-6 shadow">
          <h2 className="text-lg font-semibold text-red-600 mb-3">Acceso restringido</h2>
          <p className="text-sm text-gray-700 mb-4">{error}</p>
          <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto">
{JSON.stringify(sessionApi, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 max-w-md w-full">
        <h1 className="text-lg font-semibold text-emerald-700">Tracker activo</h1>

        <p className="text-sm text-emerald-700 mt-2">
          Estado del GPS:{" "}
          <b>{permission === "granted" ? "Permitido" : permission === "denied" ? "Bloqueado" : "Pendiente"}</b>
        </p>

        <p className="text-xs text-emerald-800 mt-1">
          Org: <b>{resolveOrgId(sessionApi) || "—"}</b>
        </p>

        <p className="text-xs text-emerald-800 mt-1">
          Gate: <b>{canSend ? "OK ✅" : "NO"}</b> — {gateMsg}
        </p>

        <p className="text-xs text-emerald-800 mt-1">
          Intervalo de envío: <b>{intervalSec}s</b>
        </p>

        {!gpsActive && (
          <button onClick={startTracking} className="mt-4 w-full bg-emerald-600 text-white py-3 rounded-lg">
            Activar ubicación
          </button>
        )}

        {gpsActive && lastPosition && (
          <div className="mt-4 text-sm text-emerald-800">
            <div>📡 GPS activo</div>
            <div>Lat: {lastPosition.lat}</div>
            <div>Lng: {lastPosition.lng}</div>
            <div>Última lectura: {lastPosition.ts}</div>

            <div className="mt-2">
              Envío:{" "}
              <b>
                {sendStatus === "idle"
                  ? "—"
                  : sendStatus === "sending"
                  ? "Enviando…"
                  : sendStatus === "ok"
                  ? "OK"
                  : "Error"}
              </b>
            </div>

            {lastSend?.ts && (
              <div className="text-xs">
                Último envío: {lastSend.ts} (tabla: {lastSend.table})
              </div>
            )}

            {sendError && <div className="text-xs text-red-700 mt-1">{sendError}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
