// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

/**
 * Lee variables de entorno en Vite.
 * Acepta ambos nombres por compatibilidad:
 * - VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (recomendado)
 * - SUPABASE_URL / SUPABASE_ANON_KEY (fallback)
 */
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // ⚠️ Esto te avisa en dev/build si faltan env vars.
  // En producción, Vercel debe tenerlas cargadas.
  // No hacemos throw para no romper tests/builds raros, pero es mejor que esté.
  console.warn(
    "[supabaseClient] Falta SUPABASE_URL o SUPABASE_ANON_KEY en variables de entorno (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)."
  );
}

export const supabase = createClient(SUPABASE_URL ?? "", SUPABASE_ANON_KEY ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "sb-geocercas-auth-token", // fijo y fácil de auditar
  },
});
