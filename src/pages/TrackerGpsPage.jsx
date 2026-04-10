
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import supabaseTracker from "../lib/supabaseTrackerClient";

// --- Android session bridge helper ---
const sendSessionToAndroid = (token, orgId) => {
  try {
    console.log(
      "[TRACKER_SESSION_SEND] " +
        JSON.stringify({
          tokenPresent: !!token,
          orgIdPresent: !!orgId,
          androidAvailable: !!window?.Android?.saveSession,
        })
    );
    window?.Android?.saveSession?.(token, orgId);
  } catch (e) {
    console.error("[TRACKER_SESSION_SEND] error", e);
  }
};

function getAndroidBridge() { 
  if (typeof window === "undefined") return null;
  return window.Android || window.AndroidBridge || null;
}

function mapHealthState(status) {
  const normalized = String(status || "offline").toLowerCase();
  if (["online", "active", "ok", "healthy"].includes(normalized)) return "online";
  if (["idle", "waiting"].includes(normalized)) return "idle";
  if (["offline", "inactive", "disconnected"].includes(normalized)) return "offline";
  return normalized;
}

export default function TrackerGpsPage() {
  return <div>Tracker minimal OK</div>;
}
