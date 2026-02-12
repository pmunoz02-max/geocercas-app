// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client — FRONTEND (Vite)
 * Fuente única de verdad:
 *   - VITE_SUPABASE_URL
 *   - VITE_SUPABASE_ANON_KEY
 *
 * Arquitectura:
 * - Tokens en memoria opcional (TWA/WebView safe)
 * - Cookie HttpOnly tg_at es la fuente de verdad backend
 *
 * Cambio CLAVE:
 * - flowType: "implicit"  ✅ evita depender de code_verifier (PKCE) en storage
 * - detectSessionInUrl: false (seguimos centralizando en /auth/callback)
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

const RAW_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const RAW_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SUPABASE_URL = normUrl(RAW_SUPABASE_URL);
export const SUPABASE_ANON_KEY = String(RAW_SUPABASE_ANON_KEY || "").trim();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("[supabaseClient] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el build.");
}

if (!isSupabaseUrl(SUPABASE_URL)) {
  throw new Error(`[supabaseClient] Supabase URL inválida: ${SUPABASE_URL}`);
}

const EXPECTED_PROJECT_REF = "mujwsfhkocsuuahlrssn";
const currentRef = projectRefFromUrl(SUPABASE_URL);

if (currentRef !== EXPECTED_PROJECT_REF) {
  throw new Error(`[supabaseClient] Proyecto incorrecto. Esperado ${EXPECTED_PROJECT_REF} pero llegó ${currentRef}`);
}

let __memoryAccessToken = null;

export function setMemoryAccessToken(token) {
  __memoryAccessToken = token ? String(token) : null;
}

export function getMemoryAccessToken() {
  return __memoryAccessToken;
}

const storage =
  typeof window !== "undefined" && window.localStorage
    ? window.localStorage
    : undefined;

const wrappedFetch = async (url, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (__memoryAccessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${__memoryAccessToken}`);
  }
  return fetch(url, { ...options, headers });
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // ✅ UNIVERSAL: no depende de code_verifier
    flowType: "implicit",

    // Para tu arquitectura cookie-backed, esto puede estar ON u OFF.
    // Lo dejamos ON por compatibilidad, pero la verdad la tendrá tg_at (backend).
    persistSession: true,
    autoRefreshToken: true,

    // ✅ seguimos centralizando parsing en /auth/callback (tu código)
    detectSessionInUrl: false,

    storage,
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
  };
  console.info("[ENV CHECK v3 - PREVIEW]", info);
  window.__supabase__ = supabase;
}
