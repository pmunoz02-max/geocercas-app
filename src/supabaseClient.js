// src/supabaseClient.js
// ✅ Ruta B (API-first) para login normal: NO persistimos sesión en el frontend.
// ✅ Recovery/reset password: usamos un cliente separado que SÍ puede persistir sesión temporalmente.
//
// Exporta:
//   - supabase        -> cliente "normal" (Ruta B, sin sesión)
//   - supabaseRecovery-> cliente "recovery-only" (persistSession/localStorage)
//
// Nota: esto NO cambia tu arquitectura de login; solo habilita el flujo recovery.

import { createClient } from "@supabase/supabase-js";

// --- ENV ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.error("[supabaseClient] Missing env vars", {
    VITE_SUPABASE_URL: Boolean(SUPABASE_URL),
    VITE_SUPABASE_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
  });
}

// Log liviano (útil en Vercel preview) — puedes quitarlo luego
try {
  // eslint-disable-next-line no-console
  console.log("[ENV CHECK]", {
    MODE: import.meta.env.MODE,
    VITE_SUPABASE_URL: SUPABASE_URL,
    HAS_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
  });
} catch (_) {}

// --- Cliente principal (Ruta B) ---
// IMPORTANTE: aquí NO persistimos sesión ni refrescamos tokens.
// El frontend NO hace login normal con Supabase Auth (eso va por /api/auth/password).
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // ✅ Mantiene Ruta B: sin sesiones en browser
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    // storage: undefined (no localStorage/cookies para sesiones)
  },
});

// --- Cliente recovery-only ---
// Este cliente SOLO debe usarse en /reset-password y similares.
// Permite que verifyOtp / exchangeCodeForSession creen una sesión real
// para que updateUser({password}) NO falle con "Auth session missing".
export const supabaseRecovery = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // En recovery necesitamos storage real en el browser
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

export default supabase;
