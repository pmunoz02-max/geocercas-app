import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
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
    const candidates = [sp.get("org_id"), sp.get("org"), sp.get("orgId")].filter(Boolean);
    for (const c of candidates) if (isUuid(c)) return String(c).trim();
  } catch {}
  return null;
}

function decodeJwtPayload(token) {
  try {
    const part = String(token || "").split(".")[1];
    if (!part) return null;
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

function readSbTrackerAuthRaw() {
  try {
    return localStorage.getItem("sb-tracker-auth");
  } catch {
    return "localStorage_error";
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function TrackerGpsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams(); // ✅ /tracker-gps/:orgId

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

  const [debug, setDebug] = useState({
    sb_tracker_auth_present: null,
    sb_tracker_auth_len: null,
    session_exists: null,
    token_looks_jwt: null,
    token_iss: "",
    token_sub: "",
    org_source: "",
    router_search: "",
    path_orgId: "",
  });

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
    const base = `${TRACKER_URL.replace(/\/$/, "")}/functions/v1/accept-tracker-invite`;
    if (orgId && isUuid(orgId)) return `${base}?org_id=${encodeURIComponent(orgId)}`;
    return base;
  }, [TRACKER_URL, orgId]);

  const sendUrl = useMemo(() => {
    if (!TRACKER_URL) return null;
    return `${TRACKER_URL.replace(/\/$/, "")}/functions/v1/send_position`;
  }, [TRACKER_URL]);

  // 0) Config
  useEffect(() => {
    if (!supabaseTracker || !TRACKER_URL || !TRACKER_ANON) {
      setTrackerReady(false);
      setHasSession(false);
      setStatus("Tracker no configurado en este deployment.");
      setLastError("Faltan variables VITE_SUPABASE_TRACKER_URL / VITE_SUPABASE_TRACKER_ANON_KEY en Vercel (Preview).");
      return;
    }
    setTrackerReady(true);
  }, [TRACKER_URL, TRACKER_ANON]);

  // ✅ org seed: query OR path param
  useEffect(() => {
    const qOrg = pickOrgIdFromSearch(location?.search || "");
    const pOrg = isUuid(params?.orgId) ? String(params.orgId).trim() : null;

    const found = qOrg || pOrg || null;
    const source = qOrg ? "query" : (pOrg ? "path" : "none");

    setDebug((d) => ({
      ...d,
      org_source: source,
      router_search: String(location?.search || ""),
      path_orgId: String(params?.orgId || ""),
    }));

    if (found && isUuid(found)) {
      setOrgId(found);
      try { localStorage.setItem(LS_TRACKER_ORG_KEY, found); } catch {}
      if (membershipStatus === "failed" && membershipDetail?.includes("Falta org_id")) {
        setMembershipStatus("pending");
        setMembershipDetail("");
      }
      return;
    }

    setOrgId(null);
    setMembershipStatus("failed");
    setMembershipDetail(
      "Falta org_id en la URL. Abre esta página desde el link de invitación: /tracker-gps/<ORG_ID> (recomendado) o /tracker-gps?org_id=<ORG_ID>"
    );
  }, [location?.search, params?.orgId]);

  // 1) Sesión
  useEffect(() => {
    if (!trackerReady || !supabaseTracker) return;

    let cancelled = false;
    let unsub = null;

    const updateDebugFromToken = (token) => {
      const payload = token ? decodeJwtPayload(token) : null;
      setDebug((d) => ({
        ...d,
        token_looks_jwt: looksLikeJwt(token),
        token_iss: payload?.iss ? String(payload.iss) : "",
        token_sub: payload?.sub ? String(payload.sub) : "",
      }));
      setTokenIss(payload?.iss ? String(payload.iss) : "");
    };

    const refreshStorageDebug = () => {
      const raw = readSbTrackerAuthRaw();
      setDebug((d) => ({
        ...d,
        sb_tracker_auth_present: raw != null && raw !== "localStorage_error",
        sb_tracker_auth_len: raw && typeof raw === "string" ? raw.length : 0,
      }));
    };

    refreshStorageDebug();

    (async () => {
      setStatus("Leyendo sesión del tracker…");

      let session = null;
      for (let i = 0; i < 10; i++) {
        const { data } = await supabaseTracker.auth.getSession();
        session = data?.session ?? null;
        if (session?.access_token) break;
        await sleep(150);
      }
      if (cancelled) return;

      const tokenB = session?.access_token || "";
      const ok = !!tokenB && looksLikeJwt(tokenB);

      setDebug((d) => ({ ...d, session_exists: !!session }));
      updateDebugFromToken(tokenB);

      if (!ok) {
        setHasSession(false);
        setStatus("No hay sesión activa de tracker.");
        setLastError("Abre esta página únicamente desde tu Magic Link del Tracker.");
        return;
      }

      setHasSession(true);
      setStatus("Sesión OK. Preparando tracker…");
      setLastError(null);
    })();

    const { data: sub } = supabaseTracker.auth.onAuthStateChange((_event, session) => {
      refreshStorageDebug();
      const tokenB = session?.access_token || "";
      setDebug((d) => ({ ...d, session_exists: !!session }));
      updateDebugFromToken(tokenB);

      if (tokenB && looksLikeJwt(tokenB)) {
        setHasSession(true);
        setStatus("Sesión OK. Preparando tracker…");
        setLastError(null);
      }
    });

    unsub = sub?.subscription;

    return () => {
      cancelled = true;
      try { unsub?.unsubscribe?.(); } catch {}
    };
  }, [trackerReady]);

  // 1.5) Onboarding robusto (igual que antes)
  useEffect(() => {
    if (!trackerReady || !hasSession || !supabaseTracker) return;
    if (!orgId || !isUuid(orgId)) return;

    if (!acceptUrl) {
      setMembershipStatus("failed");
      setMembershipDetail("No se pudo construir acceptUrl.");
      return;
    }

    if (onboardingLockRef.current) return;
    onboardingLockRef.current = true;

    (async () => {
      try {
        setMembershipStatus("pending");
        setMembershipDetail("Verificando membership…");

        const { data: sData } = await supabaseTracker.auth.getSession();
        const tokenB = sData?.session?.access_token || "";
        const userId = sData?.session?.user?.id || "";

        if (!tokenB || !looksLikeJwt(tokenB) || !userId) {
          setMembershipStatus("failed");
          setMembershipDetail("No hay token/user válido en /tracker-gps.");
          return;
        }

        const ssKey = `${SS_ACCEPTED_PREFIX}${userId}:${orgId}`;
        try {
          if (sessionStorage.getItem(ssKey) === "1") {
            setMembershipStatus("ok");
            setMembershipDetail("Membership OK (cache de sesión).");
            return;
          }
        } catch {}

        const { data: mRows, error: mErr } = await supabaseTracker
          .from("memberships")
          .select("role, revoked_at, org_id, user_id")
          .eq("org_id", orgId)
          .eq("user_id", userId)
          .limit(1);

        if (mErr) {
          setMembershipStatus("failed");
          setMembershipDetail(`memberships select error: ${mErr.message}`);
          return;
        }

        const m = (mRows || [])[0];
        if (m && !m.revoked_at) {
          setMembershipStatus("ok");
          setMembershipDetail(`Membership ya existe: role=${m.role}`);
          try { sessionStorage.setItem(ssKey, "1"); } catch {}
          return;
        }

        setMembershipDetail("No hay membership. Ejecutando accept-tracker-invite…");

        const resp = await fetch(acceptUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: TRACKER_ANON,
            "x-api-key": TRACKER_ANON,
            Authorization: `Bearer ${tokenB}`,
          },
          body: JSON.stringify({ org_id: orgId }),
        });

        const text = await resp.text();

        if (!resp.ok) {
          setMembershipStatus("failed");
          setMembershipDetail(`accept-tracker-invite status=${resp.status} body=${text}`);
          return;
        }

        setMembershipStatus("ok");
        setMembershipDetail(`accept-tracker-invite OK: ${text || "ok"}`);
        try { sessionStorage.setItem(ssKey, "1"); } catch {}
      } catch (e) {
        setMembershipStatus("failed");
        setMembershipDetail(`onboarding exception: ${String(e?.message || e)}`);
      } finally {
        onboardingLockRef.current = false;
      }
    })();
  }, [trackerReady, hasSession, acceptUrl, TRACKER_ANON, orgId]);

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

      const c = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
      lastCoordsRef.current = c;
      setCoords(c);

      if (membershipStatus === "ok") setStatus("Tracker activo");
      else if (membershipStatus === "pending") setStatus("Activando Tracker en la org…");
      else if (membershipStatus === "failed") setStatus("Tracker sin permiso / sin onboarding");
      else setStatus("Tracker activo");
    };

    const handleError = (err) => {
      if (cancelled) return;
      setStatus("Error GPS");
      setLastError(err?.message || String(err));
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

  // 3) Envío (solo si membership ok + orgId)
  useEffect(() => {
    if (!trackerReady || !hasSession) return;
    if (!sendUrl) return;
    if (membershipStatus !== "ok") return;
    if (!orgId) return;

    async function sendOnce() {
      const c = lastCoordsRef.current;
      if (!c) return;

      const now = Date.now();
      if (now - lastSentAtRef.current < CLIENT_MIN_INTERVAL_MS) return;
      if (isSendingRef.current) return;

      isSendingRef.current = true;

      try {
        const { data: sData } = await supabaseTracker.auth.getSession();
        const tokenB = sData?.session?.access_token || "";

        if (!tokenB || !looksLikeJwt(tokenB)) {
          setLastError("send_position: no hay token válido en /tracker-gps");
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
            "x-api-key": TRACKER_ANON,
            Authorization: `Bearer ${tokenB}`,
          },
          body: JSON.stringify(payload),
        });

        const text = await resp.text();
        if (!resp.ok) {
          setLastError(`send_position ${resp.status}: ${text}`);
          return;
        }

        lastSentAtRef.current = Date.now();
        setLastSend(new Date());
        setLastError(null);
      } finally {
        isSendingRef.current = false;
      }
    }

    intervalRef.current = window.setInterval(sendOnce, TICK_MS);
    sendOnce();

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [trackerReady, hasSession, sendUrl, TRACKER_ANON, orgId, membershipStatus]);

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

            <details className="mt-4 rounded-xl bg-slate-950 border border-slate-800 p-3">
              <summary className="cursor-pointer text-sm text-slate-200">Debug (copiar/pegar)</summary>
              <pre className="mt-3 text-[11px] text-slate-300 overflow-auto">
{JSON.stringify(
  {
    ...debug,
    sb_tracker_auth_sample: (readSbTrackerAuthRaw() || "").slice(0, 120),
  },
  null,
  2
)}
              </pre>
            </details>

            <div className="mt-3 text-xs">
              Estado: <span className="text-slate-100">{status}</span>
            </div>

            {membershipDetail ? (
              <div className="mt-3 text-[11px] text-slate-200 bg-slate-800/40 border border-slate-700 rounded-xl p-3 whitespace-pre-wrap">
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
