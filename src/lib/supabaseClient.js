// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client — FRONTEND (Vite)
 * - Compatible con flujo normal (persistSession=true, detectSessionInUrl=true)
 * - Compatible con AuthCallback.tsx (token en memoria) vía setMemoryAccessToken
 * - Env: acepta VITE_* y fallbacks (por seguridad de deploys)
 */

function normUrl(u) {
  return String(u || "").trim().replace(/\/+$/, "");
}

function isSupabaseUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function projectRefFromUrl(u) {
  try {
    return new URL(u).hostname.split(".")[0];
  } catch {
    return "";
  }
}

// Env (Vite + fallbacks)
const RAW_SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const RAW_SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY_PUBLIC ||
  import.meta.env.SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export const SUPABASE_URL = normUrl(RAW_SUPABASE_URL);
export const SUPABASE_ANON_KEY = String(RAW_SUPABASE_ANON_KEY || "").trim();

// ✅ Token en memoria (para AuthCallback.tsx)
let __memoryAccessToken = null;

/**
 * Guarda (o limpia) un access token en memoria.
 * No persiste en storage. No loguea token.
 */
export function setMemoryAccessToken(token) {
  __memoryAccessToken = token ? String(token) : null;
}

/** (Opcional) por si lo usas en otra parte */
export function getMemoryAccessToken() {
  return __memoryAccessToken;
}

// Falla temprano si faltan variables
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "[supabaseClient] Faltan env vars. Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (o fallbacks equivalentes)."
  );
}

if (!isSupabaseUrl(SUPABASE_URL)) {
  throw new Error(`[supabaseClient] Supabase URL inválida: ${SUPABASE_URL}`);
}

const storage =
  typeof window !== "undefined" && window.localStorage
    ? window.localStorage
    : undefined;

// ✅ Wrapper fetch: si hay token en memoria, lo agrega como Authorization Bearer
const wrappedFetch = async (url, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (__memoryAccessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${__memoryAccessToken}`);
  }
  return fetch(url, { ...options, headers });
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage,
  },
  global: {
    fetch: wrappedFetch,
  },
});

// Debug browser (NO expone key)
if (typeof window !== "undefined") {
  const info = {
    MODE: import.meta.env.MODE,
    ORIGIN: window.location.origin,
    SUPABASE_URL,
    PROJECT_REF: projectRefFromUrl(SUPABASE_URL),
    HAS_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
  };

  console.info("[ENV CHECK]", info);

  window.__supabase__ = supabase;
  window.__supabase_memory_token_set__ = () => Boolean(__memoryAccessToken);
}
