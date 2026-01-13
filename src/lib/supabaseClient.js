// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("[supabaseClient] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
}

// ✅ Token SOLO en memoria (porque tu entorno bloquea storage)
let MEMORY_ACCESS_TOKEN = null;

export function setMemoryAccessToken(token) {
  MEMORY_ACCESS_TOKEN = token || null;
  try {
    // realtime auth (si lo usas)
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

// ✅ Fetch que inyecta Authorization si hay token en memoria
async function injectedFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("apikey", SUPABASE_ANON_KEY);

  if (MEMORY_ACCESS_TOKEN) {
    headers.set("Authorization", `Bearer ${MEMORY_ACCESS_TOKEN}`);
  }

  return fetch(url, { ...options, headers });
}

// 🔥 Importante: NO dependemos de persistSession ni de setSession
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: injectedFetch },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export default supabase;
