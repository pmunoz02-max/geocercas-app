// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("[supabaseClient] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
}

// ✅ SINGLETON real (UNICO createClient del frontend)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

// ✅ Default export legacy
export default supabase;
