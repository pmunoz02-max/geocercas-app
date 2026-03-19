import { createClient } from "@supabase/supabase-js";

/**
 * Tracker client
 *
 * Ô£à Migrado a PKCE (consistente con el client principal)
 * - Singleton global: globalThis.__SUPABASE_TRACKER__
 * - StorageKey: usar default del SDK para evitar divergencias entre builds
 * - Storage real: localStorage
 * - detectSessionInUrl: false (callback controlado por nuestra app)
 */

function mustBeSupabaseUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  const ok = u.includes(".supabase.co") || u.includes("localhost");
  return ok ? u : "";
}

function getLocalStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {}
  return undefined;
}

function projectRefFromUrl(rawUrl) {
  try {
    return new URL(String(rawUrl || "")).hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}

// Ô£à Universal:
// - Si defines VITE_SUPABASE_TRACKER_* se usan.
// - Si no, hacemos fallback a VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
//   para que el tracker viaje al mismo proyecto que el client principal.
const trackerUrlRaw = (
  import.meta.env.VITE_SUPABASE_TRACKER_URL ||
  import.meta.env.VITE_SUPABASE_URL ||
  ""
).trim();
const trackerAnonRaw = (
  import.meta.env.VITE_SUPABASE_TRACKER_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ""
).trim();

const url = mustBeSupabaseUrl(trackerUrlRaw);
const anon = String(trackerAnonRaw || "").trim();

const storage = getLocalStorage();
const projectRef = projectRefFromUrl(url);
const sdkStorageKey = projectRef ? `sb-${projectRef}-auth-token` : null;

let client = null;

if (url && anon) {
  const g = globalThis;
  if (!g.__SUPABASE_TRACKER__) {
    g.__SUPABASE_TRACKER__ = createClient(url, anon, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage,
      },
    });
  }
  client = g.__SUPABASE_TRACKER__;
}

export const supabaseTracker = client;

if (!url || !anon) {
  console.error("[supabaseTrackerClient] INVALID/MISSING config:", {
    trackerUrlRaw,
    hasTrackerUrl: !!url,
    hasTrackerAnon: !!anon,
  });
} else {
  console.log("[supabaseTrackerClient] tracker client ready:", {
    url,
    storageKey: sdkStorageKey || "sdk-default",
    hasLocalStorage: !!storage,
    singleton: true,
    flowType: "pkce",
  });
}
