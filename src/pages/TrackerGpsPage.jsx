// src/pages/TrackerGpsPage.jsx
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * TrackerGpsPage — Universal + permanente (DB-driven)
 *
 * FIX CRÍTICO:
 * - NO hacer signOut/clear storage mientras la sesión del magiclink aún se está hidratando.
 * - Primero: consumir tokens del URL (getSessionFromUrl)
 * - Luego: validar mismatch real (si hay sesión y email distinto a invited_email)
 * - En tracker flow: intentar "swap" (signOut del admin + re-consumir URL) antes de bloquear.
 */

function getSupabaseUrl() {
  return (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
}

function withTimeout(promise, ms, label = "timeout") {
  let t;
  const timeoutPromise = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label}_after_${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(t));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readQuery() {
  const url = new URL(window.location.href);
  const invite_id = url.searchParams.get("invite_id") || "";
  const org_id = url.searchParams.get("org_id") || "";
  const tg_flow = url.searchParams.get("tg_flow") || "";
  const invited_email = (url.searchParams.get("invited_email") || "").trim();
  return { invite_id, org_id, tg_flow, invited_email };
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

function hasHashTokens() {
  const h = (window.location.hash || "").toLowerCase();
  return h.includes("access_token=") || h.includes("refresh_token=");
}

function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}

async function fetchJsonWithTimeout(url, opts, ms, label) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);

  try {
    const r = await fetch(url, { ...opts, signal: ac.signal });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, json: j };
  } catch (e) {
    throw new Error(
      `${label}_failed: ${e?.name === "AbortError" ? "aborted" : e?.message || "network"}`
    );
  } finally {
    clearTimeout(t);
  }
}

