// src/services/auth.js
import { supabase } from "../supabaseClient";

/**
 * Magic Link UNIVERSAL:
 * - SIEMPRE usa /auth/callback
 * - Ignora redirectTo externo
 * - Evita redirect_to=/ raíz
 */

function getCallbackUrl() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/auth/callback`;
  }
  return "/auth/callback";
}

export async function sendMagicLink(email) {
  const emailRedirectTo = getCallbackUrl();

  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      shouldCreateUser: true,
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
