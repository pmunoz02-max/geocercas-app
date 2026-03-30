import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import UpgradeToProButton from "../components/Billing/UpgradeToProButton";
import { supabaseTracker } from "../lib/supabaseTrackerClient";

const CLIENT_MIN_INTERVAL_MS = 5 * 60 * 1000;
const TICK_MS = 30_000;

const LS_TRACKER_ORG_KEY = "geocercas_tracker_org_id";
const SS_ACCEPTED_PREFIX = "geocercas_tracker_accept_ok:";
const WATCHDOG_RELOAD_COOLDOWN_KEY = "geocercas_tracker_watchdog_reload_cooldown";
const WATCHDOG_RELOAD_COOLDOWN_MS = 10 * 60 * 1000;

function deriveTrackerVisualStatus({
  hasSession,
  trackerReady,
  assignmentWindowStatus,
  assignmentLoadError,
  hasRecentSuccessfulSend,
  hasAnySuccessfulSend,
  isWatchdogRecovering,
}) {
  if (!trackerReady) return "Tracker not ready";
  if (!hasSession) return "No active tracker session";
  if (assignmentLoadError && assignmentLoadError !== "assignment_load_timeout") {
    return "Assignment error";
  }

  switch (assignmentWindowStatus) {
    case "inactive":
      return "No active assignment";
    case "active":
      if (isWatchdogRecovering) return "Recovering tracker...";
      if (!hasAnySuccessfulSend) return "Waiting first send...";
      if (!hasRecentSuccessfulSend) return "Tracker stalled";
      return "Tracker ready";
    case "expired":
      return "Assignment ended";
    default:
      return "Preparing tracker...";
  }
}

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

