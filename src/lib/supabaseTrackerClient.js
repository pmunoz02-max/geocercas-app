import { createClient } from "@supabase/supabase-js";

/**
 * Permanente:
 * - Usa TRACKER_* si existe, si no usa APP_*.
 * - Storage aislado: sb-tracker-auth (no pisa dashboard).
 * - VALIDACIÓN: la URL debe ser *.supabase.co (evita CORS por env mal seteado).
 */

function mustBeSupabaseUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  // Acepta localhost (dev) o supabase.co
  const ok = u.includes(".supabase.co") || u.includes("localhost");
  return ok ? u : "";
}

const appUrlRaw = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const appAnonRaw = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

const trackerUrlRaw = (import.meta.env.VITE_SUPABASE_TRACKER_URL || "").trim();
const trackerAnonRaw = (import.meta.env.VITE_SUPABASE_TRACKER_ANON_KEY || "").trim();

const url = mustBeSupabaseUrl(trackerUrlRaw) || mustBeSupabaseUrl(appUrlRaw);
const anon = (trackerAnonRaw || appAnonRaw || "").trim();

export const supabaseTracker =
  url && anon
    ? createClient(url, anon, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "sb-tracker-auth",
        },
      })
    : null;

if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.error("[supabaseTrackerClient] INVALID/MISSING config:", {
    trackerUrlRaw,
    appUrlRaw,
    hasAnon: !!anon,
    rule: "URL must be *.supabase.co (never vercel.app / preview domain)",
  });
} else {
  // eslint-disable-next-line no-console
  console.log("[supabaseTrackerClient] tracker client ready:", url);
}
