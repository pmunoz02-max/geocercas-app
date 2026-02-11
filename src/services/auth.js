// src/services/auth.js
import { supabase } from "../lib/supabaseClient";

/**
 * Envío UNIVERSAL de Magic Link:
 * - SIEMPRE fuerza /auth/callback como destino (PKCE)
 * - Evita caer en /?code=... por usar Site URL por defecto
 * - Permite override opcional (redirectTo), pero si viene vacío usa window.location.origin
 */

function buildEmailRedirectTo(redirectTo) {
  // Si el caller pasa un redirectTo explícito, lo usamos tal cual.
  if (redirectTo && typeof redirectTo === "string" && redirectTo.trim()) {
    return redirectTo.trim();
  }

  // Default universal: mismo origin + /auth/callback
  // (funciona en preview/prod, y evita hardcodes)
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";

  // Si por alguna razón no hay window (SSR), igual devolvemos ruta relativa
  return origin ? `${origin}/auth/callback` : "/auth/callback";
}

export async function sendMagicLink(email, redirectTo) {
  const emailRedirectTo = buildEmailRedirectTo(redirectTo);

  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      // NO tocamos shouldCreateUser aquí; que cada flujo invite/signup lo maneje si aplica.
    },
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  return true;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session ?? null;
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return data.subscription;
}
