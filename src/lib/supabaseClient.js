// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

// ---- Config ENV (Vite) ----
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ---- Debug controlado ----
const AUTH_DEBUG =
  String(import.meta.env.AUTH_DEBUG ?? "").toLowerCase() === "true" ||
  String(import.meta.env.VITE_AUTH_DEBUG ?? "").toLowerCase() === "true";

if (AUTH_DEBUG) {
  // eslint-disable-next-line no-console
  console.info("[Supabase ENV]", {
    MODE: import.meta.env.MODE,
    HAS_URL: Boolean(SUPABASE_URL),
    HAS_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
  });
}

// ---- Cliente seguro ----
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
  console.error(
    "[Supabase] Cliente NO inicializado. Faltan ENV vars:",
    {
      VITE_SUPABASE_URL: SUPABASE_URL ? "OK" : "MISSING",
      VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY ? "OK" : "MISSING",
    }
  );
}

// ---- Helpers ----
export function getSupabase() {
  if (!supabase) {
    throw new Error(
      "[Supabase] Cliente no disponible. Revisa variables de entorno en Vercel Preview."
    );
  }
  return supabase;
}

export { supabase };
export default supabase;
