import { createClient } from "@supabase/supabase-js";

/**
 * Tracker client
 *
 * ✅ Migrado a PKCE (consistente con el client principal)
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


// --- PREVIEW ALIGNMENT ---
// En preview, forzar el mismo ref que billing/paddle si no está definido explícitamente
const envKind = (typeof window !== "undefined" && window.__TG_ENV_KIND) || import.meta.env.ENV_KIND || import.meta.env.MODE || "";
const DEFAULT_PREVIEW_REF = "wpaixkvokdkudymgjoua";
let trackerUrlRaw = (
  import.meta.env.VITE_SUPABASE_TRACKER_URL ||
  import.meta.env.VITE_SUPABASE_URL ||
  ""
).trim();
let trackerAnonRaw = (
  import.meta.env.VITE_SUPABASE_TRACKER_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ""
).trim();

if ((envKind === "preview" || envKind === "staging") && trackerUrlRaw && trackerUrlRaw.includes("mujwsfhkocsuuahlrssn")) {
  trackerUrlRaw = `https://${DEFAULT_PREVIEW_REF}.supabase.co`;
  // Si tienes el anon key de preview, ponlo aquí manualmente o usa el de VITE_SUPABASE_ANON_KEY
}

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
  // Log de ref activo
  console.log("[supabaseTrackerClient] tracker client ready", {
    url,
    storageKey: sdkStorageKey,
    projectRef,
  });
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
