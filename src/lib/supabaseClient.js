// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client — FRONTEND (Vite)
 * Arquitectura FINAL:
 * - Implicit flow (hash token) ✅
 * - Token opcional en memoria (para bootstrap)
 * - NO localStorage
 * - Backend cookie tg_at es la fuente de verdad real
 */

const BUILD_MARKER = "BUILD_MARKER_PREVIEW_20260212_A";

function normUrl(u) {
  return String(u || "")
    .trim()
    .replace(/\s+/g, "")
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

// ✅ Token solo en memoria (para enviar Bearer al backend si hace falta)
let __memoryAccessToken = null;

export function setMemoryAccessToken(token) {
  __memoryAccessToken = token ? String(token) : null;
}

export function getMemoryAccessToken() {
  return __memoryAccessToken;
}

// ✅ Storage NO persistente
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
  if (!h) return new Headers();
  if (h instanceof Headers) return new Headers(h);
  return new Headers(h);
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

    // ✅ CLAVE: permitir capturar access_token desde URL hash del Magic Link
    // (No persiste sesión; solo “lee” el hash una vez)
    detectSessionInUrl: true,

    persistSession: false,
    autoRefreshToken: false,
    storage: memoryStorage,
  },
  global: { fetch: wrappedFetch },
});

if (typeof window !== "undefined") {
  window.__TG_SUPABASE_ENV_LOGGED__ = window.__TG_SUPABASE_ENV_LOGGED__ || false;

  const info = {
    BUILD_MARKER,
    MODE: import.meta.env.MODE,
    ORIGIN: window.location.origin,
    SUPABASE_URL,
    PROJECT_REF: currentRef,
    HAS_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
    FLOW: "implicit",
    PERSIST_SESSION: false,
    AUTO_REFRESH: false,
    SOURCE: "src/lib/supabaseClient.js",
  };

  window.__TG_BUILD_MARKERS__ = window.__TG_BUILD_MARKERS__ || [];
  window.__TG_BUILD_MARKERS__.push({
    marker: BUILD_MARKER,
    at: Date.now(),
    from: "src/lib/supabaseClient.js",
  });

  if (!window.__TG_SUPABASE_ENV_LOGGED__) {
    window.__TG_SUPABASE_ENV_LOGGED__ = true;
    console.info(`[${BUILD_MARKER}] [ENV CHECK v3 - AUTH FINAL]`, info);
    console.info(`[${BUILD_MARKER}] [BUILD_MARKER_LIST]`, window.__TG_BUILD_MARKERS__);
  }

  window.__supabase__ = supabase;
}
