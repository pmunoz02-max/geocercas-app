// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

/**
 * Pequeño helper para leer variables de entorno
 * que funcione en:
 * - Vite (import.meta.env)
 * - Node (process.env)
 * - Inyección manual en window.__ENV__ (por si acaso)
 */
function readEnv(key) {
  // Vite
  if (typeof import.meta !== "undefined" && import.meta.env) {
    const v = import.meta.env[key];
    if (v !== undefined && v !== "") return v;
  }

  // Node / Vercel
  if (typeof process !== "undefined" && process.env) {
    const v = process.env[key];
    if (v !== undefined && v !== "") return v;
  }

  // Fallback en el navegador
  if (typeof window !== "undefined" && window.__ENV__ && window.__ENV__[key]) {
    return window.__ENV__[key];
  }

  return undefined;
}

// ----------------- ENV -----------------

const SUPABASE_URL =
  readEnv("VITE_SUPABASE_URL") || readEnv("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY =
  readEnv("VITE_SUPABASE_ANON_KEY") || readEnv("SUPABASE_ANON_KEY") || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "[supabaseClient] Faltan variables de entorno SUPABASE_URL / SUPABASE_ANON_KEY"
  );
}

// ----------------- CLIENTE -----------------

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // detectSessionInUrl: true hace que getSession() intercambie
    // automáticamente el ?code= de Supabase (PKCE / magic links)
    detectSessionInUrl: true,
  },
});

// ----------------- HELPERS DE AUTH -----------------

/**
 * Envuelve supabase.auth.getSession() con try/catch
 * para que AuthGuard no reviente si algo va mal.
 */
export async function getSessionSafe() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error("[getSessionSafe] error getSession:", error);
      return null;
    }
    return data?.session ?? null;
  } catch (e) {
    console.error("[getSessionSafe] excepción:", e);
    return null;
  }
}

/**
 * Envuelve supabase.auth.getUser()
 */
export async function getUserSafe() {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.error("[getUserSafe] error getUser:", error);
      return null;
    }
    return data?.user ?? null;
  } catch (e) {
    console.error("[getUserSafe] excepción:", e);
    return null;
  }
}

/**
 * Lee el perfil en la tabla profiles para el usuario actual.
 * Devuelve null si no hay usuario o hay error.
 */
export async function getProfileSafe() {
  try {
    const user = await getUserSafe();
    if (!user) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[getProfileSafe] error select:", error);
      return null;
    }
    return data ?? null;
  } catch (e) {
    console.error("[getProfileSafe] excepción:", e);
    return null;
  }
}

/**
 * Suscripción a cambios de sesión (lo usa AuthGuard/AuthContext).
 * Devuelve una función para desuscribirse.
 */
export function onAuthChange(callback) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    try {
      callback(session ?? null);
    } catch (e) {
      console.error("[onAuthChange] callback lanzó error:", e);
    }
  });

  return () => {
    try {
      subscription.unsubscribe();
    } catch (e) {
      console.error("[onAuthChange] error al desuscribir:", e);
    }
  };
}

/**
 * Cierra sesión en todos los dispositivos (scope: 'global').
 */
export async function signOutEverywhere() {
  try {
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      console.error("[signOutEverywhere] error signOut:", error);
      return { error };
    }
    return { error: null };
  } catch (e) {
    console.error("[signOutEverywhere] excepción:", e);
    return { error: e };
  }
}

// ----------------- HELPERS PARA LOGIN -----------------

/**
 * Se ejecuta al cargar la página de Login.
 *
 * Con detectSessionInUrl: true, supabase.auth.getSession()
 * ya hace el exchange de ?code= -> sesión.
 * Aquí solo lo llamamos y limpiamos la URL.
 */
export async function tryExchangeCodeForSessionIfPresent() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error(
        "[tryExchangeCodeForSessionIfPresent] error getSession:",
        error
      );
      return null;
    }

    // Limpia el ?code=, &type=, &provider= de la URL
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      let changed = false;

      ["code", "type", "provider"].forEach((param) => {
        if (url.searchParams.has(param)) {
          url.searchParams.delete(param);
          changed = true;
        }
      });

      if (changed) {
        window.history.replaceState({}, document.title, url.toString());
      }
    }

    return data?.session ?? null;
  } catch (e) {
    console.error(
      "[tryExchangeCodeForSessionIfPresent] excepción intercambiando código:",
      e
    );
    return null;
  }
}

/**
 * Login clásico con email + password.
 * Login.tsx importa: signInWithPassword(email, password)
 */
export async function signInWithPassword(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("[signInWithPassword] error:", error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (e) {
    console.error("[signInWithPassword] excepción:", e);
    return { data: null, error: e };
  }
}

/**
 * Login passwordless vía email (OTP / magic link).
 * Login.tsx importa: signInWithEmailOtp(email)
 */
export async function signInWithEmailOtp(email) {
  try {
    let emailRedirectTo;
    if (typeof window !== "undefined") {
      // Redirige de vuelta al origen actual (tu app)
      emailRedirectTo = window.location.origin;
    }

    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      console.error("[signInWithEmailOtp] error:", error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (e) {
    console.error("[signInWithEmailOtp] excepción:", e);
    return { data: null, error: e };
  }
}

// ----------------- INFO DE ENV (opcional para debug UI) -----------------

export const isEnvReady = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const envInfo = {
  hasUrl: Boolean(SUPABASE_URL),
  hasAnonKey: Boolean(SUPABASE_ANON_KEY),
};
