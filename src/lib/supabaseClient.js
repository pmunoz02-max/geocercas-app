// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function testStorage(storage) {
  try {
    if (!storage) return false;
    const k = "__sb_storage_test__";
    storage.setItem(k, "1");
    storage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function createMemoryStorage() {
  const mem = new Map();
  return {
    getItem: (key) => (mem.has(key) ? mem.get(key) : null),
    setItem: (key, value) => mem.set(key, String(value)),
    removeItem: (key) => mem.delete(key),
  };
}

function pickStorage() {
  if (typeof window === "undefined") return undefined;

  // Prefer localStorage
  if (testStorage(window.localStorage)) return window.localStorage;

  // Fallback a sessionStorage (muy típico cuando localStorage está bloqueado por políticas)
  if (testStorage(window.sessionStorage)) return window.sessionStorage;

  // Último recurso: memoria (no persiste, pero permite entrar sin rebotes)
  return createMemoryStorage();
}

const chosenStorage = pickStorage();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // En SaaS: que falle evidente en vez de romper en silencio
  throw new Error(
    "[supabaseClient] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Fix env vars and redeploy."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: chosenStorage,
  },
});

export function getSupabase() {
  return supabase;
}

export default supabase;
