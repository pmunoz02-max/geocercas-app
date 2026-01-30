// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY_PUBLIC;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "[supabaseClient] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en env vars"
  );
}

/**
 * ✅ Config universal para App Geocercas (Web SPA + Magic Link + PKCE):
 * - flowType: "pkce" (mantiene tu auth moderna)
 * - persistSession: true (necesario para trackers)
 * - autoRefreshToken: true (sesión estable)
 * - detectSessionInUrl: true ✅ (CLAVE: permite que Supabase detecte/hidrate sesión cuando el URL trae tokens/códigos)
 * - storage: localStorage (explícito, evita edge cases en algunos navegadores)
 *
 * Nota:
 * Aunque tú proceses token_hash en /auth/callback con verifyOtp(),
 * activar detectSessionInUrl NO rompe ese flujo y ayuda a que la sesión quede persistida.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // ✅ CAMBIO CLAVE
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
