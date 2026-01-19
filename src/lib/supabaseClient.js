// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

// ---- Config ENV (Vite) ----
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Debug controlado (seguro para frontend)
const AUTH_DEBUG =
  String(import.meta.env.AUTH_DEBUG ?? "").toLowerCase() === "true" ||
  String(import.meta.env.VITE_AUTH_DEBUG ?? "").toLowerCase() === "true";

if (AUTH_DEBUG) {
  // eslint-disable-next-line no-console
  console.info("[Supabase ENV]", {
    MODE: import.meta.env.MODE,
    HAS_URL: Boolean(SUPABASE_URL),
    HAS_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
    VITE_SUPABASE_URL: SUPABASE_URL || "(missing)",
  });
}

// ---- Memory token (compat con flows existentes) ----
let memoryAccessToken = null;

export function setMemoryAccessToken(token) {
  memoryAccessToken = token || null;
}

export function getMemoryAccessToken() {
  return memoryAccessToken;
}

export function clearMemoryAccessToken() {
  memoryAccessToken = null;
}

// ---- Cliente seguro (NO romper build; NO requests sin apikey) ----
let supabase = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
} else {
  // eslint-disable-next-line no-console
  console.error("[Supabase] Cliente NO inicializado. Faltan ENV vars:", {
    VITE_SUPABASE_URL: SUPABASE_URL ? "OK" : "MISSING",
    VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY ? "OK" : "MISSING",
  });
}

// Si en tu app a veces necesitas “obtener el cliente”
export function getSupabase() {
  if (!supabase) {
    throw new Error(
      "[Supabase] Cliente no disponible. Revisa ENV vars en Vercel (Preview) y redeploy."
    );
  }
  return supabase;
}

export { supabase };
export default supabase;
