import { useEffect, useRef, useState } from "react";
import { getStorageItem, setStorageItem } from "../utils/storage";

function readRuntimeSessionFromStorage() {
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
}

export default function TrackerGpsPage() {
  const [ready, setReady] = useState(false);
  const [runtimeSession, setRuntimeSession] = useState({
    runtimeToken: null,
    trackerUserId: null,
    orgId: null,
  });

  const disposedRef = useRef(false);

  // ✅ 1. Leer query params y guardar en storage
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);

    const runtimeToken = params.get("tracker_runtime_token");
    const trackerUserId = params.get("tracker_user_id");
    const orgId = params.get("org_id");

    if (runtimeToken && trackerUserId && orgId) {
      console.log("[TRACKER_QUERY_PARAMS_FOUND]", {
        runtimeToken: true,
        trackerUserId: true,
        orgId: true,
      });

      setStorageItem("tracker_runtime_token", runtimeToken);
      setStorageItem("tracker_access_token", runtimeToken);
      setStorageItem("tracker_user_id", trackerUserId);
      setStorageItem("user_id", trackerUserId);
      setStorageItem("tracker_org_id", orgId);
      setStorageItem("org_id", orgId);
    }
  }, []);

  // ✅ 2. Leer storage y validar sesión
  useEffect(() => {
    const stored = readRuntimeSessionFromStorage();

    console.log("[TRACKER_SESSION_STATE]", {
      hasRuntimeToken: !!stored.runtimeToken,
      hasTrackerUserId: !!stored.trackerUserId,
      hasOrgId: !!stored.orgId,
    });

    if (!stored.runtimeToken || !stored.trackerUserId || !stored.orgId) {
      const params = new URLSearchParams(window.location.search);
      const inviteToken = params.get("inviteToken");
      const orgId = params.get("org_id");

      if (inviteToken) {
        console.warn("[TRACKER_REDIRECT_TO_ACCEPT]");
        window.location.href = `/tracker-accept?inviteToken=${inviteToken}&org_id=${orgId || ""}`;
        return;
      }
    }

    setRuntimeSession(stored);
    setReady(true);
  }, []);

  // ✅ 3. Llamar AndroidBridge
  useEffect(() => {
    if (!ready) return;
    if (disposedRef.current) return;

    const bridge =
      typeof window !== "undefined" ? window.AndroidBridge : null;

    const { runtimeToken, trackerUserId, orgId } = runtimeSession;

    console.log("[TRACKER] bridge exists?", {
      hasBridge: !!bridge,
      runtimeToken: !!runtimeToken,
      trackerUserId: !!trackerUserId,
      orgId: !!orgId,
    });

    if (bridge && runtimeToken && trackerUserId && orgId) {
      try {
        console.log("[TRACKER] calling saveTrackerSession");
        bridge.saveTrackerSession(runtimeToken, trackerUserId, orgId);

        console.log("[TRACKER] calling requestStartTracking");
        bridge.requestStartTracking();
      } catch (e) {
        console.error("[TRACKER] bridge error", e);
      }
    } else {
      console.warn("[TRACKER] missing required fields");
    }
  }, [ready, runtimeSession]);

  return (
    <div style={{ padding: 20 }}>
      <h2>Inicializando seguimiento...</h2>
    </div>
  );
}