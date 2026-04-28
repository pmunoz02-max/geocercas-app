function buildAndroidIntentUrl({ token, orgId, userId }) {
  const params = new URLSearchParams();
  if (token) params.set("token", token);
  if (orgId) params.set("org_id", orgId);
  if (userId) params.set("userId", userId);
  const fallbackUrl = encodeURIComponent(window.location.href);
  return `intent://tracker?${params.toString()}#Intent;scheme=geocercas;package=com.fenice.geocercas;S.browser_fallback_url=${fallbackUrl};end`;
}
import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.fenice.geocercas";
const PLAY_STORE_WEB_URL = "https://play.google.com/store/apps/details?id=com.fenice.geocercas";

function saveTrackerRuntime({ token, orgId, userId }) {
  localStorage.setItem("tracker_token", token || "");
  localStorage.setItem("tracker_org_id", orgId || "");
  localStorage.setItem("tracker_user_id", userId || "");
}

function buildNativeDeepLink({ token, orgId, userId }) {
  const params = new URLSearchParams();
  if (token) {
    params.set("token", token);
    params.set("tracker_runtime_token", token);
  }
  if (orgId) params.set("org_id", orgId);
  if (userId) params.set("userId", userId);
  return `geocercas://tracker?${params.toString()}`;
}

export default function TrackerOpen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [mode, setMode] = useState("opening");
  const [runtimeToken, setRuntimeToken] = useState("");
  const [runtimeUserId, setRuntimeUserId] = useState("");
  const token = params.get("token") || "";
  const orgId = params.get("org_id") || "";
  const userId = params.get("userId") || "";

  // Construye el intent y deep link usando el runtimeToken y runtimeUserId si existen
  const effectiveToken = runtimeToken || token;
  const effectiveUserId = runtimeUserId || userId;

  const nativeDeepLink = useMemo(
    () => buildNativeDeepLink({ token: effectiveToken, orgId, userId: effectiveUserId }),
    [effectiveToken, orgId, effectiveUserId]
  );


  // Llama a /api/accept-tracker-invite y actualiza runtimeToken y runtimeUserId
  const acceptInvite = useCallback(async () => {
    if (!token) {
      setMode("missing_token");
      return;
    }
    try {
      const res = await fetch(`/api/accept-tracker-invite?token=${encodeURIComponent(token)}&org_id=${encodeURIComponent(orgId)}`);
      if (!res.ok) throw new Error("invite_api_error");
      const data = await res.json();
      if (data?.tracker_runtime_token) {
        setRuntimeToken(data.tracker_runtime_token);
        if (data.user_id) setRuntimeUserId(data.user_id);
        saveTrackerRuntime({ token: data.tracker_runtime_token, orgId, userId: data.user_id || userId });
        return { token: data.tracker_runtime_token, userId: data.user_id || userId };
      }
      // fallback: usa el token original
      setRuntimeToken(token);
      setRuntimeUserId(userId);
      saveTrackerRuntime({ token, orgId, userId });
      return { token, userId };
    } catch (e) {
      setMode("missing_token");
      return { token, userId };
    }
  }, [token, orgId, userId]);

  useEffect(() => {
    (async () => {
      if (!token) {
        setMode("missing_token");
        return;
      }
      // Llama a la API antes de cualquier navegación
      const { token: t, userId: u } = await acceptInvite();

      // Si estamos en la app Android/WebView
      if (window.Android?.startTracking) {
        navigate("/tracker-gps", { replace: true });
        return;
      }
      setMode("install");
    })();
  }, [token, orgId, userId, navigate, acceptInvite]);


  const intentUrl = useMemo(() => buildAndroidIntentUrl({ token: effectiveToken, orgId, userId: effectiveUserId }), [effectiveToken, orgId, effectiveUserId]);

  const installApp = () => {
    window.location.href = PLAY_STORE_URL;
  };

  if (mode === "opening") {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <div style={styles.icon}>📍</div>
          <h1 style={styles.title}>Abriendo Geocercas...</h1>
          <p style={styles.text}>Estamos preparando tu invitación de seguimiento.</p>
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
          Para compartir tu ubicación necesitas abrir este enlace desde la app Geocercas.
        </p>

        <div style={styles.actions}>
          <a
            href={intentUrl}
            style={{ ...styles.primaryButton, display: 'block', textAlign: 'center', textDecoration: 'none', color: '#fff', lineHeight: '44px', fontWeight: 600 }}
            rel="noopener noreferrer"
          >
            Ya tengo la app
          </a>

          <button type="button" style={styles.secondaryButton} onClick={installApp}>
            Instalar desde Google Play
          </button>
        </div>

        <p style={styles.note}>
          Si Google Play muestra “Item not found”, la app todavía no está disponible para tu cuenta de prueba.
          Instálala desde Android Studio y vuelve a tocar “Ya tengo la app”.
        </p>

        <p style={styles.debug}>
          tracker_open_browser_fallback_v3
        </p>
      </section>
    </main>
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
  debug: {
    margin: "16px 0 0",
    color: "#c2410c",
    fontSize: 12,
  },
};
