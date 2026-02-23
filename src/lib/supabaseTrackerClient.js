import { createClient } from "@supabase/supabase-js";

/**
 * Preview ONLY - Tracker client
 *
 * ✅ Migrado a PKCE (consistente con el client principal)
 * - Singleton global: globalThis.__SUPABASE_TRACKER__
 * - StorageKey fijo: sb-tracker-auth
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

const trackerUrlRaw = (import.meta.env.VITE_SUPABASE_TRACKER_URL || "").trim();
const trackerAnonRaw = (import.meta.env.VITE_SUPABASE_TRACKER_ANON_KEY || "").trim();

const url = mustBeSupabaseUrl(trackerUrlRaw);
const anon = String(trackerAnonRaw || "").trim();

const storage = getLocalStorage();

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
        storageKey: "sb-tracker-auth",
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
    storageKey: "sb-tracker-auth",
    hasLocalStorage: !!storage,
    singleton: true,
    flowType: "pkce",
  });
}
