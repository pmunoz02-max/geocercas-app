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

function normRef(r) {
  return String(r || "").trim();
}

function expectedRefFromEnvOrMode() {
  // ✅ Preferencia: variable explícita por ambiente (universal y permanente)
  const fromEnv = normRef(import.meta.env.VITE_SUPABASE_PROJECT_REF);
  if (fromEnv) return fromEnv;

  // ✅ Fallback seguro por modo/ambiente (evita que producción se rompa si faltó la env)
  // Nota: Vercel define import.meta.env.PROD=true en builds de producción.
  const isProdBuild = Boolean(import.meta.env.PROD);

  // Si no existe VITE_SUPABASE_PROJECT_REF, usamos defaults conocidos del proyecto
  // (mantén estos dos valores alineados con tus proyectos Supabase)
  return isProdBuild ? "wpaixkvokdkudymgjoua" : "mujwsfhkocsuuahlrssn";
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

const EXPECTED_PROJECT_REF = expectedRefFromEnvOrMode();
const currentRef = projectRefFromUrl(SUPABASE_URL);

if (EXPECTED_PROJECT_REF && currentRef !== EXPECTED_PROJECT_REF) {
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
    PROD_BUILD: Boolean(import.meta.env.PROD),
    ORIGIN: window.location.origin,
    SUPABASE_URL,
    PROJECT_REF: currentRef,
    EXPECTED_PROJECT_REF,
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
    console.info(`[${BUILD_MARKER}] [ENV CHECK v4 - REF BY ENV]`, info);
    console.info(`[${BUILD_MARKER}] [BUILD_MARKER_LIST]`, window.__TG_BUILD_MARKERS__);
  }

  window.__supabase__ = supabase;
}
