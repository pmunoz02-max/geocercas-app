// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client — FRONTEND (Vite)
 * Arquitectura universal (Preview/Prod):
 * - Preview -> Supabase Preview
 * - Prod    -> Supabase Prod
 *
 * ✅ PKCE para Magic Links (móvil/WebView)
 *
 * FIX 2026-02-28:
 * - BUILD_MARKER dinámico (no "PREVIEW" hardcode)
 * - Export debug en window.__TG_SUPABASE_INFO__ para inspección rápida
 */

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

/**
 * Determina el "tipo de entorno" por hostname (fuente de verdad).
 */
function detectEnvKind() {
  if (typeof window === "undefined") return "unknown";
  const h = String(window.location.hostname || "").toLowerCase();

  if (h === "preview.tugeocercas.com" || h.startsWith("preview.")) return "preview";
  if (h === "staging.tugeocercas.com" || h.startsWith("staging.")) return "staging";
  if (h === "app.tugeocercas.com" || h === "tugeocercas.com") return "production";
  if (h.endsWith(".vercel.app")) return "preview";

  return "unknown";
}

function expectedRefByHostname(currentRef) {
  const envKind = detectEnvKind();

  const fromEnvPreview = normRef(import.meta.env.VITE_SUPABASE_PREVIEW_PROJECT_REF);
  const fromEnvProd = normRef(import.meta.env.VITE_SUPABASE_PROD_PROJECT_REF);

  const DEFAULT_PREVIEW_REF = "wpaixkvokdkudymgjoua";
  const DEFAULT_PROD_REF = "wpaixkvokdkudymgjoua";

  if (envKind === "preview" || envKind === "staging") {
    return fromEnvPreview || DEFAULT_PREVIEW_REF;
  }
  if (envKind === "production") {
    return fromEnvProd || DEFAULT_PROD_REF;
  }

  return currentRef || "";
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

const currentRef = projectRefFromUrl(SUPABASE_URL);
const envKind = detectEnvKind();
const EXPECTED_PROJECT_REF = expectedRefByHostname(currentRef);

const BUILD_MARKER = `BUILD_MARKER_${envKind.toUpperCase()}_${import.meta.env.MODE}_${currentRef || "NOREF"}`;

/**
 * Política anti-mezcla:
 * - preview/staging: si apunta a PROD => BLOQUEAR
 * - production: si apunta a PREVIEW => BLOQUEAR
 */
function assertRefSafety() {
  if (!currentRef) {
    throw new Error("[supabaseClient] No se pudo inferir project_ref desde VITE_SUPABASE_URL.");
  }

  if (!EXPECTED_PROJECT_REF) return;

  if (currentRef !== EXPECTED_PROJECT_REF) {
    if (envKind === "preview" || envKind === "staging") {
      throw new Error(
        `[supabaseClient] Proyecto incorrecto para ${envKind}. Esperado ${EXPECTED_PROJECT_REF} pero llegó ${currentRef}`
      );
    }

    if (envKind === "production") {
      throw new Error(
        `[supabaseClient] Proyecto incorrecto para producción. Esperado ${EXPECTED_PROJECT_REF} pero llegó ${currentRef}`
      );
    }

    console.warn(
      `[supabaseClient] [unknown env] ref=${currentRef} != expected=${EXPECTED_PROJECT_REF}. Revisa VITE_SUPABASE_URL/REFs.`
    );
  }
}

assertRefSafety();

// ✅ Token en memoria (para adjuntar Bearer si hace falta)
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

  if (__memoryAccessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${__memoryAccessToken}`);
  }

  return fetch(url, { ...options, headers });
};

// ✅ Storage universal para browser
const browserStorage =
  typeof window !== "undefined" && window?.localStorage ? window.localStorage : undefined;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: "pkce",
    detectSessionInUrl: false,
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
    ENV_KIND: envKind,
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

  window.__TG_SUPABASE_INFO__ = info; // ✅ para inspección rápida
  window.__TG_BUILD_MARKERS__ = window.__TG_BUILD_MARKERS__ || [];
  window.__TG_BUILD_MARKERS__.push({
    marker: BUILD_MARKER,
    at: Date.now(),
    from: "src/lib/supabaseClient.js",
  });

  if (!window.__TG_SUPABASE_ENV_LOGGED__) {
    window.__TG_SUPABASE_ENV_LOGGED__ = true;
    console.info(`[${BUILD_MARKER}] [ENV CHECK]`, info);
    console.info(`[${BUILD_MARKER}] [BUILD_MARKER_LIST]`, window.__TG_BUILD_MARKERS__);
  }

  window.__supabase__ = supabase;
}