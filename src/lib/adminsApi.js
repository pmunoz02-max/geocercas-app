// src/lib/adminsApi.js
// =======================================================
// API para módulo Administrador / Invitaciones
// - RPCs: admins_list, admins_remove (root-only por backend)
// - Edge Function: invite-user (requiere Authorization: Bearer <JWT>)
// - Extra: extrae y muestra el JSON del error (stage/detail/hint)
// =======================================================

import { supabase } from "../supabaseClient";

/* ===========================
   Helpers
=========================== */
async function getAccessTokenOrThrow() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`No se pudo leer la sesión: ${error.message}`);

  const token = data?.session?.access_token;
  if (!token) throw new Error("Sesión no disponible. Inicia sesión nuevamente.");
  return token;
}

/**
 * Intenta extraer el cuerpo JSON/texto cuando la Edge Function retorna non-2xx.
 * Supabase-js suele adjuntar un Response en error.context.response.
 */
async function extractEdgeErrorPayload(error) {
  try {
    const resp = error?.context?.response;
    if (!resp) return null;

    // Intentar JSON
    try {
      const cloned = resp.clone ? resp.clone() : resp;
      return await cloned.json();
    } catch {
      // Intentar texto
      try {
        const cloned = resp.clone ? resp.clone() : resp;
        const txt = await cloned.text();
        return txt || null;
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
}

function buildReadableErrorMessage(payload) {
  // payload puede ser objeto {ok:false, error, detail, hint, ctx:{stage}}
  if (!payload) return null;

  if (typeof payload === "string") {
    return payload;
  }

  const stage = payload?.ctx?.stage ? `stage=${payload.ctx.stage}` : null;
  const err = payload?.error ? `error=${payload.error}` : null;
  const detail = payload?.detail ? `detail=${payload.detail}` : null;
  const hint = payload?.hint ? `hint=${payload.hint}` : null;

  return [stage, err, detail, hint].filter(Boolean).join(" | ");
}

async function invokeInviteUser(body) {
  const token = await getAccessTokenOrThrow();

  const { data, error } = await supabase.functions.invoke("invite-user", {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!error) return { data, error: null };

  // Extraer JSON/texto del backend
  const payload = await extractEdgeErrorPayload(error);
  const readable = buildReadableErrorMessage(payload);

  const e = new Error(readable || error.message || "invite-user falló (sin detalle)");
  // Adjuntamos para debugging sin romper UI
  e.raw = error;
  e.payload = payload;
  e.status = error?.status;
  return { data: null, error: e };
}

/* ===========================
   Admins (RPCs)
=========================== */

/**
 * Lista administradores/owners de una organización.
 * Root-only se valida en el backend (RPC security definer).
 */
export async function listAdmins(orgId) {
  if (!orgId) return { data: null, error: new Error("orgId requerido") };

  const { data, error } = await supabase.rpc("admins_list", { p_org_id: orgId });
  if (error) return { data: null, error };

  const rows = Array.isArray(data) ? data : [];
  return {
    data: rows.map((r) => ({
      user_id: r.user_id,
      email: r.email,
      role: r.role, // OWNER / ADMIN según tu RPC
    })),
    error: null,
  };
}

/**
 * Elimina un admin de la organización (root-only en backend).
 */
export async function deleteAdmin(orgId, userId) {
  if (!orgId || !userId) return { error: new Error("orgId y userId requeridos") };

  const { data, error } = await supabase.rpc("admins_remove", {
    p_org_id: orgId,
    p_user_id: userId,
  });

  if (error) return { error };

  if (data && typeof data === "object" && data.ok === false) {
    return { error: new Error(data.error || "No se pudo eliminar el admin") };
  }

  return { error: null };
}

/* ===========================
   Invitaciones (Edge Function)
=========================== */

/**
 * Invita un TRACKER a una organización específica.
 */
export async function inviteTracker(orgId, { email, full_name } = {}) {
  if (!orgId) return { data: null, error: new Error("orgId requerido") };
  if (!email) return { data: null, error: new Error("Email requerido") };

  return invokeInviteUser({
    email,
    full_name: full_name ?? null,
    role_name: "TRACKER",
    org_id: orgId,
  });
}

/**
 * Invita un ADMIN a una organización específica.
 */
export async function inviteAdmin(orgId, { email, full_name } = {}) {
  if (!orgId) return { data: null, error: new Error("orgId requerido") };
  if (!email) return { data: null, error: new Error("Email requerido") };

  return invokeInviteUser({
    email,
    full_name: full_name ?? null,
    role_name: "ADMIN",
    org_id: orgId,
  });
}

/**
 * Invita un OWNER independiente (nueva organización).
 */
export async function inviteIndependentOwner({ email, full_name } = {}) {
  if (!email) return { data: null, error: new Error("Email requerido") };

  return invokeInviteUser({
    email,
    full_name: full_name ?? null,
    role_name: "OWNER",
    org_id: null,
  });
}

/**
 * Placeholder para futuro.
 */
export async function updateAdmin() {
  return { data: null, error: new Error("updateAdmin aún no implementado") };
}
