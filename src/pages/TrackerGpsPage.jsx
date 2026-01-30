// src/pages/TrackerGpsPage.jsx
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const LAST_ORG_KEY = "app_geocercas_last_org_id"; // ✅ key canónica
const LEGACY_TRACKER_ORG_KEY = "tracker_org_id"; // compatibilidad

function getSupabaseUrl() {
  return (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
}

function qp(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// org_id: 1) query param, 2) localStorage (key canónica), 3) legacy localStorage, 4) metadata del usuario
function resolveOrgIdFromSession(session) {
  const fromQuery = qp("org_id");
  if (fromQuery) return fromQuery;

  try {
    const ls = localStorage.getItem(LAST_ORG_KEY);
    if (ls) return ls;

    const legacy = localStorage.getItem(LEGACY_TRACKER_ORG_KEY);
    if (legacy) return legacy;
  } catch {
    // ignore
  }

  const um = session?.user?.user_metadata || {};
  const am = session?.user?.app_metadata || {};

  return (
    um?.org_id ||
    um?.tenant_id ||
    um?.current_org_id ||
    am?.org_id ||
    am?.tenant_id ||
    am?.current_org_id ||
    null
  );
}

function persistOrgId(orgId) {
  if (!orgId) return;
  try {
    localStorage.setItem(LAST_ORG_KEY, orgId);
    localStorage.setItem(LEGACY_TRACKER_ORG_KEY, orgId); // legacy para no romper nada viejo
  } catch {
    // ignore
  }
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

  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || "";
  } catch {
    return "";
  }
}

export default function TrackerGpsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [permission, setPermission] = useState("unknown");
  const [gpsActive, setGpsActive] = useState(false);

  const [session, setSession] = useState(null);
  const [orgId, setOrgId] = useState(null);

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
  const startedRef = useRef(false);

  // ✅ refs para evitar “stale closures”
  const canSendRef = useRef(false);
  const intervalSecRef = useRef(30);
  const gateInfoRef = useRef(null);
  const orgIdRef = useRef(null);

  useEffect(() => {
    canSendRef.current = !!canSend;
  }, [canSend]);

  useEffect(() => {
    intervalSecRef.current = Number(intervalSec || 30);
  }, [intervalSec]);

  useEffect(() => {
    gateInfoRef.current = gateInfo || null;
  }, [gateInfo]);

  useEffect(() => {
    orgIdRef.current = orgId || null;
  }, [orgId]);

  async function refreshGate(currentOrgId) {
    try {
      const { data, error } = await supabase.rpc("tracker_can_send", {
        p_org_id: currentOrgId,
      });

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
        setGateMsg("Asignación activa ✅ (enviando automáticamente)");
      }
    } catch (e) {
      setCanSend(false);
      setGateMsg(`Gate exception: ${e?.message || "exception"}`);
      setGateInfo(null);
    }
  }

  async function sendPosition(pos, currentOrgId) {
    // 1) gating (REF, no state)
    if (!canSendRef.current) return;

    // 2) throttle (REF, no state)
    const now = Date.now();
    const minMs = Math.max(5, Number(intervalSecRef.current || 30)) * 1000;
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

    const gi = gateInfoRef.current;

    const payload = {
      org_id: currentOrgId,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      heading: pos.coords.heading ?? null,
      speed: pos.coords.speed ?? null,
      captured_at: new Date().toISOString(),
      meta: {
        source: "tracker-gps",
        altitude: pos.coords.altitude ?? null,
      },
      geofence_id: gi?.geofence_id ?? null,
      assignment_id: gi?.assignment_id ?? null,
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
    setLastSend({
      ts: payload.captured_at,
      inserted_id: j?.inserted_id ?? null,
      assignment_id: j?.used_assignment_id ?? null,
      geofence_id: j?.used_geofence_id ?? null,
    });
  }

  function startTrackingAuto(currentOrgId) {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!("geolocation" in navigator)) {
      setError("Este dispositivo no soporta GPS.");
      return;
    }

    // intento suave de permisos
    if ("permissions" in navigator) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((p) => setPermission(p.state))
        .catch(() => setPermission("unknown"));
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        setGpsActive(true);

        const current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          ts: new Date().toISOString(),
        };
        setLastPosition(current);

        await sendPosition(pos, currentOrgId);
      },
      (err) => {
        setGpsActive(false);
        setError(err?.message || "Error obteniendo ubicación");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  }

  async function resolveOrgIdFromBackendFallback() {
    // ✅ Si ya corregiste get_my_context para trackers, aquí se resuelve org_id sin URL
    try {
      const { data: ctx, error } = await supabase.rpc("get_my_context");
      if (error) return null;
      const oid = ctx?.org_id ? String(ctx.org_id) : null;
      return oid || null;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const { data, error } = await supabase.auth.getSession();
        if (error) throw new Error(error.message);

        const s = data?.session;
        if (!s) {
          // ✅ Guard definitivo: no iniciar tracker sin sesión
          throw new Error("No autenticado. Abre el link de invitación nuevamente.");
        }

        // 1) Resolver org por URL/LS/metadata
        let o = resolveOrgIdFromSession(s);

        // 2) Si no hay org, resolver por backend (RPC)
        if (!o) {
          o = await resolveOrgIdFromBackendFallback();
        }

        if (!o) {
          throw new Error("org_id no disponible (abre el link de invitación para inicializar la organización).");
        }

        // Persistimos org para siguientes aperturas
        persistOrgId(o);

        if (!alive) return;

        setSession(s);
        setOrgId(o);
        setLoading(false);

        // Gate inmediato + polling
        await refreshGate(o);
        gatePollRef.current = setInterval(() => refreshGate(o), 15000);

        // ✅ Arranque automático del GPS (sin botón)
        startTrackingAuto(o);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || "Error cargando tracker");
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
      if (gatePollRef.current) clearInterval(gatePollRef.current);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      startedRef.current = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600">
        Cargando tracker…
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border rounded-xl p-6 shadow">
          <h2 className="text-lg font-semibold text-red-600 mb-3">Tracker no disponible</h2>
          <p className="text-sm text-gray-700 mb-4">{error}</p>

          <div className="text-xs bg-gray-100 p-3 rounded overflow-auto">
            <div><b>permission:</b> {permission}</div>
            <div><b>orgId:</b> {orgId || "—"}</div>
            <div><b>canSend:</b> {String(canSend)}</div>
            <div><b>gateMsg:</b> {gateMsg}</div>
          </div>

          <button
            className="mt-4 w-full rounded-lg bg-slate-900 py-3 text-white"
            onClick={() => window.location.reload()}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 max-w-md w-full">
        <h1 className="text-lg font-semibold text-emerald-700">Tracker GPS</h1>

        <p className="text-sm text-emerald-700 mt-2">
          GPS: <b>{gpsActive ? "Activo ✅" : "Iniciando…"}</b>
        </p>

        <p className="text-xs text-emerald-800 mt-1">
          Org: <b>{orgId || "—"}</b>
        </p>

        <p className="text-xs text-emerald-800 mt-1">
          Estado: <b>{canSend ? "Enviando ✅" : "En espera…"}</b> — {gateMsg}
        </p>

        <p className="text-xs text-emerald-800 mt-1">
          Frecuencia: <b>{intervalSec}s</b>
        </p>

        {lastPosition && (
          <div className="mt-4 text-sm text-emerald-800">
            <div>Lat: {lastPosition.lat}</div>
            <div>Lng: {lastPosition.lng}</div>
            <div className="text-xs">Última lectura: {lastPosition.ts}</div>

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
                Último envío: {lastSend.ts}
                {lastSend.inserted_id ? ` (id: ${lastSend.inserted_id})` : ""}
              </div>
            )}

            {sendError && <div className="text-xs text-red-700 mt-1">{sendError}</div>}
          </div>
        )}

        <div className="mt-4 text-[11px] text-emerald-900/80">
          Tip: si no hay asignación activa, el tracker queda en espera y empieza a enviar automáticamente cuando se active.
        </div>
      </div>
    </div>
  );
}
