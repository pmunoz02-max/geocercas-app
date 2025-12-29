// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Faltan variables de entorno Supabase");
}

// ===============================
// CANONICAL FLOW DETECTION
// ===============================
function isTrackerHostname(hostname) {
  const h = String(hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

const FLOW = isTrackerHostname(window.location.hostname) ? "tracker" : "panel";

/**
 * AISLAMIENTO REAL DE SESIÓN POR FLOW:
 * - Panel y Tracker usan storageKey distinto.
 * - Evita que un login de panel “contamine” el tracker.
 *
 * Nota: mantenemos persistSession=true para UX normal,
 * pero aislado por key => determinístico.
 */
const storageKey =
  FLOW === "tracker"
    ? "sb-tugeocercas-auth-token-tracker"
    : "sb-tugeocercas-auth-token-panel";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,

    // CLAVE: NO permitir que el client “capture” el code/hash por su cuenta.
    // El único lugar autorizado para intercambiar sesión será /auth/callback.
    detectSessionInUrl: false,

    // CLAVE: aislar por flow (tracker vs panel)
    storageKey,

    // Mantén localStorage (está bien), pero ya aislado por storageKey.
    storage: window.localStorage,
  },
});