function parseLocalDateBoundary(dateStr, endOfDay = false) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s) return null;
  const d = new Date(`${s}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isAssignmentActiveNow(row, now = new Date()) {
  if (!row || row.active !== true) return false;
  const start = parseLocalDateBoundary(row.start_date, false);
  const end = parseLocalDateBoundary(row.end_date, true);
  if (!start || !end) return false;
  return now >= start && now <= end;
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
  const [session, setSession] = useState(null);
  const [trackerReady, setTrackerReady] = useState(true);
  const [orgId, setOrgId] = useState(null);
  const [lastPosition, setLastPosition] = useState(null);

  const [membershipStatus, setMembershipStatus] = useState("pending");
  const [membershipDetail, setMembershipDetail] = useState("");
  const [tokenIss, setTokenIss] = useState("");
  const [isActivationBgRunning, setIsActivationBgRunning] = useState(false);
  const [trackerAccessToken, setTrackerAccessToken] = useState("");
  const [disclosureAccepted, setDisclosureAccepted] = useState(true);

  const [acceptError, setAcceptError] = useState("");
  const [acceptErrorCode, setAcceptErrorCode] = useState("");
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [activeAssignment, setActiveAssignment] = useState(null);
  const [assignmentWindowStatus, setAssignmentWindowStatus] = useState("unknown");
  const [assignmentLoadState, setAssignmentLoadState] = useState("idle");
  const [assignmentLoadError, setAssignmentLoadError] = useState("");

  const [isWatchdogRecovering, setIsWatchdogRecovering] = useState(false);

  const [trackerDiag, setTrackerDiag] = useState({
    lastSendOk: null,
    lastSendAttempt: null,
    lastSendFailure: null,
    watchdogRecoveryCount: 0,
    lastWatchdogAction: null,
    lastReloadReason: null,
  });

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
  const lastCoordsRef = useRef(null);
  const isSendingRef = useRef(false);
  const lastSentAtRef = useRef(0);
  const lastSendOkAtRef = useRef(0);
  const heartbeatIntervalRef = useRef(null);
  const watchdogIntervalRef = useRef(null);
  const onboardingLockRef = useRef(false);
  const didHashSessionRef = useRef(false);
  const acceptInFlightRef = useRef(new Set());
  const blockingUiLoggedRef = useRef(false);

  const PRIMARY = supabaseTracker;

  const resolvedSendIntervalMs = useMemo(() => {
    const n = Number(activeAssignment?.frequency_minutes);
    return Number.isFinite(n) && n > 0 ? n * 60 * 1000 : CLIENT_MIN_INTERVAL_MS;
  }, [activeAssignment]);

  const hasAnySuccessfulSend = !!lastSendOkAtRef.current;
  const hasRecentSuccessfulSend =
    !!lastSendOkAtRef.current &&
    Date.now() - lastSendOkAtRef.current <= resolvedSendIntervalMs * 2;

  const visualStatus = useMemo(() => {
    return deriveTrackerVisualStatus({
      hasSession,
      trackerReady,
      assignmentWindowStatus,
      assignmentLoadError,
      hasRecentSuccessfulSend,
      hasAnySuccessfulSend,
      isWatchdogRecovering,
    });
  }, [
    hasSession,
    trackerReady,
    assignmentWindowStatus,
    assignmentLoadError,
    hasRecentSuccessfulSend,
    hasAnySuccessfulSend,
    isWatchdogRecovering,
  ]);

  useEffect(() => {
    if (!PRIMARY) {
      setTrackerReady(false);
      setHasSession(false);
      setSession(null);
      setLastError("Tracker Supabase client not found.");
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
      } catch (e) {
        setLastError(
          `${tt("trackerGps.errors.hashSession", "hash session error:")} ${String(e?.message || e)}`
        );
      }
    })();
  }, [trackerReady, PRIMARY, lang]);

  useEffect(() => {
    let mounted = true;

    const loadTrackerToken = async () => {
      try {
        const { data } = await supabaseTracker.auth.getSession();
        const token = data?.session?.access_token || "";
        const userId = data?.session?.user?.id || "";
        console.log("[gps-auth] preload token present", !!token);
        console.log("[gps-auth] preload tracker user", userId || "(none)");
        if (mounted) setTrackerAccessToken(token);
      } catch (error) {
        console.error("[gps-auth] preload failed", error);
      }
    };

    loadTrackerToken();

    const { data: sub } = supabaseTracker.auth.onAuthStateChange((_event, nextSession) => {
      const token = nextSession?.access_token || "";
      const userId = nextSession?.user?.id || "";
      console.log("[gps-auth] auth change token present", !!token);
      console.log("[gps-auth] auth change tracker user", userId || "(none)");
      setTrackerAccessToken(token);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    console.log("[activation-gate] disabled");
    console.log("[activation-gate] source=TrackerGpsPage");
  }, []);

  useEffect(() => {
    if (!isActivationBgRunning) return;
    if (blockingUiLoggedRef.current) return;
    console.warn("[tracker-activation-ui] background sync running without blocking UI", {
      source: "TrackerGpsPage",
    });
    blockingUiLoggedRef.current = true;
  }, [isActivationBgRunning]);

  useEffect(() => {
    const t = setTimeout(() => {
      console.warn("[tracker-init] force unblock");
      setIsActivationBgRunning(false);
      setMembershipStatus((prev) => (prev === "pending" ? "ok" : prev));
    }, 1000);
    return () => clearTimeout(t);
  }, []);

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
      let nextSession = null;
      for (let i = 0; i < 15; i++) {
        const { data } = await PRIMARY.auth.getSession();
        nextSession = data?.session ?? null;
        if (nextSession?.access_token) break;
        await sleep(150);
      }
      if (cancelled) return;

      const tokenB = nextSession?.access_token || "";
      const ok = !!tokenB && looksLikeJwt(tokenB);

      setDebug((d) => ({ ...d, session_exists: !!nextSession }));
      updateDebugFromToken(tokenB);

      if (!ok) {
        setSession(null);
        setHasSession(false);
        setLastError(
          tt(
            "trackerGps.errors.openFromMagicLinkOnly",
            "Open this page only from your Tracker Magic Link."
          )
        );
        return;
      }

      setSession(nextSession);
      setHasSession(true);
      setLastError(null);
    })();

    const { data: sub } = PRIMARY.auth.onAuthStateChange((_event, nextSession) => {
      const tokenB = nextSession?.access_token || "";
      setDebug((d) => ({ ...d, session_exists: !!nextSession }));
      updateDebugFromToken(tokenB);

      if (tokenB && looksLikeJwt(tokenB)) {
        setSession(nextSession);
        setHasSession(true);
        setLastError(null);
      } else {
        setSession(null);
        setHasSession(false);
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

  const loadActiveAssignment = async (authTokenOverride = "") => {
    const effectiveToken = String(authTokenOverride || trackerAccessToken || "").trim();
    if (!trackerReady || !orgId || !effectiveToken) return;

    console.log("[assignment-window] loading");
    console.log("[assignment-window] query:start", { orgId });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("assignment_load_timeout")), 8000)
    );

    const fetchPromise = fetch("/api/tracker-active-assignment", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${effectiveToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ org_id: orgId }),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`backend_error_${res.status}`);
      return res.json();
    });

    const result = await Promise.race([fetchPromise, timeoutPromise]);

    // Use tracker_assignment as source of truth if present
    if (result.ok && result.tracker_assignment) {
      setActiveAssignment(result.tracker_assignment);
      setAssignmentWindowStatus(result.tracker_assignment.active ? "active" : "expired");
      setAssignmentLoadState(result.tracker_assignment.active ? "active" : "inactive");
      setAssignmentLoadError("");
    } else if (result.ok && result.active && result.assignment) {
      // Fallback: legacy assignment logic
      const activeNow = isAssignmentActiveNow(result.assignment);
      setActiveAssignment(result.assignment);
      setAssignmentWindowStatus(activeNow ? "active" : "expired");
      setAssignmentLoadState(activeNow ? "active" : "inactive");
      setAssignmentLoadError("");
    } else if (result.ok && !result.active) {
      setActiveAssignment(null);
      setAssignmentWindowStatus("inactive");
      setAssignmentLoadState("inactive");
      setAssignmentLoadError("");
    } else {
      throw new Error(result.error || "unknown_error");
    }
  };

  useEffect(() => {
    if (!trackerReady || !orgId || !trackerAccessToken) return;

    let cancelled = false;

    (async () => {
      try {
        await loadActiveAssignment(trackerAccessToken);
      } catch (error) {
        if (error?.message === "assignment_load_timeout") {
          console.error("[assignment-window] timeout");
        }
        console.error("[assignment-window] load failed", error);
        if (!cancelled) {
          setActiveAssignment(null);
          setAssignmentWindowStatus("inactive");
          setAssignmentLoadState("inactive");
          setAssignmentLoadError(error?.message || "Assignment load failed");
        }
      } finally {
        console.log("[assignment-window] done");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [trackerReady, orgId, trackerAccessToken]);

  useEffect(() => {
    if (assignmentWindowStatus !== "active") {
      if (watchIdRef.current != null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (watchdogIntervalRef.current) {
        clearInterval(watchdogIntervalRef.current);
        watchdogIntervalRef.current = null;
      }
      console.log("[assignment-window] tracking stopped");
    }
  }, [assignmentWindowStatus, activeAssignment]);

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

    setTrackerAccessToken(token);

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
    setTrackerDiag((d) => ({
      ...d,
      lastSendAttempt: Date.now(),
    }));

    console.log("[send-position] invoke:start", {
      hasOrg: !!body?.org_id,
      hasLat: Number.isFinite(Number(body?.lat)),
      hasLng: Number.isFinite(Number(body?.lng)),
    });

    let timeoutId = null;
    let controller = null;

    try {
      const freshToken = await getFreshJwtOrThrow("send_position");
      const trackerUserId = String(decodeJwtPayload(freshToken)?.sub || "").trim();

      if (!body?.org_id) return null;
      if (!Number.isFinite(Number(body?.lat)) || !Number.isFinite(Number(body?.lng))) return null;
      if (!trackerUserId) return null;
      if (!freshToken) return null;

      setDebug((d) => ({
        ...d,
        last_invoke_fn: "send_position",
        last_invoke_token_len: freshToken.length,
        last_invoke_auth: "fetch:Authorization=user",
        last_http_status: null,
      }));

      controller = new AbortController();
      timeoutId = setTimeout(() => {
        controller?.abort();
      }, 5000);

      const res = await fetch("/api/send-position", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${freshToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      setDebug((d) => ({ ...d, last_http_status: res.status }));

      let j = null;
      try {
        j = await res.json();
      } catch {}

      if (!res.ok) {
        const msg = j?.error || j?.message || `HTTP ${res.status}`;
        setTrackerDiag((d) => ({
          ...d,
          lastSendFailure: `${new Date().toISOString()} ${msg}`,
        }));
        throw new Error(`send_position http ${res.status}: ${msg}`);
      }

      setTrackerDiag((d) => ({
        ...d,
        lastSendOk: Date.now(),
        lastSendFailure: null,
      }));

      return j;
    } catch (e) {
      setTrackerDiag((d) => ({
        ...d,
        lastSendFailure: `${new Date().toISOString()} ${String(e?.message || e)}`,
      }));
      throw e;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  const tryAcceptInvite = async (reason = "unknown") => {
    setAcceptError("");
    setAcceptErrorCode("");
    setUpgradeRequired(false);
    try {
      const params = new URLSearchParams(window.location.search);
      const urlOrgId = params.get("org_id");

      if (urlOrgId) {
        localStorage.setItem(LS_TRACKER_ORG_KEY, urlOrgId);
        sessionStorage.setItem(LS_TRACKER_ORG_KEY, urlOrgId);
      }

      const savedAccepted = sessionStorage.getItem(`${SS_ACCEPTED_PREFIX}${urlOrgId || ""}`) || "";
      if (savedAccepted === "1") return true;

      const org_id =
        urlOrgId ||
        localStorage.getItem(LS_TRACKER_ORG_KEY) ||
        sessionStorage.getItem(LS_TRACKER_ORG_KEY) ||
        "";

      const { data } = await supabaseTracker.auth.getSession();
      const userId = data?.session?.user?.id;

      console.log("[accept-invite] start", { reason, org_id, userId });

      if (!org_id) return false;
      if (!userId) return false;

      const dedupeKey = "accept_invite_" + org_id + "_" + userId;
      if (localStorage.getItem(dedupeKey)) {
        sessionStorage.setItem(`${SS_ACCEPTED_PREFIX}${org_id}`, "1");
        return true;
      }

      if (acceptInFlightRef.current.has(dedupeKey)) return false;

      acceptInFlightRef.current.add(dedupeKey);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);

      try {
        const response = await fetch("/api/accept-tracker-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ org_id }),
          signal: controller.signal,
        });

        let payload = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (!response.ok || payload?.ok === false) {
          if (payload?.code === "TRACKER_LIMIT_REACHED") {
            setAcceptError(
              "Has alcanzado el límite de trackers de tu plan. Actualiza a PRO para agregar más trackers."
            );
            setAcceptErrorCode("TRACKER_LIMIT_REACHED");
            setUpgradeRequired(true);
            return false;
          }
          setAcceptError(payload?.message || payload?.error || `HTTP ${response.status}`);
          setAcceptErrorCode(payload?.code || "");
          setUpgradeRequired(false);
          return false;
        }

        localStorage.setItem(dedupeKey, "1");
        sessionStorage.setItem(`${SS_ACCEPTED_PREFIX}${org_id}`, "1");
        return true;
      } catch (error) {
        if (error?.name === "AbortError") return false;
        setAcceptError(String(error?.message || error));
        setAcceptErrorCode("");
        setUpgradeRequired(false);
        return false;
      } finally {
        clearTimeout(timer);
        acceptInFlightRef.current.delete(dedupeKey);
      }
    } catch {
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

    let cancelled = false;

    (async () => {
      try {
        setIsActivationBgRunning(true);
        const { data: sData } = await PRIMARY.auth.getSession();
        const sessionUser = sData?.session?.user || null;
        const userId = sessionUser?.id || "";

        if (userId && resolvedOrgId) {
          await tryAcceptInvite("background");
        }
      } finally {
        if (!cancelled) {
          setIsActivationBgRunning(false);
          setMembershipStatus("ok");
          setMembershipDetail("");
        }
        onboardingLockRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [trackerReady, hasSession, orgId, PRIMARY, lang]);

  useEffect(() => {
    if (!trackerReady) return;

    let interval;
    let timeout;
    let pollSuccess = false;

    if (hasSession && orgId) {
      tryAcceptInvite("activation").then((success) => {
        if (success) pollSuccess = true;
      });
    } else {
      tryAcceptInvite("mount");
    }

    const { data: sub } = supabaseTracker.auth.onAuthStateChange(async (_event, nextSession) => {
      if (nextSession?.user) {
        const success = await tryAcceptInvite("auth-change");
        if (success) pollSuccess = true;
      }
    });

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
      sub?.subscription?.unsubscribe?.();
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [trackerReady, hasSession, orgId]);

  useEffect(() => {
    if (!trackerReady || !hasSession || !disclosureAccepted) return;
    if (assignmentWindowStatus !== "active") return;

    async function startTracking() {
      if (!("geolocation" in navigator)) {
        setStatus(tt("trackerGps.status.noGeolocation", "This device does not support geolocation."));
        setLastError(tt("trackerGps.errors.geolocationUnavailable", "Geolocation not available."));
        return;
      }

      if (navigator.permissions?.query) {
        try {
          await navigator.permissions.query({ name: "geolocation" });
        } catch {}
      }

      try {
        const oneShot = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 15000,
          });
        });

        const c = {
          lat: oneShot.coords.latitude,
          lng: oneShot.coords.longitude,
          accuracy: oneShot.coords.accuracy ?? null,
        };

        lastCoordsRef.current = c;
        setCoords(c);
        setLastPosition({
          lat: oneShot.coords.latitude,
          lng: oneShot.coords.longitude,
          accuracy: oneShot.coords.accuracy ?? null,
          speed: oneShot.coords.speed ?? null,
          heading: oneShot.coords.heading ?? null,
          timestamp: oneShot.timestamp,
        });
      } catch (err) {
        console.warn("[gps] position error", err?.message || err);
      }
    }

    let trackingCancelled = false;

    const handleSuccess = (pos) => {
      if (trackingCancelled) return;

      const c = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
      };

      setLastPosition({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        speed: pos.coords.speed ?? null,
        heading: pos.coords.heading ?? null,
        timestamp: pos.timestamp,
      });
      lastCoordsRef.current = c;
      setCoords(c);
    };

    const handleError = (err) => {
      if (trackingCancelled) return;
      setStatus(tt("trackerGps.status.gpsError", "GPS error"));
      setLastError(err?.message || String(err));
    };

    startTracking();

    if (watchIdRef.current != null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });

    return () => {
      trackingCancelled = true;
      if (watchIdRef.current != null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [
    trackerReady,
    hasSession,
    disclosureAccepted,
    assignmentWindowStatus,
    membershipStatus,
    lang,
  ]);

  useEffect(() => {
    console.log("[send-gate] evaluate", {
      hasLastPosition: !!lastPosition,
      sessionUserId: session?.user?.id || "",
      orgId: orgId || "",
      trackerReady,
      hasSession,
      disclosureAccepted,
      membershipStatus,
      assignmentWindowStatus,
      isSending: isSendingRef.current,
      resolvedSendIntervalMs,
      lastSentAt: lastSentAtRef.current || 0,
      now: Date.now(),
    });

    if (!lastPosition) {
      console.log("[send-gate] blocked:no-lastPosition");
      return;
    }
    if (!session?.user?.id) {
      console.log("[send-gate] blocked:no-session-user");
      return;
    }
    if (!orgId) {
      console.log("[send-gate] blocked:no-org");
      return;
    }
    if (!trackerReady) {
      console.log("[send-gate] blocked:not-ready");
      return;
    }
    if (!hasSession) {
      console.log("[send-gate] blocked:no-session");
      return;
    }
    if (!disclosureAccepted) {
      console.log("[send-gate] blocked:no-disclosure");
      return;
    }
    if (membershipStatus !== "ok") {
      console.log("[send-gate] blocked:membership-not-ok");
      return;
    }
    if (assignmentWindowStatus !== "active") {
      console.log("[send-gate] blocked:assignment-not-active");
      return;
    }
    if (isSendingRef.current) {
      console.log("[send-gate] blocked:already-sending");
      return;
    }

    const c = {
      lat: lastPosition.lat,
      lng: lastPosition.lng,
      accuracy: lastPosition.accuracy,
    };

    const now = Date.now();
    if (now - lastSentAtRef.current < resolvedSendIntervalMs) return;

    let cancelled = false;

    (async () => {
      isSendingRef.current = true;
      try {
        const payload = {
          org_id: orgId,
          lat: c.lat,
          lng: c.lng,
          accuracy: c.accuracy,
          timestamp: lastPosition.timestamp ?? Date.now(),
          source: "tracker-gps-web",
        };

        console.log("[send-gate] sending", payload);

        try {
          await invokeSendPosition(payload);
        } catch (e) {
          if (!cancelled) setLastError(`send_position error: ${String(e?.message || e)}`);
          return;
        }

        const successAt = Date.now();
        if (!cancelled) {
          lastSentAtRef.current = successAt;
          lastSendOkAtRef.current = successAt;
          setLastSend(new Date(successAt));
          setLastError(null);
          setIsWatchdogRecovering(false);
          setTrackerDiag((d) => ({
            ...d,
            lastSendOk: successAt,
          }));
        }
      } finally {
        isSendingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    lastPosition,
    session?.user?.id,
    orgId,
    trackerReady,
    hasSession,
    disclosureAccepted,
    membershipStatus,
    assignmentWindowStatus,
    resolvedSendIntervalMs,
  ]);

  useEffect(() => {
    if (!trackerReady || !hasSession || !orgId) return;
    if (!disclosureAccepted) return;
    if (membershipStatus !== "ok") return;
    if (assignmentWindowStatus !== "active") return;
    if (heartbeatIntervalRef.current) return;

    console.log("[heartbeat] started");

    heartbeatIntervalRef.current = setInterval(async () => {
      try {
        const c = lastCoordsRef.current;
        if (!c) {
          console.log("[heartbeat] skipped: no last coords");
          return;
        }
        const now = Date.now();
        if (now - lastSentAtRef.current < resolvedSendIntervalMs) return;
        if (isSendingRef.current) return;

        console.log("[heartbeat] forcing send");
        isSendingRef.current = true;

        await invokeSendPosition({
          org_id: orgId,
          lat: c.lat,
          lng: c.lng,
          accuracy: c.accuracy,
          timestamp: now,
          source: "tracker-heartbeat",
        });

        lastSentAtRef.current = now;
        lastSendOkAtRef.current = now;
        setLastSend(new Date(now));
        setLastError(null);
        setIsWatchdogRecovering(false);
        setTrackerDiag((d) => ({
          ...d,
          lastSendOk: now,
        }));
      } catch (e) {
        console.warn("[heartbeat] send failed", e?.message || e);
      } finally {
        isSendingRef.current = false;
      }
    }, TICK_MS);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [
    trackerReady,
    hasSession,
    orgId,
    disclosureAccepted,
    membershipStatus,
    assignmentWindowStatus,
    resolvedSendIntervalMs,
  ]);

  useEffect(() => {
    if (!trackerReady || !hasSession) return;
    if (!disclosureAccepted) return;
    if (assignmentWindowStatus !== "active") return;
    if (watchdogIntervalRef.current) return;

    console.log("[watchdog] started");

    watchdogIntervalRef.current = setInterval(async () => {
      const now = Date.now();
      const lastOk = lastSendOkAtRef.current || 0;
      const sinceOk = lastOk ? now - lastOk : Number.MAX_SAFE_INTEGER;
      const missedIntervals = Math.floor(sinceOk / resolvedSendIntervalMs);

      if (lastOk && sinceOk <= resolvedSendIntervalMs * 2) {
        setIsWatchdogRecovering(false);
        return;
      }

      if (missedIntervals < 3) return;

      if (missedIntervals === 3) {
        setIsWatchdogRecovering(true);
        setTrackerDiag((d) => ({
          ...d,
          watchdogRecoveryCount: Number(d.watchdogRecoveryCount || 0) + 1,
          lastWatchdogAction: `${new Date().toISOString()} recovery-start`,
        }));

        try {
          const freshToken = await getFreshJwtOrThrow("watchdog-recovery");

          setTrackerDiag((d) => ({
            ...d,
            lastWatchdogAction: `${new Date().toISOString()} session-refreshed`,
          }));

          try {
            await loadActiveAssignment(freshToken);
            setTrackerDiag((d) => ({
              ...d,
              lastWatchdogAction: `${new Date().toISOString()} assignment-reloaded`,
            }));
          } catch (e) {
            console.warn("[watchdog] assignment reload failed", e);
          }

          if ("geolocation" in navigator) {
            try {
              if (watchIdRef.current != null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
              }

              watchIdRef.current = navigator.geolocation.watchPosition(
                (pos) => {
                  console.log("[watchdog] recovered GPS");
                  const c = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy ?? null,
                  };
                  lastCoordsRef.current = c;
                  setCoords(c);
                  setLastPosition({
                    lat: c.lat,
                    lng: c.lng,
                    accuracy: c.accuracy,
                    speed: pos.coords.speed ?? null,
                    heading: pos.coords.heading ?? null,
                    timestamp: pos.timestamp,
                  });
                },
                (err) => {
                  console.warn("[watchdog] restart error", err?.message || err);
                },
                {
                  enableHighAccuracy: true,
                  maximumAge: 0,
                  timeout: 20000,
                }
              );

              setTrackerDiag((d) => ({
                ...d,
                lastWatchdogAction: `${new Date().toISOString()} gps-restarted`,
              }));
            } catch (e) {
              console.error("[watchdog] restart failed", e);
            }
          }
        } catch (e) {
          console.warn("[watchdog] recovery failed", e);
          setTrackerDiag((d) => ({
            ...d,
            lastWatchdogAction: `${new Date().toISOString()} recovery-failed`,
            lastSendFailure: `${new Date().toISOString()} watchdog recovery failed: ${String(
              e?.message || e
            )}`,
          }));
        }

        return;
      }

      if (missedIntervals >= 4) {
        const cooldownUntil = Number(sessionStorage.getItem(WATCHDOG_RELOAD_COOLDOWN_KEY) || 0);
        if (now < cooldownUntil) {
          console.warn("[watchdog] reload skipped due to cooldown");
          return;
        }

        sessionStorage.setItem(
          WATCHDOG_RELOAD_COOLDOWN_KEY,
          String(now + WATCHDOG_RELOAD_COOLDOWN_MS)
        );

        setTrackerDiag((d) => ({
          ...d,
          lastWatchdogAction: `${new Date().toISOString()} reload`,
          lastReloadReason: `No successful send for ${missedIntervals} intervals`,
        }));

        console.error("[watchdog] 4+ missed intervals: reloading page");
        window.location.reload();
      }
    }, 60_000);

    return () => {
      if (watchdogIntervalRef.current) {
        clearInterval(watchdogIntervalRef.current);
        watchdogIntervalRef.current = null;
      }
    };
  }, [
    trackerReady,
    hasSession,
    disclosureAccepted,
    assignmentWindowStatus,
    resolvedSendIntervalMs,
    trackerAccessToken,
  ]);

  const formattedLastSend = lastSend ? lastSend.toLocaleTimeString() : "—";
  const fmtDiagTs = (ts) => (ts ? new Date(ts).toLocaleString() : "—");

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
            }}
            className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-3 text-slate-950 font-semibold hover:bg-emerald-400 transition"
          >
            {tt("trackerGps.disclosure.continue", "Continue")}
          </button>
        </div>
      </div>
    );
  }

  if (trackerReady && hasSession && assignmentWindowStatus !== "active") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-3 py-6">
        <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 text-center">
          <h1 className="text-2xl font-bold mb-4">
            {tt("trackerGps.blocked.title", "Tracker blocked")}
          </h1>
          <div className="text-lg text-amber-300 mb-2">
            {tt("trackerGps.blocked.noActiveAssignment", "No active assignment found.")}
          </div>
          <div className="text-sm text-slate-300 mb-6">
            {tt(
              "trackerGps.blocked.instructions",
              "You cannot send positions because there is no active assignment for you at this time. Please contact your administrator if you believe this is an error."
            )}
          </div>
          <button
            onClick={() => navigate("/")}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-slate-950 font-semibold"
          >
            {tt("trackerGps.goHome", "Go to home")}
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
                    {tt("trackerGps.debugLabels.send", "send")}: fetch(anon)+x-user-jwt (
                    {debug.send_fn})
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
                  <div className="mt-2 text-[11px] text-slate-400 break-all">
                    assignment_window: {assignmentWindowStatus}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400 break-all">
                    assignment_load_state: {assignmentLoadState}
                  </div>
                  {activeAssignment?.frequency_minutes ? (
                    <div className="mt-2 text-[11px] text-slate-400 break-all">
                      frequency_minutes: {activeAssignment.frequency_minutes}
                    </div>
                  ) : null}
                  {acceptErrorCode ? (
                    <div className="mt-2 text-[11px] text-slate-400 break-all">
                      accept_error_code: {acceptErrorCode}
                    </div>
                  ) : null}
                  {tokenIss ? (
                    <div className="mt-2 text-[11px] text-slate-400 break-all">
                      {tt("trackerGps.debugLabels.tokenIss", "token_iss")}: {tokenIss}
                    </div>
                  ) : null}
                  {debug.last_token_ttl_sec != null ? (
                    <div className="mt-2 text-[11px] text-slate-400 break-all">
                      {tt("trackerGps.debugLabels.tokenTtlSec", "token_ttl_sec")}:{" "}
                      {debug.last_token_ttl_sec}
                    </div>
                  ) : null}
                  {debug.last_http_status != null ? (
                    <div className="mt-2 text-[11px] text-slate-400 break-all">
                      {tt("trackerGps.debugLabels.lastHttpStatus", "last_http_status")}:{" "}
                      {debug.last_http_status}
                    </div>
                  ) : null}
                  <div className="mt-2 text-[11px] text-slate-400 break-all">
                    watchdog_recovering: {String(isWatchdogRecovering)}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400 break-all">
                    last_send_ok_at: {fmtDiagTs(trackerDiag.lastSendOk)}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400 break-all">
                    last_send_attempt_at: {fmtDiagTs(trackerDiag.lastSendAttempt)}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400 break-all">
                    last_send_failure_reason: {trackerDiag.lastSendFailure || "—"}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400 break-all">
                    watchdog_recovery_count: {trackerDiag.watchdogRecoveryCount}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400 break-all">
                    last_watchdog_action: {trackerDiag.lastWatchdogAction || "—"}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400 break-all">
                    last_reload_reason: {trackerDiag.lastReloadReason || "—"}
                  </div>
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
                    {JSON.stringify(
                      {
                        ...debug,
                        tracker_diag: trackerDiag,
                        watchdog_recovering: isWatchdogRecovering,
                      },
                      null,
                      2
                    )}
                  </pre>
                </details>
              </>
            )}

            <div className="mt-3 text-xs">
              {tt("trackerGps.stateLabel", "Status")}:{" "}
              <span className="text-slate-100">{visualStatus}</span>
            </div>

            {isActivationBgRunning ? (
              <div className="mt-2 text-[11px] text-slate-300">Syncing org access...</div>
            ) : null}

            {membershipDetail ? (
              <div className="mt-3 text-[11px] text-slate-200 bg-slate-800/40 border border-slate-700 rounded-xl p-3 whitespace-pre-wrap">
                {membershipDetail}
              </div>
            ) : null}

            {acceptError ? (
              <div className="mt-3 text-xs text-amber-300 bg-amber-950/30 border border-amber-800 rounded-xl p-3">
                {acceptError}
              </div>
            ) : null}

            {upgradeRequired ? (
              <div className="mt-3">
                <UpgradeToProButton />
              </div>
            ) : null}

            {lastError && !acceptError ? (
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
              {tt(
                "trackerGps.errors.notConfigured",
                "Tracker is not configured in this deployment."
              )}
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