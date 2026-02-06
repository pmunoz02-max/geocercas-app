// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client — FRONTEND (Vite)
 * Reglas:
 * - SOLO usa variables VITE_*
 * - Falla temprano si faltan
 * - Log claro para verificar Preview vs Prod
 */

function normUrl(u) {
  return String(u || "").trim().replace(/\/+$/, "");
}

function isSupabaseUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function projectRefFromUrl(u) {
  try {
    return new URL(u).hostname.split(".")[0];
  } catch {
    return "";
  }
}

// 🔒 SOLO variables VITE_* (frontend)
const RAW_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const RAW_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const SUPABASE_URL = normUrl(RAW_SUPABASE_URL);
export const SUPABASE_ANON_KEY = String(RAW_SUPABASE_ANON_KEY || "").trim();

// ❌ Falla temprano si algo está mal
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "[supabaseClient] Missing env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for Preview."
  );
}

if (!isSupabaseUrl(SUPABASE_URL)) {
  throw new Error(
    `[supabaseClient] Invalid Supabase URL: ${SUPABASE_URL}`
  );
}

const storage =
  typeof window !== "undefined" && window.localStorage
    ? window.localStorage
    : undefined;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage,
  },
});

// 🔍 Debug visible en browser (NO expone la key)
if (typeof window !== "undefined") {
  const info = {
    MODE: import.meta.env.MODE,
    ORIGIN: window.location.origin,
    SUPABASE_URL,
    PROJECT_REF: projectRefFromUrl(SUPABASE_URL),
    HAS_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
  };

  console.info("[ENV CHECK]", info);

  // mismo singleton
  window.__supabase__ = supabase;
}
