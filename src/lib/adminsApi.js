// src/lib/adminsApi.js
// API para gestionar administradores de la organización actual.
//
// Estado actual del backend:
// - user_roles_view expone roles (owner/admin) por usuario.
// - Edge Function invite-user se encarga de:
//     • Validar email, rol y org_id
//     • Registrar en org_invites / pending_invites
//     • Enviar el correo de invitación (Magic Link / inviteUserByEmail)
//     • Crear / asegurar la membresía en app_user_roles vía ensure_tracker_membership
//
// En esta fase:
//   • listAdmins: lee desde user_roles_view (owner/admin globales)
//   • inviteAdmin: llama a la Edge Function invite-user
//   • updateAdmin/deleteAdmin: placeholders (en construcción)

import { supabase } from "../supabaseClient";

/**
 * Lista administradores (owners + admins).
 *
 * Por limitaciones de la vista actual user_roles_view, SOLO podemos
 * saber user_id y role_name. El orgId se pasa para futuro uso y para
 * mantener firma consistente, pero NO se utiliza directamente aquí.
 *
 * @param {string} orgId - ID de la organización actual (no se usa todavía).
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
    .from("user_roles_view")
    .select(
      `
      user_id,
      role_name
    `
    )
    .in("role_name", ["owner", "admin"]);

  if (error) {
    return { data: null, error };
  }

  const normalized =
    (data || []).map((row) => ({
      user_id: row.user_id,
      org_id: orgId,
      org_name: null,
      email: null,
      full_name: null,
      role: row.role_name || null,
      created_at: null,
    })) || [];

  return { data: normalized, error: null };
}

/**
 * Crea una invitación para un nuevo administrador usando la Edge Function
 * `invite-user`.
 *
 * IMPORTANTE:
 *   - La Edge Function es la que envía el correo (Magic Link / invitación).
 *   - También registra la invitación en org_invites y pending_invites.
 *   - Además se apoya en la RPC ensure_tracker_membership para crear
 *     la membresía en app_user_roles.
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

  // La Edge Function espera role_name en MAYÚSCULAS: ADMIN / TRACKER / OWNER
  const role_name = String(role).toUpperCase();

  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: {
      email,
      full_name: full_name ?? null,
      role_name,
      org_id: orgId,
    },
  });

  // OJO:
  //  - error ≠ null  → error técnico (red, permisos, etc.)
  //  - data.ok === false → error de negocio que viene desde la función
  return { data, error };
}

/**
 * PLACEHOLDER: Actualizar administrador (cambiar nombre/estado/rol).
 */
export async function updateAdmin(_orgId, _userId, _fields) {
  return {
    data: null,
    error: new Error(
      "Edición de administradores aún en construcción. (updateAdmin)"
    ),
  };
}

/**
 * PLACEHOLDER: Eliminar administrador de la organización.
 */
export async function deleteAdmin(_orgId, _userId) {
  return {
    error: new Error(
      "Eliminación de administradores aún en construcción. (deleteAdmin)"
    ),
  };
}
