// src/lib/inviteApi.js
import { supabase } from "../supabaseClient";

// Obtiene la org actual del usuario autenticado desde la RPC
async function getCurrentOrgId() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("[inviteApi] Error obteniendo usuario actual", userError);
    throw new Error("No se pudo obtener el usuario actual");
  }

  if (!user) {
    throw new Error("No hay sesión activa");
  }

  const { data, error } = await supabase.rpc("get_current_org_id");

  if (error) {
    console.error("[inviteApi] Error obteniendo organización actual", error);
    throw new Error("No se pudo determinar la organización actual");
  }

  if (!data) {
    throw new Error("El usuario no tiene organización asignada");
  }

  return data; // uuid org_id
}

// Invitar TRACKER
export async function sendMagicLinkToTracker(email, redirectOrigin) {
  if (!email) throw new Error("Email requerido");

  const tenantId = await getCurrentOrgId();
  const origin = redirectOrigin || window.location.origin;

  // El callback decide /tracker-gps vs /inicio
  const emailRedirectTo = `${origin}/auth/callback`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      shouldCreateUser: true,
      data: {
        invited_as: "tracker",
        tenant_id: tenantId,
      },
    },
  });

  if (error) {
    console.error("[inviteApi] Error enviando magic link a tracker", error);
    throw error;
  }
}

// Invitar ADMIN
export async function sendMagicLinkToAdmin(email, redirectOrigin) {
  if (!email) throw new Error("Email requerido");

  const tenantId = await getCurrentOrgId();
  const origin = redirectOrigin || window.location.origin;
  const emailRedirectTo = `${origin}/auth/callback`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      shouldCreateUser: true,
      data: {
        invited_as: "admin",
        tenant_id: tenantId,
      },
    },
  });

  if (error) {
    console.error("[inviteApi] Error enviando magic link a admin", error);
    throw error;
  }
}
