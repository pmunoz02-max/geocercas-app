// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Faltan variables de entorno Supabase (panel)");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // ✅ Para links invite/magiclink con token_hash (sin code_verifier)
    flowType: "implicit",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,

    // ✅ Mantén EXACTO tu storageKey actual (no romper sesiones existentes)
    storageKey: "sb-tugeocercas-auth-token-panel-authA",
    storage: window.localStorage,
  },
});
