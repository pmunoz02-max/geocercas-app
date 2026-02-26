// src/pages/TrackerGpsPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";

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
    for (const c of candidates) if (isUuid(c)) return String(c);
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

function parseHashTokens(hash) {
  const h = String(hash || "");
  const hp = new URLSearchParams(h.startsWith("#") ? h.slice(1) : h);
  return { access_token: hp.get("access_token") || "", refresh_token: hp.get("refresh_token") || "" };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sanitizeLang(v) {
  const l = String(v || "").trim().toLowerCase().slice(0, 2);
  return l === "en" || l === "fr" || l === "es" ? l : "es";
}

export default function TrackerGpsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { t, i18n } = useTranslation();

  const lang = useMemo(() => {
    try {
      const sp = new URLSearchParams(location.search || "");
      return sanitizeLang(sp.get("lang") || "");
    } catch {
      return "es";
    }
  }, [location.search]);

  useEffect(() => {
    (async () => {
      try {
        if (i18n?.resolvedLanguage !== lang) await i18n.changeLanguage(lang);
      } catch {}
    })();
  }, [i18n, lang]);

  const [status, setStatus] = useState(t("trackerGps.status.initializing", { defaultValue: "Starting tracker…" }));
  const [coords, setCoords] = useState(null);
  const [lastSend, setLastSend] = useState(null);
  const [lastError, setLastError] = useState(null);

  const [hasSession, setHasSession] = useState(false);
  const [trackerReady, setTrackerReady] = useState(true);
  const [orgId, setOrgId] = useState(null);

  const [membershipStatus, setMembershipStatus] = useState("pending");
  const [membershipDetail, setMembershipDetail] = useState("");
  const [tokenIss, setTokenIss] = useState("");

  const [debug, setDebug] = useState({
    session_exists: null,
    token_looks_jwt: null,
    token_iss: "",
    token_sub: "",
    org_source: "none",
    router_search: "",
    path_orgId: "",
    client_used: "supabase",
    supabase_url: "",
    send_mode: "send_position:fetch(anon)+x-user-jwt; accept:invoke",
    send_fn: "send_position",
    accept_fn: "accept-tracker-invite",
    last_invoke_fn: "",
    last_invoke_auth: "unknown",
    last_invoke_token_len: 0,
    last_token_ttl_sec: null,
    last_http_status: null,
  });

  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);
  const lastCoordsRef = useRef(null);
  const isSendingRef = useRef(false);
  const lastSentAtRef = useRef(0);
  const onboardingLockRef = useRef(false);
  const didHashSessionRef = useRef(false);

  const PRIMARY = supabase;

  // ✅ token fresco (refresh si falta poco)
  async function getFreshJwtOrThrow(label, { minTtlSeconds = 90 } = {}) {
    const now = Math.floor(Date.now() / 1000);

    const { data: s1, error: e1 } = await PRIMARY.auth.getSession();
    if (e1) throw new Error(`getSession error before ${label}: ${e1.message}`);

    let token = s1?.session?.access_token || "";
    let exp = s1?.session?.expires_at || 0;

    if (!token || !looksLikeJwt(token)) throw new Error(`${label} blocked: missing/invalid user JWT`);

    const ttl = exp ? exp - now : 0;

    if (!exp || ttl < minTtlSeconds) {
      const { data: s2, error: e2 } = await PRIMARY.auth.refreshSession();
      if (e2) throw new Error(`refreshSession error before ${label}: ${e2.message}`);
      token = s2?.session?.access_token || "";
      exp = s2?.session?.expires_at || 0;
      if (!token || !looksLikeJwt(token)) throw new Error(`${label} blocked: refresh returned invalid user JWT`);
    }

    const ttl2 = exp ? exp - Math.floor(Date.now() / 1000) : null;
    setDebug((d) => ({ ...d, last_token_ttl_sec: ttl2 }));

    const payload = decodeJwtPayload(token);
    setTokenIss(payload?.iss ? String(payload.iss) : "");
    setDebug((d) => ({
      ...d,
      token_looks_jwt: looksLikeJwt(token),
      token_iss: payload?.iss ? String(payload.iss) : "",
      token_sub: payload?.sub ? String(payload.sub) : "",
      client_used: "supabase",
    }));

    return token;
  }

  // ✅ accept-tracker-invite: dejamos invoke normal (ya te funcionaba / no tocar más de lo necesario)
  async function invokeFn(fnName, body) {
    if (!PRIMARY?.functions?.invoke) throw new Error("Supabase functions client not available");

    const tokenB = await getFreshJwtOrThrow(`invoke(${fnName})`);

    setDebug((d) => ({
      ...d,
      last_invoke_fn: fnName,
      last_invoke_token_len: tokenB.length,
      last_invoke_auth: "supabase.invoke(default)",
      last_http_status: null,
    }));

    const { data, error } = await PRIMARY.functions.invoke(fnName, { body });

    if (error) {
      const e = new Error(error.message || "Edge function error");
      // @ts-ignore
      e.details = error;
      throw e;
    }
    return data;
  }

  // ✅ send_position: fetch directo con anon key en Authorization para no disparar gateway Invalid JWT
  async function invokeSendPosition(body) {
    const sbUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
    const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

    if (!sbUrl || !anon) throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in this deployment");

    const userJwt = await getFreshJwtOrThrow("send_position(fetch)");

    setDebug((d) => ({
      ...d,
      last_invoke_fn: "send_position",
      last_invoke_token_len: userJwt.length,
      last_invoke_auth: "fetch:Authorization=anon; x-user-jwt=user",
      last_http_status: null,
    }));

    const url = `${sbUrl.replace(/\/+$/, "")}/functions/v1/send_position`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        // ✅ pasa gateway
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        "Content-Type": "application/json",
        // ✅ user jwt para que la function valide usuario
        "x-user-jwt": userJwt,
      },
      body: JSON.stringify(body),
    });

    setDebug((d) => ({ ...d, last_http_status: res.status }));

    let j = null;
    try {
      j = await res.json();
    } catch {
      // ignore
    }

    if (!res.ok) {
      const msg = j?.error || j?.message || `HTTP ${res.status}`;
      throw new Error(`send_position http ${res.status}: ${msg}`);
    }

    return j;
  }

  // 0) Config
  useEffect(() => {
    setDebug((d) => ({ ...d, supabase_url: (import.meta.env.VITE_SUPABASE_URL || "").trim() }));

    if (!PRIMARY) {
      setTrackerReady(false);
      setHasSession(false);
      setStatus(t("trackerGps.errors.notConfigured", { defaultValue: "Tracker is not configured in this deployment." }));
      setLastError(t("trackerGps.errors.noSupabaseClient", { defaultValue: "Primary Supabase client not found." }));
      return;
    }

    setTrackerReady(true);
  }, [PRIMARY, t]);

  // 0.2) Org
  useEffect(() => {
    const pOrg = String(params?.orgId || "").trim();
    const qOrg = pickOrgIdFromSearch(location?.search || "");
    const picked = isUuid(pOrg) ? pOrg : isUuid(qOrg) ? qOrg : "";

    setDebug((d) => ({
      ...d,
      router_search: location?.search || "",
      path_orgId: pOrg || "",
      org_source: isUuid(pOrg) ? "path" : isUuid(qOrg) ? "query" : "none",
    }));

    if (picked) {
      setOrgId(picked);
      try {
        localStorage.setItem(LS_TRACKER_ORG_KEY, picked);
      } catch {}
      return;
    }

    setOrgId(null);
    setMembershipStatus("failed");
    setMembershipDetail(
      t("trackerGps.membership.missingOrgId", {
        defaultValue: "Missing org_id in URL. Open this page from the invitation link: /tracker-gps?org_id=<ORG_ID>.",
      })
    );
  }, [location?.search, params?.orgId, t]);

  // 0.3) hash tokens => setSession
  useEffect(() => {
    if (!trackerReady || !PRIMARY) return;
    if (didHashSessionRef.current) return;

    const { access_token, refresh_token } = parseHashTokens(window.location.hash);
    if (!access_token || !refresh_token || !looksLikeJwt(access_token)) return;

    didHashSessionRef.current = true;

    (async () => {
      try {
        setStatus(t("trackerGps.status.processingMagicLink", { defaultValue: "Processing Tracker Magic Link…" }));

        const { error } = await PRIMARY.auth.setSession({ access_token, refresh_token });
        if (error) {
          setLastError(t("trackerGps.errors.setSession", { defaultValue: "setSession error:" }) + ` ${error.message}`);
          return;
        }

        for (let i = 0; i < 10; i++) {
          const { data } = await PRIMARY.auth.getSession();
          if (data?.session?.access_token && looksLikeJwt(data.session.access_token)) break;
          await sleep(200);
        }

        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

        setLastError(null);
        setStatus(t("trackerGps.status.sessionOkPreparing", { defaultValue: "Session OK. Preparing tracker…" }));
      } catch (e) {
        setLastError(t("trackerGps.errors.hashSession", { defaultValue: "hash session error:" }) + ` ${String(e?.message || e)}`);
      }
    })();
  }, [trackerReady, PRIMARY, t]);

  // 1) Sesión
  useEffect(() => {
    if (!trackerReady || !PRIMARY) return;

    let cancelled = false;

    const updateDebugFromToken = (token) => {
      const payload = token ? decodeJwtPayload(token) : null;
      setDebug((d) => ({
        ...d,
        token_looks_jwt: looksLikeJwt(token),
        token_iss: payload?.iss ? String(payload.iss) : "",
        token_sub: payload?.sub ? String(payload.sub) : "",
        client_used: "supabase",
      }));
      setTokenIss(payload?.iss ? String(payload.iss) : "");
    };

    (async () => {
      setStatus(t("trackerGps.status.readingSession", { defaultValue: "Reading tracker session…" }));

      let session = null;
      for (let i = 0; i < 15; i++) {
        const { data } = await PRIMARY.auth.getSession();
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
        setStatus(t("trackerGps.status.noSession", { defaultValue: "No active tracker session." }));
        setLastError(t("trackerGps.errors.openFromMagicLinkOnly", { defaultValue: "Open this page only from your Tracker Magic Link." }));
        return;
      }

      setHasSession(true);
      setStatus(t("trackerGps.status.sessionOkPreparing", { defaultValue: "Session OK. Preparing tracker…" }));
      setLastError(null);
    })();

    const { data: sub } = PRIMARY.auth.onAuthStateChange((_event, session) => {
      const tokenB = session?.access_token || "";
      setDebug((d) => ({ ...d, session_exists: !!session }));
      updateDebugFromToken(tokenB);

      if (tokenB && looksLikeJwt(tokenB)) {
        setHasSession(true);
        setStatus(t("trackerGps.status.sessionOkPreparing", { defaultValue: "Session OK. Preparing tracker…" }));
        setLastError(null);
      }
    });

    const unsub = sub?.subscription;
    return () => {
      cancelled = true;
      try {
        unsub?.unsubscribe?.();
      } catch {}
    };
  }, [trackerReady, PRIMARY, t]);

  // 1.5) Onboarding
  useEffect(() => {
    if (!trackerReady || !hasSession || !PRIMARY) return;
    if (!orgId || !isUuid(orgId)) return;
    if (onboardingLockRef.current) return;
    onboardingLockRef.current = true;

    (async () => {
      try {
        setMembershipStatus("pending");
        setMembershipDetail(t("trackerGps.membership.checking", { defaultValue: "Checking membership…" }));

        const { data: sData } = await PRIMARY.auth.getSession();
        const tokenB = sData?.session?.access_token || "";
        const userId = sData?.session?.user?.id || "";

        if (!tokenB || !looksLikeJwt(tokenB) || !userId) {
          setMembershipStatus("failed");
          setMembershipDetail(t("trackerGps.membership.noValidTokenUser", { defaultValue: "No valid token/user in /tracker-gps." }));
          return;
        }

        const ssKey = `${SS_ACCEPTED_PREFIX}${userId}:${orgId}`;
        try {
          if (sessionStorage.getItem(ssKey) === "1") {
            setMembershipStatus("ok");
            setMembershipDetail(t("trackerGps.membership.okSessionCache", { defaultValue: "Membership OK (session cache)." }));
            return;
          }
        } catch {}

        const { data: mRows, error: mErr } = await PRIMARY
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
          setMembershipDetail(t("trackerGps.membership.alreadyExists", { defaultValue: "Membership already exists: role={{role}}", role: m.role }));
          try {
            sessionStorage.setItem(ssKey, "1");
          } catch {}
          return;
        }

        setMembershipDetail(t("trackerGps.membership.runningAccept", { defaultValue: "No membership. Running accept-tracker-invite" }));

        try {
          await invokeFn("accept-tracker-invite", { org_id: orgId });
        } catch (e) {
          setMembershipStatus("failed");
          setMembershipDetail(`accept-tracker-invite error: ${String(e?.message || e)}`);
          return;
        }

        setMembershipStatus("ok");
        setMembershipDetail(t("trackerGps.membership.acceptOk", { defaultValue: "accept-tracker-invite OK." }));
        try {
          sessionStorage.setItem(ssKey, "1");
        } catch {}
      } catch (e) {
        setMembershipStatus("failed");
        setMembershipDetail(`onboarding exception: ${String(e?.message || e)}`);
      } finally {
        onboardingLockRef.current = false;
      }
    })();
  }, [trackerReady, hasSession, orgId, PRIMARY, t]);

  // 2) GPS
  useEffect(() => {
    if (!trackerReady || !hasSession) return;

    if (!("geolocation" in navigator)) {
      setStatus(t("trackerGps.status.noGeolocation", { defaultValue: "This device does not support geolocation." }));
      setLastError(t("trackerGps.errors.geolocationUnavailable", { defaultValue: "Geolocation not available." }));
      return;
    }

    let cancelled = false;

    const handleSuccess = (pos) => {
      if (cancelled) return;

      const c = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
      lastCoordsRef.current = c;
      setCoords(c);

      if (membershipStatus === "ok") setStatus(t("trackerGps.status.active", { defaultValue: "Tracker active" }));
      else if (membershipStatus === "pending") setStatus(t("trackerGps.status.activating", { defaultValue: "Activating tracker in the org…" }));
      else setStatus(t("trackerGps.status.noPermission", { defaultValue: "Tracker without permission / onboarding" }));
    };

    const handleError = (err) => {
      if (cancelled) return;
      setStatus(t("trackerGps.status.gpsError", { defaultValue: "GPS error" }));
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
  }, [trackerReady, hasSession, membershipStatus, t]);

  // 3) Envío
  useEffect(() => {
    if (!trackerReady || !hasSession) return;
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
        const payload = {
          org_id: orgId,
          lat: c.lat,
          lng: c.lng,
          accuracy: c.accuracy,
          source: "tracker-gps-web",
        };

        try {
          await invokeSendPosition(payload);
        } catch (e) {
          setLastError(`send_position error: ${String(e?.message || e)}`);
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
  }, [trackerReady, hasSession, orgId, membershipStatus]);

  const formattedLastSend = lastSend ? lastSend.toLocaleTimeString() : "—";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-start justify-center px-3 py-6">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-4">
        <h1 className="text-lg font-semibold text-center">{t("trackerGps.title", { defaultValue: "Tracker GPS" })}</h1>

        {trackerReady && hasSession && (
          <>
            <div className="mt-4 rounded-xl bg-slate-950 border border-slate-800 p-3 text-sm">
              <div>
                {t("trackerGps.lastSend", { defaultValue: "Last send" })}: {formattedLastSend}
              </div>

              <div className="mt-2 text-[11px] text-slate-400 break-all">
                send: fetch(anon)+x-user-jwt ({debug.send_fn})
              </div>
              <div className="mt-2 text-[11px] text-slate-400 break-all">
                accept: invoke ({debug.accept_fn})
              </div>

              <div className="mt-2 text-[11px] text-slate-400 break-all">org_id: {orgId || "—"}</div>
              <div className="mt-2 text-[11px] text-slate-400 break-all">membership: {membershipStatus}</div>

              {tokenIss ? <div className="mt-2 text-[11px] text-slate-400 break-all">token_iss: {tokenIss}</div> : null}
              {debug.last_token_ttl_sec != null ? (
                <div className="mt-2 text-[11px] text-slate-400 break-all">token_ttl_sec: {debug.last_token_ttl_sec}</div>
              ) : null}
              {debug.last_http_status != null ? (
                <div className="mt-2 text-[11px] text-slate-400 break-all">last_http_status: {debug.last_http_status}</div>
              ) : null}

              {coords ? (
                <div className="mt-2 text-xs text-slate-300">
                  lat: {coords.lat?.toFixed?.(6)} | lng: {coords.lng?.toFixed?.(6)} | acc: {coords.accuracy ?? "—"}
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-400">{t("trackerGps.waitingCoords", { defaultValue: "Waiting for coordinates…" })}</div>
              )}
            </div>

            <details className="mt-4 rounded-xl bg-slate-950 border border-slate-800 p-3">
              <summary className="cursor-pointer text-sm text-slate-200">{t("trackerGps.debugCopyPaste", { defaultValue: "Debug (copy/paste)" })}</summary>
              <pre className="mt-3 text-[11px] text-slate-300 overflow-auto">{JSON.stringify(debug, null, 2)}</pre>
            </details>

            <div className="mt-3 text-xs">
              {t("trackerGps.stateLabel", { defaultValue: "Status" })}: <span className="text-slate-100">{status}</span>
            </div>

            {membershipDetail ? (
              <div className="mt-3 text-[11px] text-slate-200 bg-slate-800/40 border border-slate-700 rounded-xl p-3 whitespace-pre-wrap">
                {membershipDetail}
              </div>
            ) : null}

            {lastError ? (
              <div className="mt-3 text-xs text-amber-300 bg-amber-950/30 border border-amber-800 rounded-xl p-3">{lastError}</div>
            ) : null}
          </>
        )}

        {trackerReady && !hasSession && (
          <div className="mt-4 text-center">
            <p className="text-sm text-slate-300 mb-3">{t("trackerGps.onlyInvited", { defaultValue: "This page is only for invited trackers." })}</p>
            {lastError ? (
              <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-800 rounded-xl p-3 text-left">{lastError}</div>
            ) : null}
            <button onClick={() => navigate("/")} className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-slate-950 font-semibold">
              {t("trackerGps.goHome", { defaultValue: "Go to home" })}
            </button>
          </div>
        )}

        {!trackerReady && (
          <div className="mt-4 text-center">
            <p className="text-sm text-slate-300 mb-3">{t("trackerGps.errors.notConfigured", { defaultValue: "Tracker is not configured in this deployment." })}</p>
            {lastError ? (
              <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-800 rounded-xl p-3 text-left">{lastError}</div>
            ) : null}
            <button onClick={() => navigate("/")} className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-slate-950 font-semibold">
              {t("trackerGps.goHome", { defaultValue: "Go to home" })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}