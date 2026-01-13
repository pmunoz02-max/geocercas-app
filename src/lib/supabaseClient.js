// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "[supabaseClient] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Fix env vars and redeploy."
  );
}

// ✅ Memory-only storage: funciona incluso si el navegador bloquea localStorage/sessionStorage.
// ⚠️ Limitación: al recargar la página se pierde la sesión (porque no hay persistencia).
function createMemoryStorage() {
  const mem = new Map();
  return {
    getItem: (key) => (mem.has(key) ? mem.get(key) : null),
    setItem: (key, value) => mem.set(key, String(value)),
    removeItem: (key) => mem.delete(key),
  };
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: createMemoryStorage(),
  },
});

export function getSupabase() {
  return supabase;
}

export default supabase;
