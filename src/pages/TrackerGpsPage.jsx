import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

function getStorageItem(key) {
  try {
    const localValue = localStorage.getItem(key);
    if (localValue) return localValue;

    const sessionValue = sessionStorage.getItem(key);
    if (sessionValue) return sessionValue;

    return null;
  } catch {
    return null;
  }
}

function setStorageItem(key, value) {
  try {
    if (value == null || value === "") return;
    localStorage.setItem(key, value);
    sessionStorage.setItem(key, value);
  } catch {
    // no-op
  }
}

function readRuntimeSessionFromStorage() {
  try {
    const runtimeToken =
      getStorageItem("tracker_runtime_token") ||
      getStorageItem("tracker_access_token") ||
      (typeof window !== "undefined" ? window.runtimeInviteToken || null : null);

    const trackerUserId =
      getStorageItem("tracker_user_id") ||
      getStorageItem("user_id") ||
      (typeof window !== "undefined" ? window.trackerUserId || null : null);

    const orgId =
      getStorageItem("tracker_org_id") ||
      getStorageItem("org_id") ||
      (typeof window !== "undefined" ? window.orgId || null : null);

    return {
      runtimeToken: runtimeToken || null,
      trackerUserId: trackerUserId || null,
      orgId: orgId || null,
    };
  } catch {
    return { runtimeToken: null, trackerUserId: null, orgId: null };
  }
}

function syncRuntimeSession(session) {
  try {
    const runtimeToken = session?.runtimeToken || null;
    const trackerUserId = session?.trackerUserId || null;
    const orgId = session?.orgId || null;

    if (runtimeToken) {
      setStorageItem("tracker_runtime_token", runtimeToken);
      setStorageItem("tracker_access_token", runtimeToken);
      if (typeof window !== "undefined") {
        window.runtimeInviteToken = runtimeToken;
      }
    }

    if (trackerUserId) {
      setStorageItem("tracker_user_id", trackerUserId);
      setStorageItem("user_id", trackerUserId);
      if (typeof window !== "undefined") {
        window.trackerUserId = trackerUserId;
      }
    }

    if (orgId) {
      setStorageItem("tracker_org_id", orgId);
      setStorageItem("org_id", orgId);
      if (typeof window !== "undefined") {
        window.orgId = orgId;
      }
    }
  } catch {
    // no-op
  }
}

