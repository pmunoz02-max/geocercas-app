import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const BUILD_TAG = "tracker_open_runtime_exchange_v6_20260428";
const ANDROID_PACKAGE = "com.fenice.geocercas";
const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
const PLAY_STORE_WEB_URL = PLAY_STORE_URL;

function clean(value) {
  return String(value || "").trim();
}

function firstParam(params, keys) {
  for (const key of keys) {
    const value = clean(params.get(key));
    if (value) return value;
  }
  return "";
}

function tokenPrefix(value) {
  const token = clean(value);
  if (!token) return "";
  return `${token.slice(0, 8)}…len:${token.length}`;
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildTrackerGpsUrl({ runtimeToken, orgId, trackerUserId }) {
  const params = new URLSearchParams();

  if (runtimeToken) {
    params.set("tracker_runtime_token", runtimeToken);
    params.set("runtimeToken", runtimeToken);
  }

  if (orgId) {
    params.set("org_id", orgId);
    params.set("orgId", orgId);
  }

  if (trackerUserId) {
    params.set("tracker_user_id", trackerUserId);
    params.set("user_id", trackerUserId);
    params.set("userId", trackerUserId);
  }

  const query = params.toString();
  return query ? `/tracker-gps?${query}` : "/tracker-gps";
}

function buildAndroidIntentUrl({ runtimeToken, orgId, trackerUserId }) {
  const params = new URLSearchParams();

  // IMPORTANTE: token debe ser SIEMPRE runtime token, nunca invite token.
  if (runtimeToken) {
    params.set("token", runtimeToken);
    params.set("tracker_runtime_token", runtimeToken);
    params.set("runtimeToken", runtimeToken);
  }

  if (orgId) {
    params.set("org_id", orgId);
    params.set("orgId", orgId);
  }

  if (trackerUserId) {
    params.set("tracker_user_id", trackerUserId);
    params.set("user_id", trackerUserId);
    params.set("userId", trackerUserId);
  }

  params.set("source", "tracker-open-runtime");

  const fallbackUrl = encodeURIComponent(PLAY_STORE_WEB_URL);
  return `intent://tracker?${params.toString()}#Intent;scheme=geocercas;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallbackUrl};end`;
}

function buildNativeDeepLink({ runtimeToken, orgId, trackerUserId }) {
  const params = new URLSearchParams();

  if (runtimeToken) {
    params.set("token", runtimeToken);
    params.set("tracker_runtime_token", runtimeToken);
    params.set("runtimeToken", runtimeToken);
  }

  if (orgId) {
    params.set("org_id", orgId);
    params.set("orgId", orgId);
  }

  if (trackerUserId) {
    params.set("tracker_user_id", trackerUserId);
    params.set("user_id", trackerUserId);
    params.set("userId", trackerUserId);
  }

  params.set("source", "tracker-open-runtime");
  return `geocercas://tracker?${params.toString()}`;
}

function persistTrackerRuntime({ runtimeToken, orgId, trackerUserId }) {
  const token = clean(runtimeToken);
  const org = clean(orgId);
  const user = clean(trackerUserId);

  if (token) {
    localStorage.setItem("tracker_runtime_token", token);
    localStorage.setItem("tracker_access_token", token);
    localStorage.setItem("tracker_token", token);

    // Android/legacy fallback: algunos bridges nativos todavía buscan access_token.
    localStorage.setItem("access_token", token);
  }

  if (org) {
    localStorage.setItem("org_id", org);
    localStorage.setItem("orgId", org);
    localStorage.setItem("tracker_org_id", org);
  }

  if (user) {
    localStorage.setItem("tracker_user_id", user);
    localStorage.setItem("user_id", user);
    localStorage.setItem("userId", user);
  }
}

function pickRuntimeToken(data) {
  return clean(
    data?.tracker_runtime_token ||
      data?.tracker_access_token ||
      data?.runtimeToken ||
      data?.runtime_token ||
      data?.access_token ||
      data?.session?.tracker_runtime_token ||
      data?.session?.tracker_access_token ||
      data?.session?.runtimeToken ||
      data?.session?.access_token
  );
}

function pickTrackerUserId(data, fallbackUserId) {
  return clean(
    data?.tracker_user_id ||
      data?.trackerUserId ||
      data?.user_id ||
      data?.userId ||
      data?.session?.tracker_user_id ||
      data?.session?.trackerUserId ||
      data?.session?.user_id ||
      data?.session?.userId ||
      fallbackUserId
  );
}

function pickOrgId(data, fallbackOrgId) {
  return clean(data?.org_id || data?.orgId || data?.session?.org_id || data?.session?.orgId || fallbackOrgId);
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function acceptTrackerInvite({ inviteToken, orgId, userId }) {
  const body = {
    token: inviteToken,
    invite_token: inviteToken,
    inviteToken,
    org_id: orgId,
    orgId,
    tracker_user_id: userId,
    user_id: userId,
    userId,
    source: "tracker-open",
  };

  const postResponse = await fetch("/api/accept-tracker-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const postData = await parseResponse(postResponse);

  if (postResponse.ok) {
    return postData;
  }

  // Compatibilidad temporal: si el endpoint preview aún acepta GET, probar GET.
  // Nunca se hace fallback al invite token.
  const query = new URLSearchParams();
  query.set("token", inviteToken);
  query.set("invite_token", inviteToken);
  if (orgId) query.set("org_id", orgId);
  if (userId) query.set("userId", userId);

  const getResponse = await fetch(`/api/accept-tracker-invite?${query.toString()}`, {
    method: "GET",
  });

  const getData = await parseResponse(getResponse);

  if (getResponse.ok) {
    return getData;
  }

  throw new Error(
    `accept_tracker_invite_failed post=${postResponse.status} get=${getResponse.status} postBody=${safeJson(
      postData
    ).slice(0, 240)} getBody=${safeJson(getData).slice(0, 240)}`
  );
}

function getAndroidBridge() {
  return window.Android || null;
}

function primeAndroidBridge({ runtimeToken, orgId, trackerUserId }) {
  const bridge = getAndroidBridge();
  if (!bridge || !runtimeToken) return;

  const candidates = [
    "saveTrackerSession",
    "saveSession",
    "setTrackerSession",
    "setRuntimeSession",
  ];

  for (const method of candidates) {
    if (typeof bridge[method] === "function") {
      try {
        bridge[method](runtimeToken, trackerUserId || "", orgId || "");
      } catch (error) {
        console.warn(`[TrackerOpen] bridge_${method}_failed`, error);
      }
    }
  }
}

export default function TrackerOpen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const inviteToken = firstParam(params, ["token", "invite_token", "inviteToken"]);
  const runtimeTokenFromUrl = firstParam(params, [
    "tracker_runtime_token",
    "runtimeToken",
    "runtime_token",
    "tracker_access_token",
  ]);
  const orgIdFromUrl = firstParam(params, ["org_id", "orgId"]);
  const userIdFromUrl = firstParam(params, ["tracker_user_id", "user_id", "userId", "trackerUserId"]);

  const [mode, setMode] = useState("opening");
  const [errorMessage, setErrorMessage] = useState("");
  const [runtimeSession, setRuntimeSession] = useState({
    runtimeToken: "",
    orgId: "",
    trackerUserId: "",
  });
  const [debug, setDebug] = useState({
    build: BUILD_TAG,
    invite_token_present: Boolean(inviteToken),
    runtime_param_present: Boolean(runtimeTokenFromUrl),
    org_id_present: Boolean(orgIdFromUrl),
    user_id_present: Boolean(userIdFromUrl),
  });

  const patchDebug = useCallback((patch) => {
    setDebug((prev) => ({ ...prev, ...patch }));
    console.log("[TrackerOpen]", patch);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function prepareRuntimeSession() {
      setMode("opening");
      setErrorMessage("");

      const orgId = orgIdFromUrl;
      const userId = userIdFromUrl;

      if (!inviteToken && !runtimeTokenFromUrl) {
        setMode("missing_token");
        patchDebug({ missing_token: true });
        return;
      }

      try {
        let nextSession;

        if (runtimeTokenFromUrl) {
          // Caso Android/WebView abrió con runtime token desde intent://.
          nextSession = {
            runtimeToken: runtimeTokenFromUrl,
            orgId,
            trackerUserId: userId,
          };

          patchDebug({
            runtime_param_used: true,
            runtime_token_prefix: tokenPrefix(runtimeTokenFromUrl),
          });
        } else {
          // Caso email/browser: token URL es invite token. Debe intercambiarse.
          patchDebug({
            accept_called: true,
            invite_token_prefix: tokenPrefix(inviteToken),
          });

          const data = await acceptTrackerInvite({ inviteToken, orgId, userId });
          const runtimeToken = pickRuntimeToken(data);
          const trackerUserId = pickTrackerUserId(data, userId);
          const resolvedOrgId = pickOrgId(data, orgId);

          if (!runtimeToken) {
            throw new Error(`accept_ok_but_missing_runtime_token body=${safeJson(data).slice(0, 300)}`);
          }

          nextSession = {
            runtimeToken,
            orgId: resolvedOrgId,
            trackerUserId,
          };

          patchDebug({
            accept_ok: true,
            runtime_token_prefix: tokenPrefix(runtimeToken),
            resolved_org_id_present: Boolean(resolvedOrgId),
            resolved_tracker_user_id_present: Boolean(trackerUserId),
          });
        }

        if (!nextSession.runtimeToken) {
          throw new Error("missing_runtime_token_after_prepare");
        }

        if (!nextSession.orgId) {
          throw new Error("missing_org_id_after_prepare");
        }

        if (cancelled) return;

        persistTrackerRuntime(nextSession);
        setRuntimeSession(nextSession);

        if (getAndroidBridge()) {
          primeAndroidBridge(nextSession);
          const trackerGpsUrl = buildTrackerGpsUrl(nextSession);
          patchDebug({
            android_bridge_detected: true,
            navigate_to: "/tracker-gps",
            intent_uses_runtime_token: true,
          });
          navigate(trackerGpsUrl, { replace: true });
          return;
        }

        patchDebug({
          browser_fallback_ready: true,
          intent_uses_runtime_token: true,
        });
        setMode("install");
      } catch (error) {
        if (cancelled) return;

        const message = String(error?.message || error || "accept_tracker_invite_failed");
        console.error("[TrackerOpen] runtime_prepare_failed", error);
        setErrorMessage(message);
        setMode("accept_error");
        patchDebug({
          accept_ok: false,
          error: message.slice(0, 240),
        });
      }
    }

    prepareRuntimeSession();

    return () => {
      cancelled = true;
    };
  }, [inviteToken, runtimeTokenFromUrl, orgIdFromUrl, userIdFromUrl, navigate, patchDebug]);

  const intentUrl = useMemo(() => {
    if (!runtimeSession.runtimeToken) return "";
    return buildAndroidIntentUrl(runtimeSession);
  }, [runtimeSession]);

  const nativeDeepLink = useMemo(() => {
    if (!runtimeSession.runtimeToken) return "";
    return buildNativeDeepLink(runtimeSession);
  }, [runtimeSession]);

  const installApp = () => {
    window.location.href = PLAY_STORE_URL;
  };

  const openAndroid = () => {
    if (!intentUrl) return;
    window.location.href = intentUrl;
  };

  if (mode === "opening") {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <div style={styles.icon}>📍</div>
          <h1 style={styles.title}>Abriendo Geocercas...</h1>
          <p style={styles.text}>Estamos preparando tu invitación de seguimiento.</p>
          <DebugBlock debug={debug} />
        </section>
      </main>
    );
  }

  if (mode === "missing_token") {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <div style={styles.icon}>⚠️</div>
          <h1 style={styles.title}>Invitación inválida</h1>
          <p style={styles.text}>El enlace no contiene un token válido. Solicita una nueva invitación.</p>
          <DebugBlock debug={debug} />
        </section>
      </main>
    );
  }

  if (mode === "accept_error") {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <div style={styles.icon}>⚠️</div>
          <h1 style={styles.title}>No se pudo activar la invitación</h1>
          <p style={styles.text}>
            No se generó la sesión segura de seguimiento. Solicita una nueva invitación o vuelve a abrir el enlace original.
          </p>
          <p style={styles.error}>{errorMessage}</p>
          <button type="button" style={styles.secondaryButton} onClick={installApp}>
            Instalar desde Google Play
          </button>
          <DebugBlock debug={debug} />
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.icon}>✅</div>
        <h1 style={styles.title}>Activa tu seguimiento</h1>
        <p style={styles.text}>
          Tu invitación ya fue validada. Para compartir tu ubicación, abre Geocercas desde este botón.
        </p>

        <div style={styles.actions}>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={openAndroid}
            disabled={!intentUrl}
          >
            Ya tengo la app
          </button>

          <button type="button" style={styles.secondaryButton} onClick={installApp}>
            Instalar desde Google Play
          </button>
        </div>

        <p style={styles.note}>
          Si Google Play muestra “Item not found”, la app todavía no está disponible para tu cuenta de prueba.
          Instálala desde Android Studio y vuelve a tocar “Ya tengo la app”.
        </p>

        <p style={styles.debug}>tracker_open_browser_fallback_runtime_v6</p>
        <p style={styles.hiddenDebug}>{nativeDeepLink ? "native_deeplink_ready" : "native_deeplink_missing"}</p>
        <DebugBlock debug={debug} />
      </section>
    </main>
  );
}

