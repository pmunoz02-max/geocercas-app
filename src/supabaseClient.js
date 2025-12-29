import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) throw new Error("Faltan vars Supabase");

function isTrackerHostname(hostname) {
  const h = String(hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

const FLOW = isTrackerHostname(window.location.hostname) ? "tracker" : "panel";

const storageKey =
  FLOW === "tracker"
    ? "sb-tugeocercas-auth-token-tracker"
    : "sb-tugeocercas-auth-token-panel";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,

    // CLAVE: nunca auto-capturar sesión desde URL
    detectSessionInUrl: false,

    // CLAVE: aislamiento real por flow
    storageKey,
    storage: window.localStorage,
  },
});