export default function TrackerGpsPage() {
  const { t } = useTranslation();
  const [msg, setMsg] = useState(() => t("tracker.gps.messageStarting"));
  const [runtimeSession, setRuntimeSession] = useState(() => {
    const initial = readRuntimeSessionFromStorage();
    syncRuntimeSession(initial);
    return initial;
  });

  const [debugInfo, setDebugInfo] = useState(() => ({
    hasRuntimeToken: false,
    hasTrackerUserId: false,
    hasOrgId: false,
    nativeMode: true,
    lastCheckAt: null,
    lastError: null,
  }));

  const bootstrapTimerRef = useRef(null);
  const pollTimerRef = useRef(null);
  const disposedRef = useRef(false);

  const ready = useMemo(() => {
    return Boolean(
      runtimeSession.runtimeToken &&
        runtimeSession.orgId,
    );
  }, [runtimeSession]);

  function refreshRuntimeSessionState(nextMsgWhenMissing = null) {
    const stored = readRuntimeSessionFromStorage();
    syncRuntimeSession(stored);
    setRuntimeSession(stored);

    const hasBootstrapSession = Boolean(
      stored.runtimeToken && stored.orgId,
    );

    setDebugInfo((prev) => ({
      ...prev,
      hasRuntimeToken: !!stored.runtimeToken,
      hasTrackerUserId: !!stored.trackerUserId,
      hasOrgId: !!stored.orgId,
      nativeMode: true,
      lastCheckAt: new Date().toISOString(),
    }));

    console.log("[TRACKER_SESSION_STATE]", {
      hasRuntimeToken: !!stored.runtimeToken,
      hasTrackerUserId: !!stored.trackerUserId,
      hasOrgId: !!stored.orgId,
      ready: hasBootstrapSession,
      nativeMode: true,
    });

    if (hasBootstrapSession) {
      setMsg(t("tracker.gps.messageActive"));
    } else if (nextMsgWhenMissing) {
      setMsg(nextMsgWhenMissing);
    }

    return stored;
  }

  useEffect(() => {
    disposedRef.current = false;

    const stored = refreshRuntimeSessionState(t("tracker.gps.messagePreparing"));

    if (!stored.runtimeToken || !stored.trackerUserId || !stored.orgId) {
      bootstrapTimerRef.current = window.setTimeout(() => {
        if (disposedRef.current) return;
        const latest = refreshRuntimeSessionState(
          t("tracker.gps.messagePreparing"),
        );

        if (!latest.runtimeToken || !latest.trackerUserId || !latest.orgId) {
          setMsg(t("tracker.gps.messagePreparing"));
        }
      }, 300);
    }

    return () => {
      disposedRef.current = true;

      if (bootstrapTimerRef.current) {
        window.clearTimeout(bootstrapTimerRef.current);
        bootstrapTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (ready) return;

    let cancelled = false;

    const poll = () => {
      if (cancelled || disposedRef.current) return;

      const stored = readRuntimeSessionFromStorage();
      const hasSession =
        !!stored.runtimeToken && !!stored.orgId;

      if (hasSession) {
        console.log("[TRACKER_POLL] runtime session detected");
        syncRuntimeSession(stored);
        setRuntimeSession(stored);
        setMsg(t("tracker.gps.messageActive"));
        setDebugInfo((prev) => ({
          ...prev,
          hasRuntimeToken: true,
          hasTrackerUserId: !!stored.trackerUserId,
          hasOrgId: true,
          nativeMode: true,
          lastCheckAt: new Date().toISOString(),
          lastError: null,
        }));
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
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (disposedRef.current) return;

    console.log("[TRACKER] JS tracking disabled, using native service only");

    try {
      const bridge = typeof window !== "undefined" ? window.AndroidBridge : null;
      const { runtimeToken, trackerUserId, orgId } = runtimeSession;

      console.log("[TRACKER] bridge exists?", {
        hasAndroidBridge: !!bridge,
        bridgeType: typeof bridge,
        hasSaveSession: !!bridge?.saveSession,
        hasSetTrackerSession: !!bridge?.setTrackerSession,
        hasStartTracking: !!bridge?.startTracking,
        runtimeToken: !!runtimeToken,
        trackerUserId: !!trackerUserId,
        orgId: !!orgId,
      });

      if (bridge && runtimeToken && trackerUserId && orgId) {
        console.log("[TRACKER] calling AndroidBridge.saveTrackerSession");
        bridge.saveTrackerSession(runtimeToken, trackerUserId, orgId);

        if (bridge?.requestStartTracking) {
          console.log("[TRACKER] calling AndroidBridge.requestStartTracking");
          bridge.requestStartTracking();
        } else {
          console.warn(
            "[TRACKER] AndroidBridge.requestStartTracking not available",
          );
        }
      } else {
        console.warn("[TRACKER] missing required tracker bootstrap fields", {
          hasRuntimeToken: !!runtimeToken,
          hasTrackerUserId: !!trackerUserId,
          hasOrgId: !!orgId,
        });
      }

      if (runtimeToken && trackerUserId && orgId) {
        setMsg(t("tracker.gps.messageActive"));
      } else {
        setMsg(t("tracker.gps.messagePreparing"));
      }

      setDebugInfo((prev) => ({
        ...prev,
        hasRuntimeToken: !!runtimeToken,
        hasTrackerUserId: !!trackerUserId,
        hasOrgId: !!orgId,
        nativeMode: true,
        lastCheckAt: new Date().toISOString(),
        lastError: null,
      }));
    } catch (err) {
      console.error("[TRACKER] native bootstrap failed", err);
      setDebugInfo((prev) => ({
        ...prev,
        lastError: String(err?.message || err || "native bootstrap failed"),
        lastCheckAt: new Date().toISOString(),
      }));
    }
  }, [ready, runtimeSession]);

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
        <div style={iconStyle(ready)}>
          {ready ? "✅" : "📍"}
        </div>

        <div style={titleStyle}>
          {ready ? t("tracker.gps.titleActive") : t("tracker.gps.titleStarting")}
        </div>

        <div style={subtitleStyle}>
          {ready
            ? t("tracker.gps.subtitleActive")
            : t("tracker.gps.subtitleStarting")}
        </div>

        <div style={badgeStyle(ready)}>
          <span>{ready ? t("tracker.gps.badgeActive") : t("tracker.gps.badgeInitializing")}</span>
        </div>

        {!!msg && (
          <div style={noteStyle}>
            {ready
              ? t("tracker.gps.noteUpdated")
              : t("tracker.gps.noteWait")}
          </div>
        )}
      </div>
    </div>
  );
}