// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Faltan variables de entorno Supabase (panel A)");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // CLAVE: NO capturar sesión desde URL automáticamente
    detectSessionInUrl: false,
    // CLAVE: aislamiento real por storageKey (panel)
    storageKey: "sb-tugeocercas-auth-token-panel-authA",
    storage: window.localStorage,
  },
});
