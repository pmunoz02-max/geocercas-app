import { createClient } from "@supabase/supabase-js";

/**
 * Permanente y universal:
 * - Si se usa TRACKER_URL => REQUIERE TRACKER_ANON (no fallback al anon de App).
 * - Storage aislado: sb-tracker-auth (no pisa dashboard).
 * - Persistencia real en navegador: localStorage (si existe).
 * - detectSessionInUrl: true (clave para magic link / code exchange).
 * - Validación URL: *.supabase.co o localhost.
 */

function mustBeSupabaseUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  const ok = u.includes(".supabase.co") || u.includes("localhost");
  return ok ? u : "";
}

function safeLocalStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {}
  return undefined; // supabase-js usará default si aplica
}

const appUrlRaw = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const appAnonRaw = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

const trackerUrlRaw = (import.meta.env.VITE_SUPABASE_TRACKER_URL || "").trim();
const trackerAnonRaw = (import.meta.env.VITE_SUPABASE_TRACKER_ANON_KEY || "").trim();

const trackerUrl = mustBeSupabaseUrl(trackerUrlRaw);
const appUrl = mustBeSupabaseUrl(appUrlRaw);

// 🔒 Regla universal anti-“mezcla”:
// - Si hay TRACKER_URL válida => se debe usar TRACKER_ANON (si falta, es error).
// - Solo si NO hay TRACKER_URL válida, usamos APP_URL + APP_ANON.
let url = "";
let anon = "";
let source = "";

if (trackerUrl) {
  url = trackerUrl;
  anon = trackerAnonRaw; // 👈 NO fallback
  source = "TRACKER";
} else {
  url = appUrl;
  anon = appAnonRaw;
  source = "APP";
}

url = String(url || "").trim();
anon = String(anon || "").trim();

export const supabaseTracker =
  url && anon
    ? createClient(url, anon, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "sb-tracker-auth",
          storage: safeLocalStorage(), // 👈 fuerza persistencia en navegador
        },
      })
    : null;

if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.error("[supabaseTrackerClient] INVALID/MISSING config:", {
    source,
    trackerUrlRaw,
    hasTrackerUrl: !!trackerUrl,
    hasTrackerAnon: !!trackerAnonRaw,
    appUrlRaw,
    hasAppUrl: !!appUrl,
    hasAppAnon: !!appAnonRaw,
    rule1: "If TRACKER_URL is set => TRACKER_ANON must be set (no fallback).",
    rule2: "URL must be *.supabase.co or localhost (never vercel.app / preview domain).",
  });
} else {
  // eslint-disable-next-line no-console
  console.log("[supabaseTrackerClient] tracker client ready:", {
    source,
    url,
    storageKey: "sb-tracker-auth",
    hasLocalStorage: !!safeLocalStorage(),
  });
}
