// src/lib/adminsApi.js
// API para gestionar administradores de la organización actual.
//
// Primera versión centrada en LECTURA usando la vista user_roles_view.
// Más adelante podemos añadir RPCs / mutaciones sobre org_members / memberships
// para crear/editar/eliminar admins de forma robusta.

import { supabase } from "../supabaseClient";

/**
 * Lista administradores (owners + admins) de una organización.
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
    .from("user_roles_view")
    .select(
      `
      user_id,
      org_id,
      org_name,
      email,
      full_name,
      role,
      created_at
    `
    )
    .eq("org_id", orgId)
    .in("role", ["owner", "admin"])
    .order("role", { ascending: true })
    .order("email", { ascending: true });

  return { data, error };
}

/**
 * PLACEHOLDER: Invitar administrador.
 *
 * Diseño futuro:
 *  - Crear membership en org_members con role = 'admin'
 *  - Enviar magic link al email
 */
export async function inviteAdmin(_orgId, _payload) {
  return {
    data: null,
    error: new Error(
      "Invitación de administradores aún en construcción. (inviteAdmin)"
    ),
  };
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