export default function TrackerGpsPage() {
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState("init");
  const [error, setError] = useState(null);

  const [permission, setPermission] = useState("unknown");
  const [gpsActive, setGpsActive] = useState(false);

  const [lastPosition, setLastPosition] = useState(null);
  const [lastSend, setLastSend] = useState(null);
  const [sendStatus, setSendStatus] = useState("idle");
  const [sendError, setSendError] = useState(null);

  // diag real (uid/email)
  const [diag, setDiag] = useState({ uid: null, email: null });

  // gating
  const [canSend, setCanSend] = useState(false);
  const [gateMsg, setGateMsg] = useState("Esperando asignación…");
  const [gateInfo, setGateInfo] = useState(null);

  const [intervalSec, setIntervalSec] = useState(30);

  const lastSentAtRef = useRef(0);
  const watchIdRef = useRef(null);
  const gatePollRef = useRef(null);
  const startedRef = useRef(false);

  // refs anti-closure
  const canSendRef = useRef(false);
  const intervalSecRef = useRef(30);
  const gateInfoRef = useRef(null);

  const acceptedInviteRef = useRef(false);
  const orgIdFromUrlRef = useRef("");

  // swap guard UI
  const swapCheckedRef = useRef(false);
  const [swapBlocked, setSwapBlocked] = useState(false);
  const [swapInfo, setSwapInfo] = useState({ expected: "", current: "" });

  useEffect(() => {
    canSendRef.current = !!canSend;
  }, [canSend]);
  useEffect(() => {
    intervalSecRef.current = Number(intervalSec || 30);
  }, [intervalSec]);
  useEffect(() => {
    gateInfoRef.current = gateInfo || null;
  }, [gateInfo]);

  async function refreshAuthDiagBestEffort() {
    setStep("auth:getSession");
    try {
      const { data } = await withTimeout(supabase.auth.getSession(), 6000, "getSession");
      const u = data?.session?.user || null;
      if (u?.id) {
        setDiag({ uid: u.id, email: u.email || null });
        return { uid: u.id, email: u.email || null, access_token: data?.session?.access_token || "" };
      }
    } catch {
      // ignore
    }
    setDiag({ uid: null, email: null });
    return { uid: null, email: null, access_token: "" };
  }

  async function consumeSessionFromUrlBestEffort() {
    // Importante: en /tracker-gps el magiclink llega con hash tokens.
    // Esto los consume y los guarda en storage/session.
    setStep("auth:getSessionFromUrl");
    try {
      await withTimeout(supabase.auth.getSessionFromUrl({ storeSession: true }), 7000, "getSessionFromUrl");
      return true;
    } catch {
      return false;
    }
  }

  async function waitForSession(msTotal = 8000) {
    const start = Date.now();
    while (Date.now() - start < msTotal) {
      const { data } = await supabase.auth.getSession();
      const s = data?.session || null;
      if (s?.access_token && s?.user?.id) return s;
      await sleep(200);
    }
    return null;
  }

  // ✅ Session Swap Guard (tracker-flow seguro)
  async function runSessionSwapGuardIfNeeded() {
    if (swapCheckedRef.current) return;
    swapCheckedRef.current = true;

    const q = readQuery();
    const isTrackerFlow = String(q.tg_flow || "").toLowerCase() === "tracker";
    const expected = normEmail(q.invited_email || "");

    if (!isTrackerFlow || !expected) return;

    setStep("swap_guard:start");

    // 1) Consumir tokens del URL (si existen)
    const hadHash = hasHashTokens();
    if (hadHash) {
      await consumeSessionFromUrlBestEffort();
    }

    // 2) Esperar a que la sesión quede lista
    const s1 = await waitForSession(8000);
    const current1 = normEmail(s1?.user?.email || "");

    // Caso A: sesión lista y coincide -> OK
    if (current1 && current1 === expected) {
      setStep("swap_guard:ok");
      return;
    }

    // Caso B: hay sesión pero NO coincide -> intentar swap (signOut viejo + re-consumir URL)
    if (current1 && current1 !== expected) {
      setStep("swap_guard:mismatch_try_swap");
      // Si NO hay hash tokens, no podemos hacer swap; bloqueamos sin destruir nada.
      if (!hadHash) {
        setSwapInfo({ expected, current: current1 });
        setSwapBlocked(true);
        throw new Error("swap_guard_blocked");
      }

      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }

      // Re-consumir el hash (todavía está en URL)
      await consumeSessionFromUrlBestEffort();
      const s2 = await waitForSession(8000);
      const current2 = normEmail(s2?.user?.email || "");

      if (current2 && current2 === expected) {
        setStep("swap_guard:swap_ok");
        return;
      }

      setSwapInfo({ expected, current: current2 || "(sin sesión)" });
      setSwapBlocked(true);
      throw new Error("swap_guard_blocked");
    }

    // Caso C: todavía no hay sesión -> NO es mismatch, es "sin sesión"
    // No bloqueamos con "sesión incorrecta"; lo tratamos como error amigable más abajo.
    setStep("swap_guard:no_session_yet");
    return;
  }

  // ✅ Gate DB-driven con timeout duro
  async function refreshGate() {
    try {
      setStep("gate:rpc tracker_can_send");
      const { data, error } = await withTimeout(supabase.rpc("tracker_can_send"), 9000, "tracker_can_send");

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

      const fm = Number(row?.frequency_minutes);
      const sec = Number.isFinite(fm) && fm > 0 ? fm * 60 : 300;
      setIntervalSec(sec);
      setGateMsg("Asignación activa ✅ (enviando automáticamente)");
    } catch (e) {
      setCanSend(false);
      setGateInfo(null);
      setGateMsg(`Gate exception: ${e?.message || "exception"}`);
    }
  }

  // ✅ aceptar invitación si viene invite_id (Bearer-first)
  async function acceptInviteIfPresent() {
    if (acceptedInviteRef.current) return;
    acceptedInviteRef.current = true;

    const { invite_id, org_id } = readQuery();
    if (org_id) orgIdFromUrlRef.current = org_id;
    if (!invite_id) return;

    setStep("invite:accept_tracker_invite");

    // requiere uid real
    const a = await refreshAuthDiagBestEffort();
    if (!a?.uid) throw new Error("No autenticado. Abre el link de invitación nuevamente.");

    const token = a?.access_token || "";
    if (!token) throw new Error("No access_token. Abre el link de invitación nuevamente.");

    const res = await fetchJsonWithTimeout(
      "/api/auth/session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({ action: "accept_tracker_invite", invite_id }),
      },
      12000,
      "accept_invite"
    );

    if (!res.ok || !res.json?.ok) {
      const msg =
        res.json?.error ||
        res.json?.message ||
        "No se pudo aceptar la invitación. Abre el link nuevamente o pide un nuevo invite.";
      throw new Error(msg);
    }

    // ✅ limpiar params de invite (incluye invited_email)
    stripQueryParams(["invite_id", "org_id", "tg_flow", "invited_email"]);
  }

  async function sendPosition(pos) {
    if (!canSendRef.current) return;

    const now = Date.now();
    const minMs = Math.max(5, Number(intervalSecRef.current || 30)) * 1000;
    if (now - lastSentAtRef.current < minMs) return;
    lastSentAtRef.current = now;

    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token || "";
    if (!token) {
      setSendStatus("error");
      setSendError("No access_token. Abre el link de invitación nuevamente.");
      return;
    }

    const supabaseUrl = getSupabaseUrl();
    const url = `${supabaseUrl}/functions/v1/send_position`;

    const gi = gateInfoRef.current;

    const payload = {
      org_id: orgIdFromUrlRef.current || undefined,
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

    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 12000);

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
          signal: ac.signal,
        });
        j = await r.json().catch(() => ({}));
      } finally {
        clearTimeout(t);
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
    } catch (e) {
      setSendStatus("error");
      setSendError(
        e?.name === "AbortError" ? "Timeout enviando posición" : e?.message || "Network error"
      );
    }
  }

  function startTrackingAuto() {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!("geolocation" in navigator)) {
      setError("Este dispositivo no soporta GPS.");
      return;
    }

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

    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      if (!alive) return;
      await refreshAuthDiagBestEffort();
      await refreshGate();
    });

    (async () => {
      try {
        setLoading(true);

        setStep("init:readQuery");
        const q = readQuery();
        if (q.org_id) orgIdFromUrlRef.current = q.org_id;

        // ✅ 0) Consumir tokens del URL ANTES de cualquier chequeo
        if (hasHashTokens()) {
          await consumeSessionFromUrlBestEffort();
        }

        // ✅ 1) Swap guard seguro (no destruye tokens por "no session yet")
        await runSessionSwapGuardIfNeeded();

        // ✅ 2) Auth base
        const a = await refreshAuthDiagBestEffort();
        if (!a?.uid) {
          throw new Error("No autenticado. Abre el link de invitación nuevamente.");
        }

        // ✅ 3) aceptar invite si viene
        await acceptInviteIfPresent();

        if (!alive) return;

        setStep("ready");
        setLoading(false);

        await refreshGate();
        gatePollRef.current = setInterval(() => refreshGate(), 15000);

        setStep("gps:start");
        startTrackingAuto();

        setStep("running");
      } catch (e) {
        if (!alive) return;

        if (String(e?.message || "") === "swap_guard_blocked") {
          setLoading(false);
          return;
        }

        setError(e?.message || "Error cargando tracker");
        setStep("error");
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
      if (gatePollRef.current) clearInterval(gatePollRef.current);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      startedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------
  // UI states
  // --------

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        <div className="text-center">
          <div className="text-sm">Cargando tracker…</div>
          <div className="text-xs opacity-70 mt-2">step: {step}</div>
          <div className="text-xs opacity-70 mt-1">
            diag: {JSON.stringify({ uid: diag?.uid, email: diag?.email })}
          </div>
        </div>
      </div>
    );
  }

  if (swapBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border rounded-xl p-6 shadow">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Sesión incorrecta</h2>

          <p className="text-sm text-slate-700">Esta sesión no corresponde al tracker invitado.</p>

          <div className="mt-3 text-xs bg-slate-50 border rounded p-3 overflow-auto">
            <div>
              <b>Esperado:</b> {swapInfo.expected || "—"}
            </div>
            <div>
              <b>Actual:</b> {swapInfo.current || "—"}
            </div>
          </div>

          <div className="mt-4 text-sm text-slate-700">
            Abre el enlace del email nuevamente (o en incógnito si estás logueado como admin).
          </div>

          <button
            className="mt-4 w-full rounded-lg bg-slate-900 py-3 text-white"
            onClick={() => window.location.reload()}
          >
            Entendido
          </button>

          <div className="mt-3 text-[11px] opacity-70">step: {step}</div>
        </div>
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
              <b>step:</b> {step}
            </div>
            <div>
              <b>uid:</b> {diag?.uid || "—"}
            </div>
            <div>
              <b>email:</b> {diag?.email || "—"}
            </div>
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
          Estado: <b>{canSend ? "Enviando ✅" : "En espera…"}</b> — {gateMsg}{" "}
          <span className="opacity-80">
            diag={JSON.stringify({ uid: diag?.uid, email: diag?.email })}
          </span>
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
          Tip: si no hay asignación activa, el tracker queda en espera y empieza a enviar
          automáticamente cuando se active.
        </div>

        <div className="mt-3 text-[11px] opacity-70">step: {step}</div>
      </div>
    </div>
  );
}