function DebugBlock({ debug }) {
  return (
    <pre style={styles.debugBox}>
      {JSON.stringify(debug, null, 2)}
    </pre>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    background: "#f8fafc",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: 440,
    padding: 24,
    borderRadius: 20,
    background: "#ffffff",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
    textAlign: "center",
  },
  icon: {
    width: 72,
    height: 72,
    margin: "0 auto 16px",
    borderRadius: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#dcfce7",
    fontSize: 34,
  },
  title: {
    margin: "0 0 10px",
    color: "#0f172a",
    fontSize: 26,
    lineHeight: 1.15,
  },
  text: {
    margin: "0 auto 20px",
    color: "#475569",
    fontSize: 16,
    lineHeight: 1.5,
  },
  actions: {
    display: "grid",
    gap: 12,
    marginTop: 18,
  },
  primaryButton: {
    width: "100%",
    border: 0,
    borderRadius: 999,
    padding: "14px 18px",
    background: "#16a34a",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: 16,
    cursor: "pointer",
  },
  secondaryButton: {
    width: "100%",
    border: "1px solid #cbd5e1",
    borderRadius: 999,
    padding: "14px 18px",
    background: "#ffffff",
    color: "#0f172a",
    fontWeight: 700,
    fontSize: 16,
    cursor: "pointer",
  },
  note: {
    margin: "18px 0 0",
    color: "#64748b",
    fontSize: 13,
    lineHeight: 1.45,
  },
  error: {
    margin: "12px 0 18px",
    padding: 12,
    borderRadius: 12,
    background: "#fef2f2",
    color: "#991b1b",
    fontSize: 12,
    lineHeight: 1.45,
    textAlign: "left",
    wordBreak: "break-word",
  },
  debug: {
    margin: "16px 0 0",
    color: "#c2410c",
    fontSize: 12,
  },
  hiddenDebug: {
    margin: "4px 0 0",
    color: "#94a3b8",
    fontSize: 11,
  },
  debugBox: {
    margin: "14px 0 0",
    padding: 10,
    borderRadius: 12,
    background: "#0f172a",
    color: "#e2e8f0",
    fontSize: 11,
    lineHeight: 1.4,
    textAlign: "left",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
};
