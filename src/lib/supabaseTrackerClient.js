import { createClient } from "@supabase/supabase-js";

const TRACKER_URL = (import.meta.env.VITE_SUPABASE_TRACKER_URL || "").trim();
const TRACKER_ANON = (import.meta.env.VITE_SUPABASE_TRACKER_ANON_KEY || "").trim();

function mustBeSupabaseUrl(url) {
  if (!url) return "";
  if (url.includes(".supabase.co") || url.includes("localhost")) return url;
  return "";
}

const url = mustBeSupabaseUrl(TRACKER_URL);
const anon = TRACKER_ANON;

export const supabaseTracker =
  url && anon
    ? createClient(url, anon, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "sb-tracker-auth",
          storage: window.localStorage,   // 👈 FIX CRÍTICO
        },
      })
    : null;

if (!url || !anon) {
  console.error("[supabaseTrackerClient] INVALID CONFIG", {
    hasUrl: !!url,
    hasAnon: !!anon,
  });
} else {
  console.log("[supabaseTrackerClient] tracker client ready", {
    url,
    storageKey: "sb-tracker-auth",
  });
}
