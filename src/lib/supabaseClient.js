// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client — FRONTEND (Vite)
 * Arquitectura universal (Preview/Prod):
 * - El backend (cookie tg_at) es fuente de verdad
 * - El frontend mantiene sesión Supabase para callbacks / flujos UX
 *
 * ✅ Migrado a PKCE para que Magic Links funcionen en móvil/WebView
 *    (ya no dependemos de #access_token en la URL)
 */

const BUILD_MARKER = "BUILD_MARKER_PREVIEW_20260223_PKCE_MIGRATION_A";

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
  // ✅ Universal y permanente:
  // NO hardcodeamos project refs.
  // Si quieres validar que el build apunta al proyecto correcto,
  // define VITE_SUPABASE_PROJECT_REF en el entorno (Vercel/Local).
  return normRef(import.meta.env.VITE_SUPABASE_PROJECT_REF);
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

// ✅ Token en memoria (para adjuntar Bearer al backend si hace falta)
let __memoryAccessToken = null;

export function setMemoryAccessToken(token) {
  __memoryAccessToken = token ? String(token) : null;
}

export function getMemoryAccessToken() {
  return __memoryAccessToken;
}

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

// ✅ Storage universal para browser
const browserStorage =
  typeof window !== "undefined" && window?.localStorage
    ? window.localStorage
    : undefined;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    /**
     * ✅ PKCE: elimina dependencia del hash (#access_token)
     *    El callback llega con ?code=... y lo canjeamos en AuthCallback.
     */
    flowType: "pkce",

    /**
     * Importante: nosotros manejamos el callback en /auth/callback
     * con exchangeCodeForSession(). Evita doble-proceso automático.
     */
    detectSessionInUrl: false,

    /**
     * Mantengo persistSession/autoRefresh como venían (estables).
     * Si en el futuro quieres 100% tokens sólo en memoria, lo cambiamos
     * en un paso separado.
     */
    persistSession: true,
    autoRefreshToken: true,
    storage: browserStorage,
  },
  global: { fetch: wrappedFetch },
});

// ✅ Mantener __memoryAccessToken sincronizado automáticamente
if (typeof window !== "undefined") {
  supabase.auth
    .getSession()
    .then(({ data }) => {
      const token = data?.session?.access_token || null;
      setMemoryAccessToken(token);
    })
    .catch(() => {});

  supabase.auth.onAuthStateChange((_event, session) => {
    setMemoryAccessToken(session?.access_token || null);
  });

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
    FLOW: "pkce",
    DETECT_SESSION_IN_URL: false,
    PERSIST_SESSION: true,
    AUTO_REFRESH: true,
    STORAGE: browserStorage ? "localStorage" : "none",
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
    console.info(`[${BUILD_MARKER}] [ENV CHECK v6 - PKCE]`, info);
    console.info(`[${BUILD_MARKER}] [BUILD_MARKER_LIST]`, window.__TG_BUILD_MARKERS__);
  }

  // debug: NO usar en producción, pero útil en preview
  window.__supabase__ = supabase;
}
