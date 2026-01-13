// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isProd = import.meta.env.PROD === true;

// En SaaS: si falta config en PROD, fallamos fuerte (para no “romper en silencio”)
if ((!SUPABASE_URL || !SUPABASE_ANON_KEY) && isProd) {
  // Esto evita que la app “parezca” loguear pero rebote.
  throw new Error(
    "[supabaseClient] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in production build. " +
      "Fix Vercel env vars and redeploy."
  );
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("[supabaseClient] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
}

// ✅ SINGLETON real
export const supabase = createClient(SUPABASE_URL || "", SUPABASE_ANON_KEY || "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

// ✅ Compatibilidad con imports legacy
export function getSupabase() {
  return supabase;
}

export default supabase;
