// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("[supabaseClient] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
}

// ============================
// Storage universal (browser/memory)
// ============================
function createMemoryStorage() {
  const mem = new Map();
  return {
    getItem: (key) => (mem.has(key) ? mem.get(key) : null),
    setItem: (key, value) => mem.set(key, value),
    removeItem: (key) => mem.delete(key),
  };
}

const isBrowser = typeof window !== "undefined" && typeof window.localStorage !== "undefined";
const storage = isBrowser ? window.localStorage : createMemoryStorage();

// Clave estable para no “perder sesión” entre versiones
const STORAGE_KEY = "app-geocercas-auth";

// ============================
// Token en memoria (compatibilidad)
// ============================
let MEMORY_ACCESS_TOKEN = null;

export function setMemoryAccessToken(token) {
  MEMORY_ACCESS_TOKEN = token || null;

  // Mantener realtime auth si se usa
  try {
    if (MEMORY_ACCESS_TOKEN && supabase?.realtime?.setAuth) {
      supabase.realtime.setAuth(MEMORY_ACCESS_TOKEN);
    }
  } catch {}
}

export function getMemoryAccessToken() {
  return MEMORY_ACCESS_TOKEN;
}

export function clearMemoryAccessToken() {
  setMemoryAccessToken(null);
}

// ============================
// Fetch con headers correctos
// - apikey siempre
// - Authorization: preferimos session token de Supabase si existe
// - si no existe, usamos MEMORY_ACCESS_TOKEN
// ============================
async function injectedFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("apikey", SUPABASE_ANON_KEY);

  // Si ya hay auth header no lo pisamos
  if (!headers.has("Authorization")) {
    // Preferimos el token en memoria si existe, porque suele ser el mismo de la sesión.
    if (MEMORY_ACCESS_TOKEN) {
      headers.set("Authorization", `Bearer ${MEMORY_ACCESS_TOKEN}`);
    }
  }

  return fetch(url, { ...options, headers });
}

// ============================
// Supabase client (UNIVERSAL)
// ============================
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: injectedFetch },
  auth: {
    persistSession: true,       // ✅ clave
    autoRefreshToken: true,     // ✅ clave
    detectSessionInUrl: true,   // ✅ clave
    storageKey: STORAGE_KEY,    // ✅ estable
    storage,                   // ✅ universal
    flowType: "pkce",           // ✅ recomendado para SPA
  },
});

export default supabase;
