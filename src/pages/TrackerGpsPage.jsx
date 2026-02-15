import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabaseTracker } from "../lib/supabaseTrackerClient";

const CLIENT_MIN_INTERVAL_MS = 5 * 60 * 1000;
const TICK_MS = 30_000;

const LS_TRACKER_ORG_KEY = "geocercas_tracker_org_id";
const SS_ACCEPTED_PREFIX = "geocercas_tracker_accept_ok:";

function isUuid(v) {
  const s = String(v ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function pickOrgIdFromSearch(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const candidates = [sp.get("org"), sp.get("org_id"), sp.get("orgId")].filter(Boolean);
    for (const c of candidates) {
      if (isUuid(c)) return String(c);
    }
  } catch {}
  return null;
}

function decodeJwtPayload(token) {
  try {
    const part = token.split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function looksLikeJwt(token) {
  const t = String(token || "");
  return t.split(".").length === 3;
}

export default function TrackerGpsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [status, setStatus] = useState("Iniciando tracker…");
  const [coords, setCoords] = useState(null);
  const [lastSend, setLastSend] = useState(null);
  const [lastError, setLastError] = useState(null);

  const [hasSession, setHasSession] = useState(false);
  const [trackerReady, setTrackerReady] = useState(true);
  const [orgId, setOrgId] = useState(null);

  const [membershipStatus, setMembershipStatus] = useState("pending"); // pending | ok | failed | skipped
  const [membershipDetail, setMembershipDetail] = useState("");
  const [tokenIss, setTokenIss] = useState("");

  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);
  const lastCoordsRef = useRef(null);
  const isSendingRef = useRef(false);
  const lastSentAtRef = useRef(0);
  const onboardingLockRef = useRef(false);

  const TRACKER_URL = (import.meta.env.VITE_SUPABASE_TRACKER_URL || "").trim();
  const TRACKER_ANON = (import.meta.env.VITE_SUPABASE_TRACKER_ANON_KEY || "").trim();

  const acceptUrl = useMemo(() => {
    if (!TRACKER_URL) return null;
    return `${TRACKER_URL.replace(/\/$/, "")}/functions/v1/accept-tracker-invite`;
  }, [TRACKER_URL]);

  const sendUrl = useMemo(() => {
    if (!TRACKER_URL) return null;
    return `${TRACKER_URL.replace(/\/$/, "")}/functions/v1/send_position`;
  }, [TRACKER_URL]);

  const log = (msg, extra) => {
    const line = `${new Date().toISOString().slice(11, 19)} - ${msg}`;
    console.log("[TrackerGpsPage]", line, extra || "");
  };

  async function hardLogoutTracker(reason) {
    try {
      await supabaseTracker?.auth?.signOut();
    } catch {}
    setHasSession(false);
    setMembershipStatus("failed");
    setStatus("Sesión inválida");
    setLastError("Tu sesión de tracker no es válida o expiró. Abre un Magic Link NUEVO.");
    setMembershipDetail(String(reason || "hardLogout"));
    log("hardLogoutTracker", { reason: String(reason || "") });
  }

  // 0) Validación config
  useEffect(() => {
    if (!supabaseTracker) {
      setTrackerReady(false);
      setHasSession(false);
      setStatus("Tracker no configurado en este deployment.");
      setLastError(
        "Faltan variables VITE_SUPABASE_TRACKER_URL / VITE_SUPABASE_TRACKER_ANON_KEY en Vercel (Preview)."
      );
      log("supabaseTracker is null", { hasTrackerUrl: !!TRACKER_URL, hasTrackerAnon: !!TRACKER_ANON });
      return;
    }

    if (!TRACKER_URL || !TRACKER_ANON) {
      setTrackerReady(false);
      setHasSession(false);
      setStatus("Tracker no configurado en este deployment.");
      setLastError(
        "Faltan variables VITE_SUPABASE_TRACKER_URL / VITE_SUPABASE_TRACKER_ANON_KEY en Vercel (Preview)."
      );
      log("tracker env missing", { hasTrackerUrl: !!TRACKER_URL, hasTrackerAnon: !!TRACKER_ANON });
      return;
    }

    setTrackerReady(true);
  }, [TRACKER_URL, TRACKER_ANON]);

  // 0.5) ORG resolver
  useEffect(() => {
    const qOrg = pickOrgIdFromSearch(location?.search || "");
    if (qOrg) {
      setOrgId(qOrg);
      try {
        localStorage.setItem(LS_TRACKER_ORG_KEY, qOrg);
      } catch {}
      log("orgId from query", { orgId: qOrg });
      return;
    }

    let lsOrg = null;
    try {
      lsOrg = localStorage.getItem(LS_TRACKER_ORG_KEY);
    } catch {}
    if (lsOrg && isUuid(lsOrg)) {
      setOrgId(String(lsOrg));
      log("orgId from localStorage", { orgId: String(lsOrg) });
      return;
    }

    setOrgId(null);
    log("orgId missing");
  }, [location?.search]);

  // 1) Sesión
  useEffect(() => {
    if (!trackerReady || !supabaseTracker) return;

    let cancelled = false;

    (async () => {
      const { data, error } = await supabaseTracker.auth.getSession();
      if (cancelled) return;

      const tokenB = data?.session?.access_token || "";

      if (error || !data?.session || !tokenB || !looksLikeJwt(tokenB)) {
        setHasSession(false);
        setStatus("No hay sesión activa de tracker.");
        setLastError("Abre esta página únicamente desde tu Magic Link del Tracker.");
        log("getSession: none/invalid", { error, hasSession: !!data?.session, hasToken: !!tokenB });
        return;
      }

      const payload = decodeJwtPayload(tokenB);
      const iss = payload?.iss ? String(payload.iss) : "";
      setTokenIss(iss);

      setHasSession(true);
      setStatus("Sesión OK. Preparando tracker…");
      setLastError(null);
      log("getSession: OK", { email: data.session.user.email, iss });
    })();

    return () => {
      cancelled = true;
    };
  }, [trackerReady]);

  // 1.5) Onboarding universal: accept-tracker-invite (fetch + Bearer)
  useEffect(() => {
    if (!trackerReady || !hasSession || !supabaseTracker) return;

    if (!orgId) {
      setMembershipStatus("skipped");
      setMembershipDetail("Sin org_id; no se puede activar membership.");
      return;
    }

    if (!acceptUrl) {
      setMembershipStatus("failed");
      setMembershipDetail("No se pudo construir acceptUrl.");
      return;
    }

    if (onboardingLockRef.current) return;

    const ssKey = `${SS_ACCEPTED_PREFIX}${orgId}`;
    let alreadyOk = false;
    try {
      alreadyOk = sessionStorage.getItem(ssKey) === "1";
    } catch {}

    if (alreadyOk) {
      setMembershipStatus("ok");
      setMembershipDetail("Membership ya activado en esta sesión.");
      return;
    }

    onboardingLockRef.current = true;

    (async () => {
      try {
        setMembershipStatus("pending");
        setMembershipDetail("Ejecutando accept-tracker-invite…");

        const { data: sData, error: sErr } = await supabaseTracker.auth.getSession();
        const tokenB = sData?.session?.access_token || "";

        if (sErr || !tokenB || !looksLikeJwt(tokenB)) {
          await hardLogoutTracker("accept: missing/invalid token");
          return;
        }

        const payload = decodeJwtPayload(tokenB);
        const iss = payload?.iss ? String(payload.iss) : "";
        setTokenIss(iss);
        log("JWT iss check", { iss });

        const resp = await fetch(acceptUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: TRACKER_ANON,
            Authorization: `Bearer ${tokenB}`,
          },
          body: JSON.stringify({ org_id: orgId }),
        });

        const text = await resp.text();

        // Si es invalid JWT, hacemos hardLogout para forzar magic link nuevo
        if (resp.status === 401 || resp.status === 403) {
          const lower = String(text || "").toLowerCase();
          if (lower.includes("invalid jwt") || lower.includes("bad_jwt") || lower.includes("malformed")) {
            await hardLogoutTracker(`accept: ${resp.status} ${text}`);
            return;
          }
        }

        if (!resp.ok) {
          setMembershipStatus("failed");
          setMembershipDetail(`accept-tracker-invite status=${resp.status} body=${text}`);
          log("accept-tracker-invite non-2xx", { status: resp.status, body: text, orgId });
          return;
        }

        setMembershipStatus("ok");
        setMembershipDetail(`accept-tracker-invite OK: ${text || "ok"}`);
        try {
          sessionStorage.setItem(ssKey, "1");
        } catch {}
        log("accept-tracker-invite OK", { orgId, body: text });
      } catch (e) {
        setMembershipStatus("failed");
        setMembershipDetail(`accept-tracker-invite exception: ${String(e?.message || e)}`);
        log("accept-tracker-invite exception", { orgId, err: String(e?.message || e) });
      } finally {
        onboardingLockRef.current = false;
      }
    })();
  }, [trackerReady, hasSession, orgId, acceptUrl, TRACKER_ANON]);

  // 2) GPS
  useEffect(() => {
    if (!trackerReady || !hasSession) return;

    if (!("geolocation" in navigator)) {
      setStatus("Este dispositivo no soporta geolocalización.");
      setLastError("Geolocation no disponible.");
      return;
    }

    let cancelled = false;

    const handleSuccess = (pos) => {
      if (cancelled) return;

      const c = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
      };

      lastCoordsRef.current = c;
      setCoords(c);

      if (membershipStatus === "ok") setStatus("Tracker activo");
      else if (membershipStatus === "pending") setStatus("Activando Tracker en la org…");
      else if (membershipStatus === "failed") setStatus("Tracker sin permiso en la org");
      else setStatus("Tracker activo");

      // no borres lastError aquí; a veces queremos que siga visible
    };

    const handleError = (err) => {
      if (cancelled) return;
      setStatus("Error GPS");
      setLastError(err?.message || String(err));
      log("GPS error", { err: err?.message || String(err) });
    };

    watchIdRef.current = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });

    return () => {
      cancelled = true;
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [trackerReady, hasSession, membershipStatus]);

  // 3) Envío (gated por membershipStatus)
  useEffect(() => {
    if (!trackerReady || !hasSession) return;
    if (!supabaseTracker) return;

    if (!sendUrl) {
      setStatus("Error configuración");
      setLastError("No se pudo construir SEND_URL del tracker.");
      log("Missing sendUrl", { TRACKER_URL });
      return;
    }

    if (!orgId) {
      setStatus("Error configuración");
      setLastError("Falta org_id para el Tracker. Abre el Tracker desde un Magic Link que incluya ?org=<ORG_UUID>.");
      log("send disabled: orgId missing");
      return;
    }

    if (membershipStatus === "pending") {
      log("send paused: membership pending", { orgId });
      return;
    }
    if (membershipStatus === "failed") {
      setStatus("Tracker sin permiso en la org");
      log("send blocked: membership failed", { orgId, membershipDetail });
      return;
    }

    async function sendOnce() {
      const c = lastCoordsRef.current;
      if (!c) return;

      const now = Date.now();
      if (now - lastSentAtRef.current < CLIENT_MIN_INTERVAL_MS) return;
      if (isSendingRef.current) return;

      isSendingRef.current = true;

      try {
        const { data: sData, error: sErr } = await supabaseTracker.auth.getSession();
        const tokenB = sData?.session?.access_token || "";

        if (sErr || !tokenB || !looksLikeJwt(tokenB)) {
          await hardLogoutTracker("send: missing/invalid token");
          return;
        }

        const payload = {
          org_id: orgId,
          lat: c.lat,
          lng: c.lng,
          accuracy: c.accuracy,
          recorded_at: new Date().toISOString(),
          source: "tracker-gps-web",
        };

        const resp = await fetch(sendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: TRACKER_ANON,
            Authorization: `Bearer ${tokenB}`,
          },
          body: JSON.stringify(payload),
        });

        const text = await resp.text();
        let j = null;
        try {
          j = text ? JSON.parse(text) : null;
        } catch {
          j = { raw: text };
        }

        if (!resp.ok) {
          setStatus("Error enviando posición");
          setLastError(`send_position ${resp.status}: ${j?.error || j?.message || j?.raw || "sin detalle"}`);
          log("send_position FAILED", { status: resp.status, body: j, sendUrl, orgId });
          return;
        }

        lastSentAtRef.current = Date.now();
        setLastSend(new Date());
        setStatus("Posición enviada correctamente.");
        setLastError(null);
        log("send_position OK", { sendUrl, orgId, body: j });
      } catch (e) {
        setStatus("Error enviando posición");
        setLastError(String(e?.message || e));
        log("send_position EXCEPTION", { err: String(e?.message || e), sendUrl, orgId });
      } finally {
        isSendingRef.current = false;
      }
    }

    intervalRef.current = window.setInterval(sendOnce, TICK_MS);
    sendOnce();

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [trackerReady, hasSession, sendUrl, TRACKER_ANON, orgId, membershipStatus, membershipDetail]);

  const formattedLastSend = lastSend ? lastSend.toLocaleTimeString() : "—";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-start justify-center px-3 py-6">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-4">
        <h1 className="text-lg font-semibold text-center">Tracker GPS</h1>

        {trackerReady && hasSession && (
          <>
            <div className="mt-4 rounded-xl bg-slate-950 border border-slate-800 p-3 text-sm">
              <div>Último envío: {formattedLastSend}</div>
              <div className="mt-2 text-[11px] text-slate-400 break-all">send_url: {sendUrl || "—"}</div>
              <div className="mt-2 text-[11px] text-slate-400 break-all">org_id: {orgId || "—"}</div>
              <div className="mt-2 text-[11px] text-slate-400 break-all">membership: {membershipStatus}</div>
              {tokenIss ? <div className="mt-2 text-[11px] text-slate-400 break-all">token_iss: {tokenIss}</div> : null}

              {coords ? (
                <div className="mt-2 text-xs text-slate-300">
                  lat: {coords.lat?.toFixed?.(6)} | lng: {coords.lng?.toFixed?.(6)} | acc: {coords.accuracy ?? "—"}
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-400">Esperando coordenadas…</div>
              )}
            </div>

            <div className="mt-3 text-xs">
              Estado: <span className="text-slate-100">{status}</span>
            </div>

            {membershipDetail ? (
              <div className="mt-3 text-[11px] text-slate-200 bg-slate-800/40 border border-slate-700 rounded-xl p-3">
                {membershipDetail}
              </div>
            ) : null}

            {lastError ? (
              <div className="mt-3 text-xs text-amber-300 bg-amber-950/30 border border-amber-800 rounded-xl p-3">
                {lastError}
              </div>
            ) : null}
          </>
        )}

        {trackerReady && !hasSession && (
          <div className="mt-4 text-center">
            <p className="text-sm text-slate-300 mb-3">Esta página es solo para trackers invitados.</p>
            {lastError ? (
              <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-800 rounded-xl p-3 text-left">
                {lastError}
              </div>
            ) : null}
            <button
              onClick={() => navigate("/")}
              className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-slate-950 font-semibold"
            >
              Ir a inicio
            </button>
          </div>
        )}

        {!trackerReady && (
          <div className="mt-4 text-center">
            <p className="text-sm text-slate-300 mb-3">Tracker no configurado en este deployment.</p>
            {lastError ? (
              <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-800 rounded-xl p-3 text-left">
                {lastError}
              </div>
            ) : null}
            <button
              onClick={() => navigate("/")}
              className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-slate-950 font-semibold"
            >
              Ir a inicio
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
