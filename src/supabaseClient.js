// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

// Re-export para compatibilidad con imports existentes
export * from "./lib/supabaseClient";
export { default } from "./lib/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function requireEnv(name, value) {
  if (!value || typeof value !== "string" || !value.trim()) {
    throw new Error(
      `[supabaseClient] Missing ${name}. Revisa Vercel Env Vars (Production/Preview) y redeploy.`
    );
  }
}

requireEnv("VITE_SUPABASE_URL", SUPABASE_URL);
requireEnv("VITE_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);

/**
 * Cliente principal Supabase
 * - Fuente única de verdad para TODA la app
 * - Usa sesión persistente
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "tg_auth",
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

/**
 * Cliente secundario (recovery / flows especiales)
 * NO usar para RPCs normales
 */
export const supabaseRecovery = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "tg_recovery_auth",
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

/* =========================================================
 * 🔧 ADDENDUM DE DEBUG (CONTROLADO Y SEGURO)
 * =========================================================
 *
 * Objetivo:
 * - Poder ejecutar RPCs protegidas (auth.uid())
 *   desde la consola del navegador para debugging.
 *
 * Características:
 * - Solo existe en runtime del browser
 * - No afecta seguridad (usa sesión del usuario)
 * - No cambia lógica de negocio
 * - Se puede quitar en 1 línea cuando termines
 *
 * Uso en DevTools:
 *   await window.__supabase.rpc("admin_enroll_tracker", {...})
 */
if (typeof window !== "undefined") {
  // Exponer SOLO el cliente principal (no recovery)
  window.__supabase = supabase;
}
