// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

// Helpers
function normUrl(u) {
  return String(u || "").trim().replace(/\/$/, "");
}

// Env resolution (Vite-first, then generic fallbacks)
const RAW_SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const RAW_SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY_PUBLIC ||
  import.meta.env.SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export const SUPABASE_URL = normUrl(RAW_SUPABASE_URL);
export const SUPABASE_ANON_KEY = String(RAW_SUPABASE_ANON_KEY || "").trim();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "[supabaseClient] Faltan SUPABASE_URL / SUPABASE_ANON_KEY. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY."
  );
}

// Local storage safe getter
const storage =
  typeof window !== "undefined" && window?.localStorage ? window.localStorage : undefined;

/**
 * ✅ Config universal para App Geocercas (Web SPA + Magic Link + PKCE):
 * - flowType: "pkce"
 * - persistSession: true
 * - autoRefreshToken: true
 * - detectSessionInUrl: true ✅
 * - storage: localStorage (explícito)
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage,
  },
});
