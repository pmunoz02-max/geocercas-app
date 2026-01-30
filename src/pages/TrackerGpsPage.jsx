// src/pages/TrackerGpsPage.jsx
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * TrackerGpsPage — Universal + permanente
 * - Acepta invite_id (si viene) llamando /api/auth/session action=accept_tracker_invite
 * - Luego el gate DB-driven (tracker_can_send) funciona con auth.uid() real
 * - Frontend NO decide negocio: solo refleja el gate
 */

function getSupabaseUrl() {
  return (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
}

// Best-effort token (para Edge function). Si migras totalmente a cookies HttpOnly,
// lo ideal es que tu Edge valide vía cookie/server, pero por ahora mantenemos esto.
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

function readQuery() {
  const url = new URL(window.location.href);
  const invite_id = url.searchParams.get("invite_id") || "";
  const org_id = url.searchParams.get("org_id") || "";
  const tg_flow = url.searchParams.get("tg_flow") || "";
  return { invite_id, org_id, tg_flow };
}

function stripQueryParams(keys = []) {
  try {
    const url = new URL(window.location.href);
    keys.forEach((k) => url.searchParams.delete(k));
    const next = url.pathname + (url.search ? url.search : "") + (url.hash || "");
    window.history.replaceState({}, "", next);
  } catch {
    // noop
  }
}

export default function TrackerGpsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [permission, setPermission] = useState("unknown");
  const [gpsActive, setGpsActive] = useState(false);

  const [lastPosition, setLastPosition] = useState(null);
  const [lastSend, setLastSend] = useState(null);
  const [sendStatus, setSendStatus] = useState("idle");
  const [sendError, setSendError] = useState(null);

  // gating
  const [canSend, setCanSend] = useState(false);
  const [gateMsg, setGateMsg] = useState("Esperando asignación…");
  const [gateInfo, setGateInfo] = useState(null);

  // frecuencia en segundos (UI / throttle)
  const [intervalSec, setIntervalSec] = useState(30);

  const lastSentAtRef = useRef(0);
  const watchIdRef = useRef(null);
  const gatePollRef = useRef(null);
  const startedRef = useRef(false);

  // refs para evitar closures viejos
  const canSendRef = useRef(false);
  const intervalSecRef = useRef(30);
  const gateInfoRef = useRef(null);

  // onboarding refs
  const acceptedInviteRef = useRef(false);

  // Guardamos org_id si viene en el link (SOLO contexto; backend valida con gate)
  const orgIdFromUrlRef = useRef("");

  useEffect(() => {
    canSendRef.current = !!canSend;
  }, [canSend]);

  useEffect(() => {
    intervalSecRef.current = Number(intervalSec || 30);
  }, [intervalSec]);

  useEffect(() => {
    gateInfoRef.current = gateInfo || null;
  }, [gateInfo]);

  // ✅ Gate DB-Driven definitivo: SIN org_id / tenant_id desde frontend
  async function refreshGate() {
    try {
      const { data, error } = await supabase.rpc("tracker_can_send");

      if (error) {
        setCanSend(false);
        setGateInfo(null);
        setGateMsg(`Gate error: ${error.message || "rpc_error"}`);
        return;
      }

      const row = Array.isArray(data) ? data?.[0] : data;

      const ok = !!row?.can_send;
      setCanSend(ok);
      setGateInfo(row || null);

      if (!ok) {
        setGateMsg(row?.reason || "Esperando asignación…");
        return;
      }

      // DB usa frequency_minutes
      const fm = Number(row?.frequency_minutes);
      const sec = Number.isFinite(fm) && fm > 0 ? fm * 60 : 300; // default 5 min
      setIntervalSec(sec);

      setGateMsg("Asignación activa ✅ (enviando automáticamente)");
    } catch (e) {
      setCanSend(false);
      setGateInfo(null);
      setGateMsg(`Gate exception: ${e?.message || "exception"}`);
    }
  }

  // ✅ Universal: aceptar invitación SI viene invite_id (vincula auth.uid real con org)
  async function acceptInviteIfPresent() {
    if (acceptedInviteRef.current) return;
    acceptedInviteRef.current = true;

    const { invite_id, org_id } = readQuery();
    if (org_id) orgIdFromUrlRef.current = org_id;

    if (!invite_id) return;

    try {
      // Llama al server (service role) que valida email, expiración, usado, etc.
      const r = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "accept_tracker_invite",
          invite_id,
        }),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        // Si falla, mostramos error claro.
        const msg =
          j?.error ||
          j?.message ||
          "No se pudo aceptar la invitación. Abre el link nuevamente o pide un nuevo invite.";
        throw new Error(msg);
      }

      // Limpieza de URL para que no se re-ejecute al refrescar
      stripQueryParams(["invite_id", "org_id", "tg_flow"]);
    } catch (e) {
      // Si no acepta, mantenemos la pantalla pero con error explícito
      throw e;
    }
  }

  async function sendPosition(pos) {
    // 1) gating (REF)
    if (!canSendRef.current) return;

    // 2) throttle (REF)
    const now = Date.now();
    const minMs = Math.max(5, Number(intervalSecRef.current || 30)) * 1000;
    if (now - lastSentAtRef.current < minMs) return;
    lastSentAtRef.current = now;

    const token = await getAccessTokenBestEffort();
    if (!token) {
      setSendStatus("error");
      setSendError("No access_token. Abre el magic link de invitación nuevamente.");
      return;
    }

    const supabaseUrl = getSupabaseUrl();
    const url = `${supabaseUrl}/functions/v1/send_position`;

    const gi = gateInfoRef.current;

    // ⚠️ Universal / robusto:
    // - NO mandamos assignment_id (ya no existe en gate)
    // - Mandamos org_id solo si vino en el link como CONTEXTO
    //   (backend debe validar con tracker_can_send).
    const payload = {
      org_id: orgIdFromUrlRef.current || undefined, // si tu Edge lo requiere
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      captured_at: new Date().toISOString(),
      meta: {
        source: "tracker-gps",
        altitude: pos.coords.altitude ?? null,
        heading: pos.coords.heading ?? null,
        speed: pos.coords.speed ?? null,
      },
      geofence_id: gi?.geofence_id ?? null,
    };

    setSendStatus("sending");
    setSendError(null);

    let r;
    let j = {};
    try {
      r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      j = await r.json().catch(() => ({}));
    } catch (e) {
      setSendStatus("error");
      setSendError(e?.message || "Network error enviando posición");
      return;
    }

    if (!r.ok || !j?.ok) {
      setSendStatus("error");
      setSendError(j?.error || j?.details || "Error enviando posición");
      return;
    }

    setSendStatus("ok");
    setLastSend({
      ts: payload.captured_at,
      inserted_id: j?.inserted_id ?? null,
      geofence_id: j?.used_geofence_id ?? payload.geofence_id ?? null,
    });
  }

  function startTrackingAuto() {
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

        await sendPosition(pos);
      },
      (err) => {
        setGpsActive(false);
        setError(err?.message || "Error obteniendo ubicación");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        // 0) Guardar org_id si vino (solo contexto)
        const q = readQuery();
        if (q.org_id) orgIdFromUrlRef.current = q.org_id;

        // 1) Necesitamos sesión (auth)
        const { data, error } = await supabase.auth.getSession();
        if (error) throw new Error(error.message);

        const s = data?.session;
        if (!s) {
          throw new Error("No autenticado. Abre el link de invitación nuevamente.");
        }

        // 2) ✅ Universal: aceptar invitación si viene invite_id (vincula auth.uid real)
        await acceptInviteIfPresent();

        if (!alive) return;
        setLoading(false);

        // 3) Gate inmediato + polling
        await refreshGate();
        gatePollRef.current = setInterval(() => refreshGate(), 15000);

        // 4) Arranque automático del GPS
        startTrackingAuto();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <div>
              <b>permission:</b> {permission}
            </div>
            <div>
              <b>canSend:</b> {String(canSend)}
            </div>
            <div>
              <b>gateMsg:</b> {gateMsg}
            </div>
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
