// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltan variables Supabase: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY"
  );
}

/**
 * ✅ Cliente ÚNICO, estable para SPA:
 * - flowType: "pkce" (correcto para SPAs modernas)
 * - persistSession: true
 * - autoRefreshToken: true
 * - detectSessionInUrl: true (magiclink / recovery)
 * - storage: localStorage explícito
 *
 * ⚠️ Importante: NO usar storageKey custom. El estándar evita desync.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    // NO storageKey: usa sb-<project-ref>-auth-token
  },
});
