// src/pages/TrackerGpsPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

// ✅ MISMO CLIENTE QUE AuthCallback (mismo proyecto Supabase PRINCIPAL)
import { supabase } from "../lib/supabaseClient";

const CLIENT_MIN_INTERVAL_MS = 5 * 60 * 1000;
const TICK_MS = 30_000;

const LS_TRACKER_ORG_KEY = "geocercas_tracker_org_id";
const SS_ACCEPTED_PREFIX = "geocercas_tracker_accept_ok:";

function isUuid(v) {
  const s = String(v ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
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
  return {
    access_token: hp.get("access_token") || "",
    refresh_token: hp.get("refresh_token") || "",
  };
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

  // ✅ Idioma desde query: /tracker-gps?...&lang=fr
  const lang = useMemo(() => {
    try {
      const sp = new URLSearchParams(location.search || "");
      return sanitizeLang(sp.get("lang") || "");
    } catch {
      return "es";
    }
  }, [location.search]);

  // ✅ Aplica idioma en runtime (para que esta página responda al lang)
  useEffect(() => {
    (async () => {
      try {
        if (i18n?.resolvedLanguage !== lang) {
          await i18n.changeLanguage(lang);
        }
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

  const [membershipStatus, setMembershipStatus] = useState("pending"); // pending | ok | failed
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
  });

  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);
  const lastCoordsRef = useRef(null);
  const isSendingRef = useRef(false);
  const lastSentAtRef = useRef(0);
  const onboardingLockRef = useRef(false);
  const didHashSessionRef = useRef(false);

  // ✅ Opción A: TODO en el proyecto principal
  const PRIMARY = supabase;

  // ✅ SOLO proyecto principal
  const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
  const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

  // ✅ Forzar API al proyecto principal (elimina mismatch de issuer)
  const API_URL = (SUPABASE_URL || "").replace(/\/$/, "");
  const API_ANON = (SUPABASE_ANON || "").trim();

  const acceptUrl = useMemo(() => {
    if (!API_URL) return null;
    const base = `${API_URL}/functions/v1/accept-tracker-invite`;
    if (orgId && isUuid(orgId)) return `${base}?org_id=${encodeURIComponent(orgId)}`;
    return base;
  }, [API_URL, orgId]);

  const sendUrl = useMemo(() => {
    if (!API_URL) return null;
    return `${API_URL}/functions/v1/send_position`;
  }, [API_URL]);

  // 0) Config
  useEffect(() => {
    setDebug((d) => ({
      ...d,
      supabase_url: API_URL || "",
    }));

    if (!PRIMARY) {
      setTrackerReady(false);
      setHasSession(false);
      setStatus(t("trackerGps.errors.notConfigured", { defaultValue: "Tracker is not configured in this deployment." }));
      setLastError(t("trackerGps.errors.noSupabaseClient", { defaultValue: "Primary Supabase client not found." }));
      return;
    }

    if (!API_URL || !API_ANON) {
      setTrackerReady(false);
      setHasSession(false);
      setStatus(t("trackerGps.errors.notConfigured", { defaultValue: "Tracker is not configured in this deployment." }));
      setLastError(
        t("trackerGps.errors.missingEnv", {
          defaultValue: "Missing env vars: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.",
        })
      );
      return;
    }

    setTrackerReady(true);
  }, [API_URL, API_ANON, PRIMARY, t]);

  // 0.2) Org: PATH (si existe) luego query
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
        defaultValue:
          "Missing org_id in URL. Open this page from the invitation link: /tracker-gps?org_id=<ORG_ID>.",
      })
    );
  }, [location?.search, params?.orgId, t]);

  // 0.3) Si viene magic link con tokens en HASH, crear sesión en PRIMARY
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

        // limpia hash
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

        setLastError(null);
        setStatus(t("trackerGps.status.sessionOkPreparing", { defaultValue: "Session OK. Preparing tracker…" }));
      } catch (e) {
        setLastError(
          t("trackerGps.errors.hashSession", { defaultValue: "hash session error:" }) +
            ` ${String(e?.message || e)}`
        );
      }
    })();
  }, [trackerReady, PRIMARY, t]);

  // 1) Sesión (PRIMARY)
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
      for (let i = 0; i < 10; i++) {
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
        setLastError(
          t("trackerGps.errors.openFromMagicLinkOnly", {
            defaultValue: "Open this page only from your Tracker Magic Link.",
          })
        );
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

  // 1.5) Onboarding: validar membership y si falta, ejecutar accept-tracker-invite
  useEffect(() => {
    if (!trackerReady || !hasSession || !PRIMARY) return;
    if (!orgId || !isUuid(orgId)) return;

    if (!acceptUrl) {
      setMembershipStatus("failed");
      setMembershipDetail(t("trackerGps.membership.noAcceptUrl", { defaultValue: "Could not build acceptUrl." }));
      return;
    }

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
          setMembershipDetail(
            t("trackerGps.membership.noValidTokenUser", { defaultValue: "No valid token/user in /tracker-gps." })
          );
          return;
        }

        const ssKey = `${SS_ACCEPTED_PREFIX}${userId}:${orgId}`;
        try {
          if (sessionStorage.getItem(ssKey) === "1") {
            setMembershipStatus("ok");
            setMembershipDetail(
              t("trackerGps.membership.okSessionCache", { defaultValue: "Membership OK (session cache)." })
            );
            return;
          }
        } catch {}

        // 1) membership directa
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
          setMembershipDetail(
            t("trackerGps.membership.alreadyExists", {
              defaultValue: "Membership already exists: role={{role}}",
              role: m.role,
            })
          );
          try {
            sessionStorage.setItem(ssKey, "1");
          } catch {}
          return;
        }

        // 2) accept-tracker-invite (edge function) — MISMO proyecto
        setMembershipDetail(
          t("trackerGps.membership.runningAccept", { defaultValue: "No membership. Running accept-tracker-invite…" })
        );

        const resp = await fetch(acceptUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: API_ANON,
            "x-api-key": API_ANON,
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

        // Re-chequeo
        const { data: m2Rows } = await PRIMARY
          .from("memberships")
          .select("role, revoked_at")
          .eq("org_id", orgId)
          .eq("user_id", userId)
          .limit(1);

        const m2 = (m2Rows || [])[0];
        if (m2 && !m2.revoked_at) {
          setMembershipStatus("ok");
          setMembershipDetail(
            t("trackerGps.membership.acceptOkRole", {
              defaultValue: "accept-tracker-invite OK. role={{role}}",
              role: m2.role,
            })
          );
        } else {
          setMembershipStatus("ok");
          setMembershipDetail(
            t("trackerGps.membership.acceptOk", { defaultValue: "accept-tracker-invite OK: {{text}}", text: text || "ok" })
          );
        }

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
  }, [trackerReady, hasSession, acceptUrl, API_ANON, orgId, PRIMARY, t]);

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

      const c = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
      };
      lastCoordsRef.current = c;
      setCoords(c);

      if (membershipStatus === "ok") setStatus(t("trackerGps.status.active", { defaultValue: "Tracker active" }));
      else if (membershipStatus === "pending")
        setStatus(t("trackerGps.status.activating", { defaultValue: "Activating tracker in the org…" }));
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
        const { data: sData } = await PRIMARY.auth.getSession();
        const tokenB = sData?.session?.access_token || "";

        if (!tokenB || !looksLikeJwt(tokenB)) {
          setLastError(t("trackerGps.errors.sendNoValidToken", { defaultValue: "send_position: no valid token in /tracker-gps" }));
          return;
        }

        const payload = {
          org_id: orgId, // ignorado server-owned
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
            apikey: API_ANON,
            "x-api-key": API_ANON,
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
  }, [trackerReady, hasSession, sendUrl, API_ANON, orgId, membershipStatus, PRIMARY, t]);

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
                {t("trackerGps.diag.sendUrl", { defaultValue: "send_url" })}: {sendUrl || "—"}
              </div>
              <div className="mt-2 text-[11px] text-slate-400 break-all">
                {t("trackerGps.diag.orgId", { defaultValue: "org_id" })}: {orgId || "—"}
              </div>
              <div className="mt-2 text-[11px] text-slate-400 break-all">
                {t("trackerGps.diag.membership", { defaultValue: "membership" })}: {membershipStatus}
              </div>

              {tokenIss ? (
                <div className="mt-2 text-[11px] text-slate-400 break-all">
                  {t("trackerGps.diag.tokenIss", { defaultValue: "token_iss" })}: {tokenIss}
                </div>
              ) : null}

              {coords ? (
                <div className="mt-2 text-xs text-slate-300">
                  {t("trackerGps.diag.lat", { defaultValue: "lat" })}: {coords.lat?.toFixed?.(6)} |{" "}
                  {t("trackerGps.diag.lng", { defaultValue: "lng" })}: {coords.lng?.toFixed?.(6)} |{" "}
                  {t("trackerGps.diag.acc", { defaultValue: "acc" })}: {coords.accuracy ?? "—"}
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-400">{t("trackerGps.waitingCoords", { defaultValue: "Waiting for coordinates…" })}</div>
              )}
            </div>

            <details className="mt-4 rounded-xl bg-slate-950 border border-slate-800 p-3">
              <summary className="cursor-pointer text-sm text-slate-200">
                {t("trackerGps.debugCopyPaste", { defaultValue: "Debug (copy/paste)" })}
              </summary>
              <pre className="mt-3 text-[11px] text-slate-300 overflow-auto">{JSON.stringify(debug, null, 2)}</pre>
            </details>

            <div className="mt-3 text-xs">
              {t("trackerGps.stateLabel", { defaultValue: "Status" })}:{" "}
              <span className="text-slate-100">{status}</span>
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
            <p className="text-sm text-slate-300 mb-3">
              {t("trackerGps.onlyInvited", { defaultValue: "This page is only for invited trackers." })}
            </p>

            {lastError ? (
              <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-800 rounded-xl p-3 text-left">
                {lastError}
              </div>
            ) : null}

            <button
              onClick={() => navigate("/")}
              className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-slate-950 font-semibold"
            >
              {t("trackerGps.goHome", { defaultValue: "Go to home" })}
            </button>
          </div>
        )}

        {!trackerReady && (
          <div className="mt-4 text-center">
            <p className="text-sm text-slate-300 mb-3">
              {t("trackerGps.errors.notConfigured", { defaultValue: "Tracker is not configured in this deployment." })}
            </p>

            {lastError ? (
              <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-800 rounded-xl p-3 text-left">
                {lastError}
              </div>
            ) : null}

            <button
              onClick={() => navigate("/")}
              className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-slate-950 font-semibold"
            >
              {t("trackerGps.goHome", { defaultValue: "Go to home" })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
