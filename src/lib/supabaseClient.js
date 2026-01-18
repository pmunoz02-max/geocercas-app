// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

// ---- Config ENV (Vite) ----
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Debug controlado (no usa service role, seguro para frontend)
const AUTH_DEBUG =
  String(import.meta.env.AUTH_DEBUG ?? "").toLowerCase() === "true" ||
  String(import.meta.env.VITE_AUTH_DEBUG ?? "").toLowerCase() === "true";

// Fail-fast: si Preview no tiene envs, NO hagas fallback a prod jamás
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Esto evita “fall back” silencioso (que es lo que te está causando CORS)
  throw new Error(
    `[Supabase] Faltan variables de entorno. ` +
      `VITE_SUPABASE_URL=${SUPABASE_URL ? "OK" : "MISSING"}, ` +
      `VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY ? "OK" : "MISSING"}`
  );
}

if (AUTH_DEBUG) {
  // eslint-disable-next-line no-console
  console.info("[Supabase ENV]", {
    MODE: import.meta.env.MODE,
    VITE_SUPABASE_URL: SUPABASE_URL,
    HAS_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
  });
}

// ---- Memory token (por si lo usas en flows no-JS o custom) ----
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

// ---- Singleton ----
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});

// Si en tu app a veces necesitas “obtener el cliente”
export function getSupabase() {
  return supabase;
}

export default supabase;
