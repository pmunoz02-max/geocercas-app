// src/supabaseClient.js
// Wrapper de compatibilidad.
// ✅ Mantiene TODOS los exports existentes desde ./lib/supabaseClient (incluye supabase, etc.)
// ✅ Agrega "supabaseRecovery" (solo reset/recovery) con storageKey separado.
// 🔒 BLINDAJE: si falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY, lanza error (evita /auth/v1/otp relativo).

import { createClient } from "@supabase/supabase-js";

// Re-exporta TODO lo que ya tenías (incluye supabase, etc.)
export * from "./lib/supabaseClient";
export { default } from "./lib/supabaseClient";

// --- ENV (Vite) ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function requireEnv(name, value) {
  if (!value || typeof value !== "string" || !value.trim()) {
    // Error fuerte y explícito para NO caer en requests relativos (/auth/v1/otp)
    throw new Error(
      `[supabaseClient] Missing ${name}. ` +
        `Configura Vercel Env Vars (Production + Preview) y redeploy.`
    );
  }
}

requireEnv("VITE_SUPABASE_URL", SUPABASE_URL);
requireEnv("VITE_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);

// --- Cliente recovery-only ---
// Úsalo SOLO en /reset-password (y páginas de recuperación similares).
// IMPORTANTÍSIMO: storageKey separado evita interferencia con tu Ruta B.
export const supabaseRecovery = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "tg_recovery_auth",
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
