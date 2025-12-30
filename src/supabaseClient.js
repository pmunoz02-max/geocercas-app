// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Faltan variables de entorno Supabase (panel)");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // ✅ Para links invitación (sin code_verifier) -> IMPLICIT
    flowType: "implicit",
    persistSession: true,
    autoRefreshToken: true,

    // ✅ Esto permite que el SDK lea #access_token del URL
    detectSessionInUrl: true,

    // ✅ Mantén tu key (no romper nada existente)
    storageKey: "sb-tugeocercas-auth-token-panel-authA",
    storage: window.localStorage,
  },
});
