import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabaseTracker } from "../lib/supabaseTrackerClient";

// ====== Config 5 minutos ======
const CLIENT_MIN_INTERVAL_MS = 5 * 60 * 1000;
const TICK_MS = 30_000;

// Key para fallback (si no viene org por query)
const LS_TRACKER_ORG_KEY = "geocercas_tracker_org_id";

// ✅ Evita spamear accept-tracker-invite por org
const SS_ACCEPTED_PREFIX = "geocercas_tracker_accept_ok:";

function isUuid(v) {
  const s = String(v ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function pickOrgIdFromSearch(search) {
  try {
    const sp = new URLSearchParams(search || "");
    // soporta varios nombres por compatibilidad
    const candidates = [sp.get("org"), sp.get("org_id"), sp.get("orgId")].filter(Boolean);
    for (const c of candidates) {
      if (isUuid(c)) return String(c);
    }
  } catch {}
  return null;
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

  // ✅ NUEVO: onboarding/membership gate
  const [membershipStatus, setMembershipStatus] = useState("pending"); // pending | ok | failed | skipped
  const [membershipDetail, setMembershipDetail] = useState("");

  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);
  const lastCoordsRef = useRef(null);
  const isSendingRef = useRef(false);
  const lastSentAtRef = useRef(0);
  const onboardingLockRef = useRef(false);

  // ✅ PERMANENTE: Tracker SIEMPRE usa Project B. Nunca fallback a Project A.
  const TRACKER_URL = (import.meta.env.VITE_SUPABASE_TRACKER_URL || "").trim();
  const TRACKER_ANON = (import.meta.env.VITE_SUPABASE_TRACKER_ANON_KEY || "").trim();

  const sendUrl = useMemo(() => {
    if (!TRACKER_URL) return null;
    return `${TRACKER_URL.replace(/\/$/, "")}/functions/v1/send_position`;
  }, [TRACKER_URL]);

  const log = (msg, extra) => {
    const line = `${new Date().toISOString().slice(11, 19)} - ${msg}`;
    console.log("[TrackerGpsPage]", line, extra || "");
  };

  // 0) Validación de config del Tracker (universal)
  useEffect(() => {
    if (!supabaseTracker) {
      setTrackerReady(false);
      setHasSession(false);
      setStatus("Tracker no configurado en este deployment.");
      setLastError(
        "Faltan variables VITE_SUPABASE_TRACKER_URL / VITE_SUPABASE_TRACKER_ANON_KEY en Vercel (Preview)."
      );
      log("supabaseTracker is null (missing env)", {
        hasTrackerUrl: !!TRACKER_URL,
        hasTrackerAnon: !!TRACKER_ANON,
      });
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

  /**
   * 0.5) Resolver ORG del Tracker
   * ✅ Universal y estable:
   * - Primero: querystring ?org=<uuid> (recomendado)
   * - Segundo: localStorage (fallback)
   * - Si no hay org, no enviamos posiciones
   */
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
    log("orgId missing (query + localStorage empty)");
  }, [location?.search]);

  // 1) Sesión Project B (Tracker)
  useEffect(() => {
    if (!trackerReady || !supabaseTracker) return;

    let cancelled = false;

    (async () => {
      const { data, error } = await supabaseTracker.auth.getSession();
      if (cancelled) return;

      if (error || !data?.session) {
        setHasSession(false);
        setStatus("No hay sesión activa de tracker.");
        setLastError("Abre esta página únicamente desde tu Magic Link del Tracker.");
        log("getSession(B): sin sesión", { error });
        return;
      }

      setHasSession(true);
      setStatus("Sesión OK. Preparando tracker…");
      setLastError(null);
      log("getSession(B): OK", { email: data.session.user.email });
    })();

    return () => {
      cancelled = true;
    };
  }, [trackerReady]);

  /**
   * ✅ 1.5) Onboarding universal (NO depende de callback)
   * - Si hay orgId + sesión, intenta accept-tracker-invite UNA VEZ por org.
   * - Si hay invite pendiente, crea membership -> send_position deja de dar 403.
   * - Si NO hay invite, falla con mensaje claro (es lo correcto por seguridad).
   */
  useEffect(() => {
    if (!trackerReady || !hasSession || !supabaseTracker) return;

    // Si no hay orgId, no hay onboarding
    if (!orgId) {
      setMembershipStatus("skipped");
      setMembershipDetail("Sin org_id; no se puede activar membership.");
      return;
    }

    // Evitar múltiples ejecuciones simultáneas
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

        const { data, error } = await supabaseTracker.functions.invoke("accept-tracker-invite", {
          body: { org_id: orgId },
        });

        if (error) {
          setMembershipStatus("failed");
          setMembershipDetail(`accept-tracker-invite error: ${error.message}`);
          log("accept-tracker-invite FAILED", { orgId, error: error.message });
          return;
        }

        // Si la función responde ok:false, lo mostramos (por si devuelve payload)
        if (data && data.ok === false) {
          setMembershipStatus("failed");
          setMembershipDetail(`accept-tracker-invite rejected: ${data.error || "unknown"}`);
          log("accept-tracker-invite rejected", { orgId, data });
          return;
        }

        setMembershipStatus("ok");
        setMembershipDetail(`accept-tracker-invite OK`);
        try {
          sessionStorage.setItem(ssKey, "1");
        } catch {}
        log("accept-tracker-invite OK", { orgId, data });
      } catch (e) {
        setMembershipStatus("failed");
        setMembershipDetail(`accept-tracker-invite exception: ${String(e?.message || e)}`);
        log("accept-tracker-invite EXCEPTION", { orgId, err: String(e?.message || e) });
      } finally {
        onboardingLockRef.current = false;
      }
    })();
  }, [trackerReady, hasSession, orgId]);

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

      // status depende de membership gate
      if (membershipStatus === "ok") setStatus("Tracker activo");
      else if (membershipStatus === "pending") setStatus("Activando Tracker en la org…");
      else if (membershipStatus === "failed") setStatus("Tracker sin permiso en la org");
      else setStatus("Tracker activo");

      setLastError(null);
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

  // 3) Envío throttled (SIEMPRE hacia Project B) + gated por membershipStatus
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

    // ✅ Gate universal: no enviar hasta intentar accept
    if (membershipStatus === "pending") {
      log("send paused: membership pending", { orgId });
      return;
    }
    if (membershipStatus === "failed") {
      setStatus("Tracker sin permiso en la org");
      setLastError(
        "No existe invitación pendiente para esta org (tracker_invites vacío) o el invite está vencido/usado. Pide al admin que te invite nuevamente para ESTA org."
      );
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

        if (sErr || !tokenB) {
          setStatus("No hay sesión activa");
          setLastError("Sesión expirada. Abre el Magic Link nuevamente.");
          log("sendOnce: no tokenB", { sErr });
          setHasSession(false);
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

        {!trackerReady && (
          <div className="mt-4 text-center">
            <p className="text-sm text-slate-300 mb-3">Tracker no configurado en este deployment.</p>
            <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-800 rounded-xl p-3 text-left">
              {lastError}
            </div>
            <button
              onClick={() => navigate("/")}
              className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-slate-950 font-semibold"
            >
              Ir a inicio
            </button>
          </div>
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

        {trackerReady && hasSession && (
          <>
            <div className="mt-4 rounded-xl bg-slate-950 border border-slate-800 p-3 text-sm">
              <div>Último envío: {formattedLastSend}</div>
              <div className="mt-2 text-[11px] text-slate-400 break-all">send_url: {sendUrl || "—"}</div>
              <div className="mt-2 text-[11px] text-slate-400 break-all">
                org_id: {orgId || "— (falta org en query ?org=...)"}
              </div>

              <div className="mt-2 text-[11px] text-slate-400 break-all">
                membership:{" "}
                {membershipStatus === "ok"
                  ? "ok"
                  : membershipStatus === "pending"
                  ? "pending"
                  : membershipStatus === "failed"
                  ? "failed"
                  : "skipped"}
              </div>

              {coords ? (
                <div className="mt-2 text-xs text-slate-300">
                  lat: {coords.lat?.toFixed?.(6)} | lng: {coords.lng?.toFixed?.(6)} | acc:{" "}
                  {coords.accuracy ?? "—"}
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
      </div>
    </div>
  );
}
