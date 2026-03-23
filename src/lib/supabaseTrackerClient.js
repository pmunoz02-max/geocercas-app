import { createClient } from "@supabase/supabase-js";

/**
 * Tracker client
 *
 * ✅ Migrado a PKCE (consistente con el client principal)
 * - Singleton global: globalThis.__SUPABASE_TRACKER__
 * - StorageKey: usar default del SDK para evitar divergencias entre builds
 * - Storage real: localStorage
 * - detectSessionInUrl: false (callback controlado por nuestra app)
 */

function mustBeSupabaseUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  const ok = u.includes(".supabase.co") || u.includes("localhost");
  return ok ? u : "";
}

function getLocalStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {}
  return undefined;
}

function projectRefFromUrl(rawUrl) {
  try {
    return new URL(String(rawUrl || "")).hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}

// --- PREVIEW ALIGNMENT ---
// En preview, usar explícitamente el proyecto preview correcto.
// Nunca reescribir preview hacia producción.
const envKind =
  (typeof window !== "undefined" && window.__TG_ENV_KIND) ||
  import.meta.env.ENV_KIND ||
  import.meta.env.MODE ||
  "";

const PREVIEW_REF = "mujwsfhkocsuuahlrssn";

let trackerUrlRaw = (
  import.meta.env.VITE_SUPABASE_TRACKER_URL ||
  import.meta.env.VITE_SUPABASE_URL ||
  ""
).trim();

let trackerAnonRaw = (
  import.meta.env.VITE_SUPABASE_TRACKER_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ""
).trim();

if (envKind === "preview" || envKind === "staging") {
  trackerUrlRaw = `https://${PREVIEW_REF}.supabase.co`;
}


const url = mustBeSupabaseUrl(trackerUrlRaw);
const anon = String(trackerAnonRaw || "").trim();

// TEMP DEBUG
console.info("[TRACKER ENV DEBUG]", {
  trackerUrl: url,
  trackerAnonPrefix: anon ? anon.slice(0, 20) : null,
  trackerAnonLength: anon ? anon.length : 0,
});


const projectRef = projectRefFromUrl(url);


// Validación única de entorno/projectRef
const EXPECTED_PREVIEW_REF = "mujwsfhkocsuuahlrssn";
const EXPECTED_PROD_REF = "wpaixkvokdkudymgjoua";

const isPreviewProject = projectRef === EXPECTED_PREVIEW_REF;
const isProdProject = projectRef === EXPECTED_PROD_REF;

if (isPreviewProject) {
  console.info("[supabaseTrackerClient] preview project OK", projectRef);
} else if (envKind === "production") {
  if (!isProdProject) {
    throw new Error(
      `[supabaseTrackerClient] Ref incorrecto para producción. Esperado ${EXPECTED_PROD_REF} pero llegó ${projectRef}`
    );
  }
  console.info("[supabaseTrackerClient] production project OK", projectRef);
} else if (envKind === "preview" || envKind === "staging") {
  throw new Error(
    `[supabaseTrackerClient] Ref incorrecto para ${envKind}. Esperado ${EXPECTED_PREVIEW_REF} pero llegó ${projectRef}`
  );
} else {
  console.warn(
    `[supabaseTrackerClient] Entorno no identificado (${envKind}). projectRef=${projectRef}`
  );
}

let client = null;

if (url && anon) {
  const g = globalThis;
  if (!g.__SUPABASE_TRACKER__) {
    g.__SUPABASE_TRACKER__ = createClient(url, anon, {
      auth: {
        flowType: "pkce",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  client = g.__SUPABASE_TRACKER__;
  console.log("[supabaseTrackerClient] tracker client ready", {
    url,
    projectRef,
    envKind,
  });
}

export const supabaseTracker = client;

if (!url || !anon) {
  console.error("[supabaseTrackerClient] INVALID/MISSING config:", {
    trackerUrlRaw,
    hasTrackerUrl: !!url,
    hasTrackerAnon: !!anon,
    envKind,
  });
}