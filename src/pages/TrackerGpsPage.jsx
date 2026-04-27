// --- Permiso y tracking automático si hay inviteToken en la URL ---
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get("inviteToken") || params.get("invite_token");
  if (!inviteToken) return;

  const startTracking = () => {
    const bridge = window.AndroidBridge || window.Android;
    if (bridge && typeof bridge.startTracking === "function") {
      // Se puede pasar los datos de sesión si se requiere, aquí solo se llama sin params como en el ejemplo
      bridge.startTracking();
    }
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      startTracking();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => startTracking(),
      () => console.warn("Permiso de geolocalización denegado")
    );
  };

  const init = async () => {
    try {
      if (!navigator.permissions) {
        requestLocation();
        return;
      }
      const perm = await navigator.permissions.query({ name: "geolocation" });
      if (perm.state !== "granted") {
        requestLocation();
      } else {
        startTracking();
      }
    } catch {
      requestLocation();
    }
  };

  init();
}, []);
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

// Helper para pedir permisos de geolocalización.
async function requestLocationPermission() {
  if (typeof navigator === "undefined" || !navigator.geolocation) return false;

  try {
    if (navigator.permissions?.query) {
      const result = await navigator.permissions.query({ name: "geolocation" });
      if (result.state === "granted") return true;
    }

    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        () => resolve(false),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 60000 },
      );
    });
  } catch {
    return false;
  }
}

function getStorageItem(key) {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || null;
  } catch {
    return null;
  }
}

