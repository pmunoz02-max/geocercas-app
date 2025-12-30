// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Faltan variables de entorno Supabase (panel)");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: "pkce",          // ✅ CLAVE
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,  // ✅ CLAVE (permite callback con ?code=)
    storageKey: "sb-tugeocercas-panel-auth",
    storage: window.localStorage,
  },
});
