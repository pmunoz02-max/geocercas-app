// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "[supabaseClient] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Fix env vars and redeploy."
  );
}

// Storage que NUNCA bloquea y NUNCA lanza errores
function createNoopMemoryStorage() {
  const mem = new Map();
  return {
    getItem: (key) => {
      try {
        return mem.has(key) ? mem.get(key) : null;
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        mem.set(key, String(value));
      } catch {}
    },
    removeItem: (key) => {
      try {
        mem.delete(key);
      } catch {}
    },
  };
}

function canWrite(storage) {
  try {
    if (!storage) return false;
    const k = "__tg_storage_test__";
    storage.setItem(k, "1");
    storage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

const hasLocal = typeof window !== "undefined" && canWrite(window.localStorage);
const hasSession = typeof window !== "undefined" && canWrite(window.sessionStorage);

// 🔥 Clave: si el device bloquea storage, NO persistimos sesión (evita hang en setSession)
const storageBlocked = !hasLocal && !hasSession;

const chosenStorage = storageBlocked
  ? createNoopMemoryStorage()
  : hasLocal
    ? window.localStorage
    : window.sessionStorage;

// persistSession false cuando storage está bloqueado → setSession deja de colgarse
const persistSession = !storageBlocked;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: chosenStorage,
  },
});

export function getSupabase() {
  return supabase;
}

export default supabase;
