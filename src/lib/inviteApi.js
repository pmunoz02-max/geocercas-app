// Invitar TRACKER usando API /api/invite-tracker
export async function createTrackerInvite({ email, org_id, assignment_id, name, lang = "es", caller_jwt }) {
  if (!email || !org_id || !assignment_id || !caller_jwt) throw new Error("Faltan parámetros obligatorios para crear invitación de tracker");

  const payload = {
    email,
    org_id,
    assignment_id,
    name,
    lang,
    caller_jwt,
    role: "tracker",
  };

  const res = await fetch("/api/invite-tracker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  console.log("[inviteApi] /api/invite-tracker response", data);

  if (!res.ok || !data?.invite_id || !data?.invite_url) {
    throw new Error(data?.message || data?.error || `Error creando invitación: HTTP ${res.status}`);
  }

  // Exponer solo los campos relevantes
  return {
    invite_id: data.invite_id,
    created_at: data.created_at,
    invite_url: data.invite_url,
    raw: data,
  };
}
// src/lib/inviteApi.js
import { supabase } from "../lib/supabaseClient";

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
