// src/pages/TrackerGpsPage.jsx
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * TrackerGpsPage — Universal + permanente (DB-driven)
 *
 * FIX DEFINITIVO:
 * - Soporta PKCE (code) + OTP (token_hash/type) + hash tokens.
 * - Consume sesión DESDE URL antes de cualquier guard.
 * - NO borra tokens sb-* manualmente.
 * - SOLO mismatch real (si hay sesión y email != invited_email).
 * - ✅ FORZA ORG ACTIVA = org_id del link (set_current_org) para que el RPC vea asignaciones.
 */

const BUILD = "tracker_gps_v14_force_org";

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

function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function readQuery() {
  const url = new URL(window.location.href);
  return {
    invite_id: url.searchParams.get("invite_id") || "",
    org_id: url.searchParams.get("org_id") || "",
    tg_flow: url.searchParams.get("tg_flow") || "",
    invited_email: (url.searchParams.get("invited_email") || "").trim(),

    // PKCE / OTP params (pueden venir según el flujo)
    code: url.searchParams.get("code"),
    token_hash: url.searchParams.get("token_hash"),
    type: url.searchParams.get("type"),
  };
}

function normalizeType(raw) {
  const v = String(raw || "").toLowerCase();
  return v === "magiclink" || v === "recovery" || v === "signup" || v === "invite" ? v : null;
}

function hasHashTokens() {
  const h = (window.location.hash || "").toLowerCase();
  return h.includes("access_token=") || h.includes("refresh_token=");
}

function cleanAuthArtifactsFromUrl() {
  // Limpia code/token_hash/type + hash tokens del address bar (sin recargar)
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("code");
    url.searchParams.delete("token_hash");
    url.searchParams.delete("type");
    // No tocamos invite_id/org_id/tg_flow/invited_email aquí.
    const next = url.pathname + (url.search ? url.search : "");
    window.history.replaceState({}, "", next);
    if (window.location.hash) {
      window.history.replaceState({}, "", next);
    }
  } catch {
    // ignore
  }
}

