// src/lib/adminsApi.js
// API para gestionar administradores de la organización actual.
//
// listAdmins:
//   - Lee la tabla app_user_roles, filtrando por org_id y rol OWNER / ADMIN.
// inviteAdmin:
//   - Llama a la Edge Function 'invite-user'.
// updateAdmin / deleteAdmin:
//   - Placeholders por ahora.

import { supabase } from "../supabaseClient";

/**
 * Lista administradores (owners + admins) para una organización.
 *
 * @param {string} orgId - ID de la organización actual.
 * @returns {Promise<{data: any[] | null, error: any}>}
 */
export async function listAdmins(orgId) {
  if (!orgId) {
    return {
      data: [],
      error: new Error("OrgId requerido para listar administradores"),
    };
  }

  const { data, error } = await supabase
    .from("app_user_roles")
    .select("user_id, org_id, role, created_at")
    .eq("org_id", orgId)
    .in("role", ["OWNER", "ADMIN"]);

  if (error) {
    return { data: null, error };
  }

  // Normalizamos para el frontend
  const normalized =
    (data || []).map((row) => ({
      user_id: row.user_id,
      org_id: row.org_id,
      org_name: null,
      email: null,
      full_name: null,
      role: row.role, // esperado en MAYÚSCULAS: OWNER / ADMIN
      created_at: row.created_at,
    })) || [];

  return { data: normalized, error: null };
}

/**
 * Crea una invitación para un nuevo administrador usando la Edge Function
 * `invite-user`.
 *
 * @param {string} orgId
 * @param {{ email: string, role: string, full_name?: string, invitedBy?: string }} payload
 * @returns {Promise<{data: any | null, error: any}>}
 */
export async function inviteAdmin(orgId, payload) {
  const { email, role, full_name } = payload || {};

  if (!orgId) {
    return { data: null, error: new Error("OrgId requerido") };
  }
  if (!email) {
    return { data: null, error: new Error("Email requerido") };
  }
  if (!role) {
    return { data: null, error: new Error("Rol requerido") };
  }

  // La Edge Function espera role_name en MAYÚSCULAS
  const role_name = String(role).toUpperCase();

  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: {
      email,
      full_name: full_name ?? null,
      role_name,
      org_id: orgId,
    },
  });

  return { data, error };
}

export async function updateAdmin(_orgId, _userId, _fields) {
  return {
    data: null,
    error: new Error(
      "Edición de administradores aún en construcción. (updateAdmin)"
    ),
  };
}

export async function deleteAdmin(_orgId, _userId) {
  return {
    error: new Error(
      "Eliminación de administradores aún en construcción. (deleteAdmin)"
    ),
  };
}
