// src/supabaseClient.js
// Wrapper de compatibilidad.
// ✅ Mantiene TODOS los exports existentes desde ./lib/supabaseClient (incluye setMemoryAccessToken, supabase, etc.)
// ✅ Agrega un cliente adicional "supabaseRecovery" (solo para reset/recovery) sin romper Ruta B.

import { createClient } from "@supabase/supabase-js";

// Re-exporta TODO lo que ya tenías (incluye setMemoryAccessToken, etc.)
export * from "./lib/supabaseClient";
export { default } from "./lib/supabaseClient";

// --- ENV (Vite) ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.error("[supabaseClient] Missing env vars", {
    VITE_SUPABASE_URL: Boolean(SUPABASE_URL),
    VITE_SUPABASE_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
  });
}

// --- Cliente recovery-only ---
// Úsalo SOLO en /reset-password (y páginas de recuperación similares).
// Permite que verifyOtp/exchangeCodeForSession creen sesión persistida para que updateUser({password}) no falle.
export const supabaseRecovery = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