function stripQueryParams(keys = []) {
  try {
    const url = new URL(window.location.href);
    keys.forEach((k) => url.searchParams.delete(k));
    const next = url.pathname + (url.search ? url.search : "");
    window.history.replaceState({}, "", next);
  } catch {
    // noop
  }
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

  const [diag, setDiag] = useState({ uid: null, email: null });

  const [canSend, setCanSend] = useState(false);
  const [gateMsg, setGateMsg] = useState("Esperando asignación…");
  const [gateInfo, setGateInfo] = useState(null);

  const [intervalSec, setIntervalSec] = useState(30);

  const lastSentAtRef = useRef(0);
  const watchIdRef = useRef(null);
  const gatePollRef = useRef(null);
  const startedRef = useRef(false);

  const canSendRef = useRef(false);
  const intervalSecRef = useRef(30);
  const gateInfoRef = useRef(null);

  const acceptedInviteRef = useRef(false);
  const orgIdFromUrlRef = useRef("");

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

  async function refreshAuthDiag() {
    setStep("auth:getSession");
    try {
      const { data } = await withTimeout(supabase.auth.getSession(), 6000, "getSession");
      const s = data?.session || null;
      const u = s?.user || null;
      if (u?.id) {
        setDiag({ uid: u.id, email: u.email || null });
        return { uid: u.id, email: u.email || null, access_token: s?.access_token || "" };
      }
    } catch {
      // ignore
    }
    setDiag({ uid: null, email: null });
    return { uid: null, email: null, access_token: "" };
  }

  async function waitForSession(msTotal = 9000) {
    const start = Date.now();
    while (Date.now() - start < msTotal) {
      const { data } = await supabase.auth.getSession();
      const s = data?.session || null;
      if (s?.access_token && s?.user?.id) return s;
      await sleep(200);
    }
    return null;
  }

  async function consumeSessionFromUrlUniversal() {
    const q = readQuery();
    const type = normalizeType(q.type);

    setStep("auth:consume_url:start");

    // 1) Hash tokens
    if (hasHashTokens()) {
      try {
        await withTimeout(
          supabase.auth.getSessionFromUrl({ storeSession: true }),
          8000,
          "getSessionFromUrl"
        );
      } catch {
        // ignore
      }
    }

    // 2) PKCE code
    if (q.code) {
      setStep("auth:exchangeCodeForSession");
      const { error } = await supabase.auth.exchangeCodeForSession(q.code);
      if (error) throw new Error(error.message || "exchange_code_error");
    }

    // 3) OTP token_hash + type
    if (q.token_hash && type) {
      setStep("auth:verifyOtp");
      const { error } = await supabase.auth.verifyOtp({ token_hash: q.token_hash, type });
      if (error) throw new Error(error.message || "verify_otp_error");
    }

    const s = await waitForSession(9000);
    if (!s) throw new Error("No se pudo crear sesión desde el link. Abre el enlace nuevamente.");

    cleanAuthArtifactsFromUrl();
    setStep("auth:consume_url:ok");
    return s;
  }

  async function runInviteEmailGuardIfNeeded(session) {
    if (swapCheckedRef.current) return;
    swapCheckedRef.current = true;

    const q = readQuery();
    const isTrackerFlow = String(q.tg_flow || "").toLowerCase() === "tracker";
    const expected = normEmail(q.invited_email || "");
    if (!isTrackerFlow || !expected) return;

    const current = normEmail(session?.user?.email || "");
    if (!current) return;

    if (current !== expected) {
      setSwapInfo({ expected, current });
      setSwapBlocked(true);
      throw new Error("invite_email_mismatch");
    }
  }

  // ✅ NUEVO: forzar org activa desde el link (universal)
  async function forceActiveOrgFromInvite() {
    const q = readQuery();
    const orgId = (orgIdFromUrlRef.current || q.org_id || "").trim();
    if (!orgId) return;

    setStep("org:set_current_org");

    // intenta setear org activa; si falla, seguimos pero lo dejamos visible en gateMsg
    const { error } = await supabase.rpc("set_current_org", { p_org: orgId });
    if (error) {
      console.warn("set_current_org error:", error);
      setGateMsg(`No se pudo fijar org activa (${error.message || "set_current_org_error"}).`);
      return;
    }
  }

  async function refreshGate() {
    try {
      setStep("gate:rpc tracker_can_send");
      const { data, error } = await withTimeout(
        supabase.rpc("tracker_can_send"),
        9000,
        "tracker_can_send"
      );

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

  async function acceptInviteIfPresent(access_token) {
    if (acceptedInviteRef.current) return;
    acceptedInviteRef.current = true;

    const { invite_id, org_id } = readQuery();
    if (org_id) orgIdFromUrlRef.current = org_id;
    if (!invite_id) return;

    setStep("invite:accept_tracker_invite");

    if (!access_token) throw new Error("No access_token. Abre el link de invitación nuevamente.");

    const res = await fetchJsonWithTimeout(
      "/api/auth/session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${access_token}`,
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
      setSendError(e?.name === "AbortError" ? "Timeout enviando posición" : e?.message || "Network error");
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
      await refreshAuthDiag();
      await refreshGate();
    });

    (async () => {
      try {
        setLoading(true);

        setStep("init:readQuery");
        const q = readQuery();
        if (q.org_id) orgIdFromUrlRef.current = q.org_id;

        // ✅ 1) Consumir sesión desde URL (PKCE/OTP/hash)
        const session = await consumeSessionFromUrlUniversal();
        if (!alive) return;

        // ✅ 2) Guard por invited_email SOLO con sesión real
        await runInviteEmailGuardIfNeeded(session);

        // ✅ 3) diag
        setDiag({ uid: session.user.id, email: session.user.email || null });

        // ✅ 4) aceptar invite si viene
        await acceptInviteIfPresent(session.access_token);
        if (!alive) return;

        // ✅ 5) FORZAR org activa (clave del comportamiento original)
        await forceActiveOrgFromInvite();

        setStep("ready");
        setLoading(false);

        await refreshGate();
        gatePollRef.current = setInterval(() => refreshGate(), 15000);

        setStep("gps:start");
        startTrackingAuto();

        setStep("running");
      } catch (e) {
        if (!alive) return;

        if (String(e?.message || "") === "invite_email_mismatch") {
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

  // UI
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        <div className="text-center">
          <div className="text-sm">Cargando tracker…</div>
          <div className="text-xs opacity-70 mt-2">step: {step}</div>
          <div className="text-xs opacity-70 mt-1">
            build: {BUILD} — diag: {JSON.stringify({ uid: diag?.uid, email: diag?.email })}
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
            <div><b>Esperado:</b> {swapInfo.expected || "—"}</div>
            <div><b>Actual:</b> {swapInfo.current || "—"}</div>
          </div>

          <div className="mt-3 text-[11px] opacity-70">build: {BUILD} — step: {step}</div>
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
            <div><b>build:</b> {BUILD}</div>
            <div><b>step:</b> {step}</div>
            <div><b>uid:</b> {diag?.uid || "—"}</div>
            <div><b>email:</b> {diag?.email || "—"}</div>
            <div><b>permission:</b> {permission}</div>
            <div><b>canSend:</b> {String(canSend)}</div>
            <div><b>gateMsg:</b> {gateMsg}</div>
          </div>
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
            build={BUILD} diag={JSON.stringify({ uid: diag?.uid, email: diag?.email })}
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

        <div className="mt-3 text-[11px] opacity-70">step: {step}</div>
      </div>
    </div>
  );
}
