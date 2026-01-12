// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Faltan variables de entorno Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
}

/**
 * ✅ Cliente ÚNICO de Supabase para toda la SPA.
 * - persistSession: true  -> guarda tokens en storage
 * - autoRefreshToken: true -> refresca tokens
 * - detectSessionInUrl: true -> captura sesiones provenientes de links (magiclink/recovery)
 *
 * Nota: mantenemos tu storageKey actual para NO romper sesiones existentes.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Para links con token_hash / verify (compat con tu flujo actual)
    flowType: "implicit",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,

    // Mantener EXACTO el storageKey actual (no romper sesiones existentes)
    storageKey: "sb-tugeocercas-auth-token-panel-authA",

    // Guardar en localStorage (safe-guard por si algún bundler evalúa antes de window)
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
