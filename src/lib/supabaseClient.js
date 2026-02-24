// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client — FRONTEND (Vite)
 * Arquitectura universal (Preview/Prod):
 * - Preview debe apuntar SIEMPRE a Supabase Preview
 * - Producción debe apuntar SIEMPRE a Supabase Prod
 *
 * ✅ PKCE para Magic Links (móvil/WebView)
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

/**
 * Determina el "tipo de entorno" por hostname (fuente de verdad).
 * Esto evita depender de import.meta.env.PROD (que puede ser true en preview).
 */
function detectEnvKind() {
  if (typeof window === "undefined") return "unknown";
  const h = String(window.location.hostname || "").toLowerCase();

  // ✅ Canon: preview.tugeocercas.com
  if (h === "preview.tugeocercas.com" || h.startsWith("preview.")) return "preview";

  // Opcional: staging si lo usas
  if (h === "staging.tugeocercas.com" || h.startsWith("staging.")) return "staging";

  // ✅ Canon prod: app.tugeocercas.com
  if (h === "app.tugeocercas.com" || h === "tugeocercas.com") return "production";

  // vercel.app: normalmente preview
  if (h.endsWith(".vercel.app")) return "preview";

  return "unknown";
}

/**
 * Refs esperados por entorno:
 * - Preferimos variables explícitas por entorno (recomendado)
 * - Si no están, caemos a defaults del proyecto (permanece estable)
 */
function expectedRefByHostname() {
  const envKind = detectEnvKind();

  const fromEnvPreview = normRef(import.meta.env.VITE_SUPABASE_PREVIEW_PROJECT_REF);
  const fromEnvProd = normRef(import.meta.env.VITE_SUPABASE_PROD_PROJECT_REF);

  // Defaults del proyecto (para no depender de VITE_SUPABASE_PROJECT_REF y evitar bloqueos)
  const DEFAULT_PREVIEW_REF = "mujwsfhkocsuuahlrssn";
  const DEFAULT_PROD_REF = "wpaixkvokdkudymgjoua";

  if (envKind === "preview" || envKind === "staging") {
    return fromEnvPreview || DEFAULT_PREVIEW_REF;
  }
  if (envKind === "production") {
    return fromEnvProd || DEFAULT_PROD_REF;
  }

  // unknown: usar legacy si existe
  return normRef(import.meta.env.VITE_SUPABASE_PROJECT_REF);
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
const EXPECTED_PROJECT_REF = expectedRefByHostname();

// ✅ Política de seguridad:
// - En preview/staging: si apunta a PROD => BLOQUEAR
// - En prod: si apunta a PREVIEW => BLOQUEAR
// - Si hay mismatch solo por legacy env var, NO bloquear preview (solo warn)
function assertRefSafety() {
  // Si por alguna razón no podemos inferir, usamos la validación clásica
  if (!EXPECTED_PROJECT_REF) return;

  if (currentRef !== EXPECTED_PROJECT_REF) {
    // Preview/staging: si el expected es preview y llegó algo distinto => bloquear (evita mezclar con prod)
    if (envKind === "preview" || envKind === "staging") {
      throw new Error(
        `[supabaseClient] Proyecto incorrecto para ${envKind}. Esperado ${EXPECTED_PROJECT_REF} pero llegó ${currentRef}`
      );
    }

    // Production: bloquear siempre
    if (envKind === "production") {
      throw new Error(
        `[supabaseClient] Proyecto incorrecto para producción. Esperado ${EXPECTED_PROJECT_REF} pero llegó ${currentRef}`
      );
    }

    // unknown: mantener comportamiento estricto (seguro)
    throw new Error(
      `[supabaseClient] Proyecto incorrecto. Esperado ${EXPECTED_PROJECT_REF} pero llegó ${currentRef}`
    );
  }

  // Extra: si legacy VITE_SUPABASE_PROJECT_REF existe y es distinto, solo advertimos (no rompemos)
  const legacy = normRef(import.meta.env.VITE_SUPABASE_PROJECT_REF);
  if (legacy && legacy !== currentRef) {
    console.warn(
      `[supabaseClient] Warning: VITE_SUPABASE_PROJECT_REF=${legacy} no coincide con URL ref=${currentRef}. ` +
        `Recomendado: remover legacy o setear VITE_SUPABASE_PREVIEW_PROJECT_REF / VITE_SUPABASE_PROD_PROJECT_REF.`
    );
  }
}

assertRefSafety();

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

  window.__TG_BUILD_MARKERS__ = window.__TG_BUILD_MARKERS__ || [];
  window.__TG_BUILD_MARKERS__.push({
    marker: BUILD_MARKER,
    at: Date.now(),
    from: "src/lib/supabaseClient.js",
  });

  if (!window.__TG_SUPABASE_ENV_LOGGED__) {
    window.__TG_SUPABASE_ENV_LOGGED__ = true;
    console.info(`[${BUILD_MARKER}] [ENV CHECK v7 - PKCE + ENV_KIND]`, info);
    console.info(`[${BUILD_MARKER}] [BUILD_MARKER_LIST]`, window.__TG_BUILD_MARKERS__);
  }

  // debug: útil en preview
  window.__supabase__ = supabase;
}