function setStorageItem(key, value) {
  if (!value) return;
  try {
    localStorage.setItem(key, value);
    sessionStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

function readRuntimeSessionFromStorage() {
  return {
    runtimeToken:
      getStorageItem("tracker_runtime_token") ||
      getStorageItem("tracker_access_token") ||
      "",
    trackerUserId:
      getStorageItem("tracker_user_id") ||
      getStorageItem("user_id") ||
      "",
    orgId:
      getStorageItem("tracker_org_id") ||
      getStorageItem("org_id") ||
      "",
  };
}

function syncRuntimeSession(session) {
  if (!session) return;
  setStorageItem("tracker_runtime_token", session.runtimeToken);
  setStorageItem("tracker_access_token", session.runtimeToken);
  setStorageItem("tracker_user_id", session.trackerUserId);
  setStorageItem("user_id", session.trackerUserId);
  setStorageItem("tracker_org_id", session.orgId);
  setStorageItem("org_id", session.orgId);
}

function readRuntimeSessionFromUrl() {
  const params = new URLSearchParams(window.location.search);

  return {
    inviteToken: params.get("inviteToken") || params.get("invite_token") || "",
    runtimeToken:
      params.get("tracker_runtime_token") ||
      params.get("runtimeToken") ||
      params.get("token") ||
      "",
    trackerUserId:
      params.get("tracker_user_id") ||
      params.get("trackerUserId") ||
      params.get("user_id") ||
      "",
    orgId:
      params.get("org_id") ||
      params.get("orgId") ||
      "",
  };
}

function getNativeBridge() {
  if (typeof window === "undefined") return null;
  return window.AndroidBridge || window.Android || null;
}

function callNativeBridge(bridge, session) {
  if (!bridge || !session?.runtimeToken || !session?.orgId) return false;

  const { runtimeToken, trackerUserId, orgId } = session;

  console.log("[TRACKER] bridge exists?", {
    bridgeType: typeof bridge,
    hasSaveTrackerSession: typeof bridge.saveTrackerSession === "function",
    hasSaveSession: typeof bridge.saveSession === "function",
    hasSetTrackerSession: typeof bridge.setTrackerSession === "function",
    hasRequestStartTracking: typeof bridge.requestStartTracking === "function",
    hasStartTracking: typeof bridge.startTracking === "function",
    runtimeToken: !!runtimeToken,
    trackerUserId: !!trackerUserId,
    orgId: !!orgId,
  });

  try {
    if (typeof bridge.saveTrackerSession === "function") {
      bridge.saveTrackerSession(runtimeToken, trackerUserId || "", orgId);
    } else if (typeof bridge.saveSession === "function") {
      bridge.saveSession(runtimeToken, trackerUserId || "", orgId);
    } else if (typeof bridge.setTrackerSession === "function") {
      bridge.setTrackerSession(runtimeToken, trackerUserId || "", orgId);
    }

    if (typeof bridge.startTracking === "function") {
      bridge.startTracking(runtimeToken, trackerUserId || "", orgId);
    } else if (typeof bridge.requestStartTracking === "function") {
      bridge.requestStartTracking();
    }

    return true;
  } catch (err) {
    console.error("[TRACKER] native bridge call failed", err);
    return false;
  }
}

export default function TrackerGpsPage() {
  const { t } = useTranslation();

  const [runtimeSession, setRuntimeSession] = useState(() => {
    const fromStorage = readRuntimeSessionFromStorage();
    return fromStorage;
  });

  const [msg, setMsg] = useState(() => t("tracker.gps.messageStarting"));

  const [debugInfo, setDebugInfo] = useState({
    hasRuntimeToken: false,
    hasTrackerUserId: false,
    hasOrgId: false,
    nativeMode: true,
    bridgeFound: false,
    lastCheckAt: null,
    lastError: null,
  });

  const disposedRef = useRef(false);
  const pollTimerRef = useRef(null);
  const permissionRequestedRef = useRef(false);

  const ready = useMemo(() => {
    return Boolean(runtimeSession.runtimeToken && runtimeSession.orgId);
  }, [runtimeSession]);

  useEffect(() => {
    disposedRef.current = false;

    const fromUrl = readRuntimeSessionFromUrl();
    const fromStorage = readRuntimeSessionFromStorage();

    const merged = {
      runtimeToken: fromUrl.runtimeToken || fromStorage.runtimeToken || "",
      trackerUserId: fromUrl.trackerUserId || fromStorage.trackerUserId || "",
      orgId: fromUrl.orgId || fromStorage.orgId || "",
    };

    if (fromUrl.inviteToken && !permissionRequestedRef.current) {
      permissionRequestedRef.current = true;
      requestLocationPermission().then((granted) => {
        console.log("[TRACKER_LOCATION_PERMISSION]", { granted });
      });
    }

    if (merged.runtimeToken || merged.trackerUserId || merged.orgId) {
      console.log("[TRACKER_QUERY_PARAMS_FOUND]", {
        runtimeToken: !!merged.runtimeToken,
        trackerUserId: !!merged.trackerUserId,
        orgId: !!merged.orgId,
      });

      syncRuntimeSession(merged);
      setRuntimeSession(merged);
    }

    return () => {
      disposedRef.current = true;
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!ready || disposedRef.current) return;

    let cancelled = false;

    const startNativeTracking = async () => {
      if (!permissionRequestedRef.current) {
        permissionRequestedRef.current = true;
        await requestLocationPermission();
      }

      if (cancelled || disposedRef.current) return;

      console.log("[TRACKER] JS tracking disabled, using native service only");

      const bridge = getNativeBridge();
      const bridgeStarted = callNativeBridge(bridge, runtimeSession);

      setMsg(
        runtimeSession.runtimeToken && runtimeSession.orgId
          ? t("tracker.gps.messageActive")
          : t("tracker.gps.messagePreparing"),
      );

      setDebugInfo((prev) => ({
        ...prev,
        hasRuntimeToken: !!runtimeSession.runtimeToken,
        hasTrackerUserId: !!runtimeSession.trackerUserId,
        hasOrgId: !!runtimeSession.orgId,
        nativeMode: true,
        bridgeFound: !!bridge,
        lastCheckAt: new Date().toISOString(),
        lastError: bridgeStarted || bridge ? null : "native_bridge_not_found",
      }));

      console.log("[TRACKER_FINAL_SESSION_SNAPSHOT]", {
        hasRuntimeToken: !!runtimeSession.runtimeToken,
        hasTrackerUserId: !!runtimeSession.trackerUserId,
        hasOrgId: !!runtimeSession.orgId,
        bridgeFound: !!bridge,
        bridgeStarted,
      });
    };

    startNativeTracking();

    return () => {
      cancelled = true;
    };
  }, [ready, runtimeSession, t]);

  useEffect(() => {
    if (ready) return;

    let cancelled = false;

    const poll = () => {
      if (cancelled || disposedRef.current) return;

      const stored = readRuntimeSessionFromStorage();
      const hasSession = Boolean(stored.runtimeToken && stored.orgId);

      if (hasSession) {
        console.log("[TRACKER_POLL] runtime session detected");
        syncRuntimeSession(stored);
        setRuntimeSession(stored);
        setMsg(t("tracker.gps.messageActive"));
        return;
      }

      console.log("[TRACKER_POLL] waiting for runtime session...");
      pollTimerRef.current = window.setTimeout(poll, 1000);
    };

    poll();

    return () => {
      cancelled = true;
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [ready, t]);

  const pageStyle = {
    minHeight: "100vh",
    background: "#f5f7fb",
    padding: "24px 16px",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
  };

  const cardStyle = {
    width: "100%",
    maxWidth: 520,
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 24,
    marginTop: 24,
    boxShadow: "0 6px 18px rgba(15, 23, 42, 0.06)",
    textAlign: "center",
  };

  const iconStyle = (isReady) => ({
    width: 56,
    height: 56,
    margin: "0 auto 16px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 24,
    background: isReady ? "#ecfdf3" : "#eff6ff",
    border: isReady ? "1px solid #bbf7d0" : "1px solid #bfdbfe",
  });

  const titleStyle = {
    fontSize: 22,
    fontWeight: 700,
    color: "#111827",
    marginBottom: 8,
  };

  const subtitleStyle = {
    fontSize: 15,
    lineHeight: 1.5,
    color: "#4b5563",
    marginBottom: 16,
  };

  const badgeStyle = (isReady) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 999,
    fontSize: 14,
    fontWeight: 600,
    background: isReady ? "#ecfdf3" : "#eff6ff",
    color: isReady ? "#166534" : "#1d4ed8",
    border: isReady ? "1px solid #bbf7d0" : "1px solid #bfdbfe",
  });

  const noteStyle = {
    marginTop: 16,
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 1.45,
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={iconStyle(ready)}>{ready ? "✅" : "📍"}</div>

        <div style={titleStyle}>
          {ready
            ? t("tracker.gps.titleActive")
            : t("tracker.gps.titleStarting")}
        </div>

        <div style={subtitleStyle}>
          {ready
            ? t("tracker.gps.subtitleActive")
            : t("tracker.gps.subtitleStarting")}
        </div>

        <div style={badgeStyle(ready)}>
          <span>
            {ready
              ? t("tracker.gps.badgeActive")
              : t("tracker.gps.badgeInitializing")}
          </span>
        </div>

        {!!msg && (
          <div style={noteStyle}>
            {ready ? t("tracker.gps.noteUpdated") : t("tracker.gps.noteWait")}
          </div>
        )}

        {debugInfo.lastError && (
          <div style={{ ...noteStyle, color: "#b45309" }}>
            {debugInfo.lastError}
          </div>
        )}
      </div>
    </div>
  );
}
