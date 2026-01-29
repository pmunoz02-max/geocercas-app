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
 * ✅ Config universal para tu flujo:
 * - PKCE ON (links traen ?code=...)
 * - detectSessionInUrl OFF (la sesión la procesa /auth/callback con exchangeCodeForSession)
 * - NO sobrescribimos storageKey (deja el default sb-<project>-auth-token)
 *   para que tu UI/backend puedan leer el access_token correctamente.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
