// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Faltan variables de entorno Supabase (panel A)");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // ✅ PKCE estable para magic links con ?code=
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,

    // ✅ Dejar que Supabase capture sesión del callback
    detectSessionInUrl: true,

    // ✅ Mantener tu aislamiento por storageKey (panel)
    storageKey: "sb-tugeocercas-auth-token-panel-authA",
    storage: window.localStorage,
  },
});
