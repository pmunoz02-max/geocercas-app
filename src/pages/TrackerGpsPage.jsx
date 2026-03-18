import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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

  const tt = (key, fallback, options = {}) => {
    try {
      const value = t(key, { defaultValue: fallback, ...options });
      if (typeof value !== "string") return fallback;
      const normalized = value.trim();
      if (!normalized) return fallback;
      if (normalized === key) return fallback;
      return value;
    } catch {
      return fallback;
    }
  };

  const lang = useMemo(() => {
    try {
      const sp = new URLSearchParams(location.search || "");
      return sanitizeLang(sp.get("lang") || "");
    } catch {
      return "es";
    }
  }, [location.search]);

  const showTrackerDebug = useMemo(() => {
    try {
      const sp = new URLSearchParams(location.search || "");
      const debugQ = String(sp.get("debug") || "").trim().toLowerCase();
      const debugByQuery = debugQ === "1" || debugQ === "true";
      const debugByEnv =
        String(import.meta.env.VITE_TRACKER_DEBUG_UI || "").trim().toLowerCase() === "true";
      return debugByQuery || debugByEnv;
    } catch {
      return String(import.meta.env.VITE_TRACKER_DEBUG_UI || "").trim().toLowerCase() === "true";
    }
  }, [location.search]);

  useEffect(() => {
    (async () => {
      try {
        if (i18n?.resolvedLanguage !== lang) {
          await i18n.changeLanguage(lang);
        }
      } catch {}
    })();
  }, [i18n, lang]);

  const [status, setStatus] = useState("");
  const [coords, setCoords] = useState(null);
  const [lastSend, setLastSend] = useState(null);
  const [lastError, setLastError] = useState(null);

  const [hasSession, setHasSession] = useState(false);
  const [trackerReady, setTrackerReady] = useState(true);
  const [orgId, setOrgId] = useState(null);

  const [membershipStatus, setMembershipStatus] = useState("pending");
  const [membershipDetail, setMembershipDetail] = useState("");
  const [tokenIss, setTokenIss] = useState("");

  const [disclosureAccepted, setDisclosureAccepted] = useState(false);

  const [debug, setDebug] = useState({
    session_exists: null,
    token_looks_jwt: null,
    token_iss: "",
    token_sub: "",
    org_source: "none",
    router_search: "",
    path_orgId: "",
    client_used: "supabase-tracker",
    supabase_url: "",
    send_mode: "send_position:fetch(anon)+x-user-jwt; accept:proxy",
    send_fn: "send_position",
    accept_fn: "/api/accept-tracker-invite",
    last_invoke_fn: "",
    last_invoke_auth: "unknown",
    last_invoke_token_len: 0,
    last_token_ttl_sec: null,
    last_http_status: null,
    disclosure_mode: "always-on-entry",
  });

  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);
  const lastCoordsRef = useRef(null);
  const isSendingRef = useRef(false);
  const lastSentAtRef = useRef(0);
  const onboardingLockRef = useRef(false);
  const didHashSessionRef = useRef(false);
  const acceptInFlightRef = useRef(new Set());

  const PRIMARY = supabaseTracker;

  useEffect(() => {
    setStatus(tt("trackerGps.status.initializing", "Starting tracker…"));
  }, [lang]);

  useEffect(() => {
    if (!PRIMARY) {
      setTrackerReady(false);
      setHasSession(false);
      setStatus(
        tt("trackerGps.errors.notConfigured", "Tracker is not configured in this deployment.")
      );
      setLastError(
        tt("trackerGps.errors.noSupabaseClient", "Tracker Supabase client not found.")
      );
      return;
    }

    setTrackerReady(true);
    setDebug((d) => ({
      ...d,
      supabase_url: (import.meta.env.VITE_SUPABASE_URL || "").trim(),
    }));
  }, [PRIMARY, lang]);

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
      tt(
        "trackerGps.membership.missingOrgId",
        "Missing org_id in URL. Open this page from the invitation link: /tracker-gps?org_id=<ORG_ID>."
      )
    );
  }, [location.search, params?.orgId, lang]);

  useEffect(() => {
    if (!trackerReady || !PRIMARY) return;
    if (didHashSessionRef.current) return;

    const { access_token, refresh_token } = parseHashTokens(window.location.hash);
    if (!access_token || !refresh_token || !looksLikeJwt(access_token)) return;

    didHashSessionRef.current = true;

    (async () => {
      try {
        setStatus(tt("trackerGps.status.processingMagicLink", "Processing Tracker Magic Link…"));

        const { error } = await PRIMARY.auth.setSession({ access_token, refresh_token });
        if (error) {
          setLastError(`${tt("trackerGps.errors.setSession", "setSession error:")} ${error.message}`);
          return;
        }

        for (let i = 0; i < 10; i++) {
          const { data } = await PRIMARY.auth.getSession();
          if (data?.session?.access_token && looksLikeJwt(data.session.access_token)) break;
          await sleep(200);
        }

        window.history.replaceState(
          {},
          document.title,
          window.location.pathname + window.location.search
        );

        setLastError(null);
        setStatus(tt("trackerGps.status.sessionOkPreparing", "Session OK. Preparing tracker…"));
      } catch (e) {
        setLastError(
          `${tt("trackerGps.errors.hashSession", "hash session error:")} ${String(e?.message || e)}`
        );
      }
    })();
  }, [trackerReady, PRIMARY, lang]);

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
        client_used: "supabase-tracker",
      }));
      setTokenIss(payload?.iss ? String(payload.iss) : "");
    };

    (async () => {
      setStatus(tt("trackerGps.status.readingSession", "Reading tracker session…"));

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
        setStatus(tt("trackerGps.status.noSession", "No active tracker session."));
        setLastError(
          tt(
            "trackerGps.errors.openFromMagicLinkOnly",
            "Open this page only from your Tracker Magic Link."
          )
        );
        return;
      }

      setHasSession(true);
      setStatus(tt("trackerGps.status.sessionOkPreparing", "Session OK. Preparing tracker…"));
      setLastError(null);
    })();

    const { data: sub } = PRIMARY.auth.onAuthStateChange((_event, session) => {
      const tokenB = session?.access_token || "";
      setDebug((d) => ({ ...d, session_exists: !!session }));
      updateDebugFromToken(tokenB);

      if (tokenB && looksLikeJwt(tokenB)) {
        setHasSession(true);
        setStatus(tt("trackerGps.status.sessionOkPreparing", "Session OK. Preparing tracker…"));
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
  }, [trackerReady, PRIMARY, lang]);

  async function getFreshJwtOrThrow(label, { minTtlSeconds = 90 } = {}) {
    const now = Math.floor(Date.now() / 1000);

    const { data: s1, error: e1 } = await PRIMARY.auth.getSession();
    if (e1) throw new Error(`getSession error before ${label}: ${e1.message}`);

    let token = s1?.session?.access_token || "";
    let exp = s1?.session?.expires_at || 0;

    if (!token || !looksLikeJwt(token)) {
      throw new Error(`${label} blocked: missing/invalid user JWT`);
    }

    const ttl = exp ? exp - now : 0;

    if (!exp || ttl < minTtlSeconds) {
      const { data: s2, error: e2 } = await PRIMARY.auth.refreshSession();
      if (e2) throw new Error(`refreshSession error before ${label}: ${e2.message}`);
      token = s2?.session?.access_token || "";
      exp = s2?.session?.expires_at || 0;
      if (!token || !looksLikeJwt(token)) {
        throw new Error(`${label} blocked: refresh returned invalid user JWT`);
      }
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
      client_used: "supabase-tracker",
    }));

    return token;
  }

  async function invokeAcceptTrackerInvite(body) {
    const userJwt = await getFreshJwtOrThrow("accept-tracker-invite(proxy)");

    setDebug((d) => ({
      ...d,
      last_invoke_fn: "/api/accept-tracker-invite",
      last_invoke_token_len: userJwt.length,
      last_invoke_auth: "fetch:/api/accept-tracker-invite Authorization=user",
      last_http_status: null,
    }));

    const res = await fetch("/api/accept-tracker-invite", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    setDebug((d) => ({ ...d, last_http_status: res.status }));

    let j = null;
    try {
      j = await res.json();
    } catch {}

    if (!res.ok) {
      const msg = j?.error || j?.message || `HTTP ${res.status}`;
      throw new Error(`accept-tracker-invite http ${res.status}: ${msg}`);
    }

    return j;
  }

  async function invokeSendPosition(body) {
    const sbUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
    const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

    if (!sbUrl || !anon) {
      throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in this deployment");
    }

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
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        "Content-Type": "application/json",
        "x-user-jwt": userJwt,
      },
      body: JSON.stringify(body),
    });

    setDebug((d) => ({ ...d, last_http_status: res.status }));

    let j = null;
    try {
      j = await res.json();
    } catch {}

    if (!res.ok) {
      const msg = j?.error || j?.message || `HTTP ${res.status}`;
      throw new Error(`send_position http ${res.status}: ${msg}`);
    }

    return j;
  }

  const tryAcceptInvite = async (reason = "unknown") => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlOrgId = params.get("org_id");

      if (urlOrgId) {
        localStorage.setItem("geocercas_tracker_org_id", urlOrgId);
        sessionStorage.setItem("geocercas_tracker_org_id", urlOrgId);
      }

      const org_id =
        urlOrgId ||
        localStorage.getItem("geocercas_tracker_org_id") ||
        sessionStorage.getItem("geocercas_tracker_org_id") ||
        "";

      const { data } = await supabaseTracker.auth.getSession();
      const userId = data?.session?.user?.id;

      console.log("[accept-invite] start", { reason, org_id, userId });

      if (!org_id) {
        console.warn("[accept-invite] skipped: missing org_id");
        return false;
      }

      if (!userId) {
        console.warn("[accept-invite] skipped: missing userId");
        return false;
      }

      const dedupeKey = "accept_invite_" + org_id + "_" + userId;
      if (localStorage.getItem(dedupeKey)) {
        console.log("[accept-invite] skipped: deduped", { dedupeKey });
        return true;
      }

      if (acceptInFlightRef.current.has(dedupeKey)) {
        console.log("[accept-invite] skipped: in-flight", { dedupeKey });
        return false;
      }

      acceptInFlightRef.current.add(dedupeKey);

      try {
        const response = await fetch("/api/accept-tracker-invite", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ org_id }),
        });

        const bodyText = await response.text();
        console.log("[accept-invite] response", {
          status: response.status,
          bodyText,
        });

        if (!response.ok) {
          return false;
        }

        localStorage.setItem(dedupeKey, "1");
        console.log("[accept-invite] success", { dedupeKey });
        return true;
      } finally {
        acceptInFlightRef.current.delete(dedupeKey);
      }
    } catch (error) {
      console.error("[accept-invite] failed", error);
      return false;
    }
  };

  useEffect(() => {
    if (!trackerReady || !hasSession || !PRIMARY) return;

    const params = new URLSearchParams(window.location.search);
    const urlOrgId = params.get("org_id") || "";

    if (urlOrgId) {
      localStorage.setItem(LS_TRACKER_ORG_KEY, urlOrgId);
      sessionStorage.setItem(LS_TRACKER_ORG_KEY, urlOrgId);
    }

    const resolvedOrgId = String(
      urlOrgId ||
        localStorage.getItem(LS_TRACKER_ORG_KEY) ||
        sessionStorage.getItem(LS_TRACKER_ORG_KEY) ||
        ""
    ).trim();

    if (!resolvedOrgId || !isUuid(resolvedOrgId)) return;
    if (onboardingLockRef.current) return;
    onboardingLockRef.current = true;

    (async () => {
      const withTimeout = (promise, ms = 4000) =>
        Promise.race([
          promise,
          new Promise((resolve) => {
            window.setTimeout(() => {
              resolve("__timeout__");
            }, ms);
          }),
        ]);

      let clearedLoading = false;
      const finishActivation = (status, detail = "") => {
        clearedLoading = true;
        setMembershipStatus(status);
        setMembershipDetail(detail);
      };

      try {
        const checkingMessage = tt("trackerGps.membership.checking", "Checking membership…");
        setMembershipStatus("pending");
        setMembershipDetail(checkingMessage);

        const { data: sData } = await PRIMARY.auth.getSession();
        const tokenB = sData?.session?.access_token || "";
        const sessionUser = sData?.session?.user || null;
        const userId = sessionUser?.id || "";

        console.log("[tracker-membership] start", { orgId: resolvedOrgId, userId });

        if (userId && resolvedOrgId) {
          await tryAcceptInvite("activation");
        }

        const checkMembership = async () => {
          if (!tokenB || !looksLikeJwt(tokenB) || !userId) return null;

          const ssKey = `${SS_ACCEPTED_PREFIX}${userId}:${resolvedOrgId}`;
          try {
            if (sessionStorage.getItem(ssKey) === "1") {
              return { role: "cached", cached: true };
            }
          } catch {}

          const { data: mRows, error: mErr } = await PRIMARY.from("memberships")
            .select("role, revoked_at, org_id, user_id")
            .eq("org_id", resolvedOrgId)
            .eq("user_id", userId)
            .limit(1);

          if (mErr) {
            throw mErr;
          }

          const membership = (mRows || [])[0];
          if (!membership || membership.revoked_at) {
            return null;
          }

          try {
            sessionStorage.setItem(ssKey, "1");
          } catch {}

          return membership;
        };

        const membershipResult = await withTimeout(checkMembership(), 4000);

        if (membershipResult === "__timeout__") {
          console.warn("[tracker-membership] timeout", { orgId: resolvedOrgId, userId });
          console.warn("[tracker-membership] continue-fail-open", { orgId: resolvedOrgId, userId });
          finishActivation("failed", "");
          return;
        }

        if (!membershipResult) {
          console.warn("[tracker-membership] missing", { orgId: resolvedOrgId, userId });
          console.warn("[tracker-membership] continue-fail-open", { orgId: resolvedOrgId, userId });
          finishActivation("failed", "");
          return;
        }

        console.log("[tracker-membership] ok", {
          orgId: resolvedOrgId,
          userId,
          role: membershipResult.role,
        });
        finishActivation(
          "ok",
          membershipResult.cached
            ? tt("trackerGps.membership.okSessionCache", "Membership OK (session cache).")
            : tt("trackerGps.membership.alreadyExists", "Membership already exists: role={{role}}", {
                role: membershipResult.role,
              })
        );
      } catch (e) {
        console.error("[tracker-membership] failed", {
          orgId: resolvedOrgId,
          message: String(e?.message || e),
        });
        console.warn("[tracker-membership] continue-fail-open", { orgId: resolvedOrgId });
        finishActivation("failed", "");
      } finally {
        if (!clearedLoading) {
          finishActivation("failed", "");
        }
        onboardingLockRef.current = false;
      }
    })();
  }, [trackerReady, hasSession, orgId, PRIMARY, lang]);

  useEffect(() => {
    if (!trackerReady) return;

    let interval;
    let timeout;
    let pollSuccess = false;

    // 1. As soon as session + org_id are available
    if (hasSession && orgId) {
      tryAcceptInvite("activation").then((success) => {
        if (success) {
          pollSuccess = true;
        }
      });
    } else {
      tryAcceptInvite("mount");
    }

    // 2. Reactivo: listener de auth state change
    const { data: sub } = supabaseTracker.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          const success = await tryAcceptInvite("auth-change");
          if (success) {
            pollSuccess = true;
          }
        }
      }
    );

    // 3. Fallback polling
    async function tryPoll() {
      if (pollSuccess) {
        clearInterval(interval);
        clearTimeout(timeout);
        return;
      }
      const success = await tryAcceptInvite("polling");
      if (success) {
        pollSuccess = true;
        clearInterval(interval);
        clearTimeout(timeout);
      }
    }

    interval = setInterval(tryPoll, 1000);

    timeout = setTimeout(() => {
      clearInterval(interval);
    }, 15000);

    return () => {
      sub?.subscription?.unsubscribe();
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [trackerReady, hasSession, orgId]);

  useEffect(() => {
    if (!trackerReady || !hasSession || !disclosureAccepted) return;

    if (!("geolocation" in navigator)) {
      setStatus(tt("trackerGps.status.noGeolocation", "This device does not support geolocation."));
      setLastError(tt("trackerGps.errors.geolocationUnavailable", "Geolocation not available."));
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

      if (membershipStatus === "ok") {
        setStatus(tt("trackerGps.status.active", "Tracker active"));
      } else if (membershipStatus === "pending") {
        setStatus(tt("trackerGps.status.activating", "Activating tracker in the org…"));
      } else {
        setStatus(tt("trackerGps.status.sessionOkPreparing", "Session OK. Preparing tracker…"));
      }
    };

    const handleError = (err) => {
      if (cancelled) return;
      setStatus(tt("trackerGps.status.gpsError", "GPS error"));
      setLastError(err?.message || String(err));
    };

    watchIdRef.current = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });

    return () => {
      cancelled = true;
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [trackerReady, hasSession, membershipStatus, disclosureAccepted, lang]);

  useEffect(() => {
    if (!trackerReady || !hasSession) return;
    if (!disclosureAccepted) return;
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

        const now = Date.now();
        let trackerUserId = "";
        try {
          const { data: sData } = await PRIMARY.auth.getSession();
          trackerUserId = String(sData?.session?.user?.id || "");
        } catch {}

        const org_id = String(orgId || "");
        const user_id = trackerUserId;
        const metricsKey = `tracker_ping_${org_id}_${user_id}`;
        const last = Number(localStorage.getItem(metricsKey) || 0);

        if (org_id && user_id && now - last > 5 * 60 * 1000) {
          try {
            await PRIMARY.from("org_metrics_events").insert({
              org_id,
              user_id,
              event_type: "tracker_active_ping",
              meta: { lat: c.lat, lng: c.lng },
            });
            localStorage.setItem(metricsKey, String(now));
          } catch (_) {
            // ignore metrics errors
          }
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
  }, [trackerReady, hasSession, orgId, membershipStatus, disclosureAccepted]);

  const formattedLastSend = lastSend ? lastSend.toLocaleTimeString() : "—";

  if (trackerReady && hasSession && !disclosureAccepted) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-start justify-center px-3 py-6">
        <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-5">
          <h1 className="text-lg font-semibold text-center">
            {tt("trackerGps.disclosure.title", "Background location")}
          </h1>

          <div className="mt-4 rounded-xl bg-slate-950 border border-slate-800 p-4 text-sm text-slate-200 space-y-4">
            <p>
              {tt(
                "trackerGps.disclosure.body1",
                "App Geocercas collects your location even when the app is closed or the phone is locked in order to record positions and validate geofence entry and exit during the workday."
              )}
            </p>

            <p>
              {tt(
                "trackerGps.disclosure.body2",
                "This information is used only for the organization's operational purposes and is not shared with third parties or used for advertising. You can stop tracking by revoking location permission or signing out."
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setDisclosureAccepted(true);
              setLastError(null);
              setStatus(tt("trackerGps.status.sessionOkPreparing", "Session OK. Preparing tracker…"));
            }}
            className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-3 text-slate-950 font-semibold hover:bg-emerald-400 transition"
          >
            {tt("trackerGps.disclosure.continue", "Continue")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-start justify-center px-3 py-6">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-4">
        <h1 className="text-lg font-semibold text-center">
          {tt("trackerGps.title", "Tracker GPS")}
        </h1>

        {trackerReady && hasSession && (
          <>
            {showTrackerDebug && (
              <>
                <div className="mt-4 rounded-xl bg-slate-950 border border-slate-800 p-3 text-sm">
                  <div>
                    {tt("trackerGps.lastSend", "Last send")}: {formattedLastSend}
                  </div>

                  <div className="mt-2 text-[11px] text-slate-400 break-all">
                    {tt("trackerGps.debugLabels.send", "send")}: fetch(anon)+x-user-jwt ({debug.send_fn})
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400 break-all">
                    {tt("trackerGps.debugLabels.accept", "accept")}: proxy ({debug.accept_fn})
                  </div>

                  <div className="mt-2 text-[11px] text-slate-400 break-all">
                    {tt("trackerGps.debugLabels.orgId", "org_id")}: {orgId || "—"}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400 break-all">
                    {tt("trackerGps.debugLabels.membership", "membership")}: {membershipStatus}
                  </div>

                  {tokenIss ? (
                    <div className="mt-2 text-[11px] text-slate-400 break-all">
                      {tt("trackerGps.debugLabels.tokenIss", "token_iss")}: {tokenIss}
                    </div>
                  ) : null}

                  {debug.last_token_ttl_sec != null ? (
                    <div className="mt-2 text-[11px] text-slate-400 break-all">
                      {tt("trackerGps.debugLabels.tokenTtlSec", "token_ttl_sec")}: {debug.last_token_ttl_sec}
                    </div>
                  ) : null}

                  {debug.last_http_status != null ? (
                    <div className="mt-2 text-[11px] text-slate-400 break-all">
                      {tt("trackerGps.debugLabels.lastHttpStatus", "last_http_status")}: {debug.last_http_status}
                    </div>
                  ) : null}

                  {coords ? (
                    <div className="mt-2 text-xs text-slate-300">
                      {tt("trackerGps.debugLabels.lat", "lat")}: {coords.lat?.toFixed?.(6)} |{" "}
                      {tt("trackerGps.debugLabels.lng", "lng")}: {coords.lng?.toFixed?.(6)} |{" "}
                      {tt("trackerGps.debugLabels.acc", "acc")}: {coords.accuracy ?? "—"}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-slate-400">
                      {tt("trackerGps.waitingCoords", "Waiting for coordinates…")}
                    </div>
                  )}
                </div>

                <details className="mt-4 rounded-xl bg-slate-950 border border-slate-800 p-3">
                  <summary className="cursor-pointer text-sm text-slate-200">
                    {tt("trackerGps.debugCopyPaste", "Debug (copy/paste)")}
                  </summary>
                  <pre className="mt-3 text-[11px] text-slate-300 overflow-auto">
                    {JSON.stringify(debug, null, 2)}
                  </pre>
                </details>
              </>
            )}

            <div className="mt-3 text-xs">
              {tt("trackerGps.stateLabel", "Status")}:{" "}
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
              {tt("trackerGps.onlyInvited", "This page is only for invited trackers.")}
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
              {tt("trackerGps.goHome", "Go to home")}
            </button>
          </div>
        )}

        {!trackerReady && (
          <div className="mt-4 text-center">
            <p className="text-sm text-slate-300 mb-3">
              {tt("trackerGps.errors.notConfigured", "Tracker is not configured in this deployment.")}
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
              {tt("trackerGps.goHome", "Go to home")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
