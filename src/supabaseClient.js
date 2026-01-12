// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltan variables de entorno Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)"
  );
}

/**
 * Cliente ÚNICO y BLINDADO de Supabase para la SPA.
 *
 * Decisiones clave:
 * - flowType: "pkce"        -> obligatorio para SPAs modernas
 * - storageKey: DEFAULT     -> evita desincronización (NO custom)
 * - persistSession: true    -> guarda sesión
 * - autoRefreshToken: true  -> mantiene sesión viva
 * - detectSessionInUrl: true-> magic link / recovery
 * - storage: localStorage   -> explícito
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: "pkce",

    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,

    // ⚠️ NO definir storageKey → usar el estándar sb-<project-ref>-auth-token
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
