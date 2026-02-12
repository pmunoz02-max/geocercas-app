// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client — FRONTEND (Vite)
 * Arquitectura FINAL:
 * - Implicit flow (hash token) ✅
 * - Token opcional en memoria (para bootstrap)
 * - NO localStorage (ni PKCE verifier, ni sesión persistente)
 * - Backend cookie tg_at es la fuente de verdad real
 */

function normUrl(u) {
  return String(u || "")
    .trim()
    .replace(/\s+/g, "") // ✅ elimina \n y espacios dentro (Vercel env a veces trae '\n')
    .replace(/\/+$/, "");
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

const RAW_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const RAW_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SUPABASE_URL = normUrl(RAW_SUPABASE_URL);
export const SUPABASE_ANON_KEY = String(RAW_SUPABASE_ANON_KEY || "").trim();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "[supabaseClient] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el build."
  );
}

if (!isSupabaseUrl(SUPABASE_URL)) {
  throw new Error(`[supabaseClient] Supabase URL inválida: ${SUPABASE_URL}`);
}

const EXPECTED_PROJECT_REF = "mujwsfhkocsuuahlrssn";
const currentRef = projectRefFromUrl(SUPABASE_URL);

if (currentRef !== EXPECTED_PROJECT_REF) {
  throw new Error(
    `[supabaseClient] Proyecto incorrecto. Esperado ${EXPECTED_PROJECT_REF} pero llegó ${currentRef}`
  );
}

// ✅ Token solo en memoria (para enviar Bearer al backend bootstrap si hace falta)
let __memoryAccessToken = null;

export function setMemoryAccessToken(token) {
  __memoryAccessToken = token ? String(token) : null;
}

export function getMemoryAccessToken() {
  return __memoryAccessToken;
}

// ✅ Storage no persistente (evita PKCE/verifier y sesión en localStorage)
const memoryStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  key: () => null,
  get length() {
    return 0;
  },
};

function toHeaders(h) {
  // Convierte headers "raros" a Headers
  if (!h) return new Headers();
  if (h instanceof Headers) return new Headers(h);
  return new Headers(h); // objeto plano o array de pares
}

const wrappedFetch = async (url, options = {}) => {
  const headers = toHeaders(options.headers);

  // ✅ Adjunta Bearer desde memoria si no existe Authorization
  if (__memoryAccessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${__memoryAccessToken}`);
  }

  return fetch(url, { ...options, headers });
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: "implicit",
    detectSessionInUrl: false,

    // ✅ cookie-backed => sin persistencia / refresh
    persistSession: false,
    autoRefreshToken: false,

    storage: memoryStorage,
  },
  global: {
    fetch: wrappedFetch,
  },
});

if (typeof window !== "undefined") {
  const info = {
    MODE: import.meta.env.MODE,
    ORIGIN: window.location.origin,
    SUPABASE_URL,
    PROJECT_REF: currentRef,
    HAS_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
    FLOW: "implicit",
    PERSIST_SESSION: false,
    AUTO_REFRESH: false,
  };
  console.info("[ENV CHECK v3 - AUTH FINAL]", info);
  window.__supabase__ = supabase;
}
