// src/lib/inviteApi.js
import { supabase } from "../lib/supabaseClient";

/**
 * Obtiene la org actual del usuario autenticado desde la RPC.
 * Este helper es solo para flujos administrativos autenticados.
 */
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

  return data;
}

/**
 * Invitar TRACKER usando API interna /api/invite-tracker.
 *
 * Regla arquitectónica:
 * TRACKER INVITE != AUTH MAGIC LINK.
 * Este flujo NO usa supabase.auth.signInWithOtp.
 */
export async function createTrackerInvite({
  email,
  org_id,
  assignment_id,
  name,
  lang = "es",
  caller_jwt,
}) {
  if (!email || !org_id || !assignment_id || !caller_jwt) {
    throw new Error("Faltan parámetros obligatorios para crear invitación de tracker");
  }

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

  return {
    invite_id: data.invite_id,
    created_at: data.created_at,
    invite_url: data.invite_url,
    raw: data,
  };
}

/**
 * Invitar TRACKER usando Edge Function send-tracker-invite-brevo.
 *
 * Este es el flujo correcto para invitaciones simples por email:
 * send-tracker-invite-brevo -> /tracker-accept?inviteToken=...&org_id=...
 *
 * Regla arquitectónica:
 * TRACKER INVITE != AUTH MAGIC LINK.
 * Este flujo NO usa supabase.auth.signInWithOtp.
 */
export async function sendTrackerInvite(email, org_id) {
  if (!email || !org_id) {
    throw new Error("Email y org_id requeridos para enviar invitación de tracker");
  }

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-tracker-invite-brevo`;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!fnUrl || !anonKey) {
    throw new Error("Faltan variables de entorno de Supabase para enviar invitación de tracker");
  }

  const res = await fetch(fnUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, org_id }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Error enviando tracker invite: HTTP ${res.status}`);
  }

  return data || { ok: true };
}

/**
 * Invitar ADMIN.
 *
 * Este flujo sí puede usar Supabase Auth porque es para usuarios administrativos,
 * no para trackers runtime.
 */
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

  return { ok: true };
}
