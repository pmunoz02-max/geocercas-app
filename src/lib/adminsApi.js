// src/lib/adminsApi.js
// API para gestionar administradores de la organización actual.
//
// Estado actual del backend:
// - user_roles_view SOLO expone: user_id, role_name
// - org_invites almacena invitaciones por organización
//
// En esta fase:
//   • listAdmins: lee desde user_roles_view (owner/admin globales)
//   • inviteAdmin: inserta invitación en org_invites
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
 * Crea una invitación para un nuevo administrador.
 *
 * Inserta en public.org_invites.
 * La lógica de envío del Magic Link se hace en el frontend
 * (AdminsPage.jsx) usando supabase.auth.signInWithOtp.
 *
 * @param {string} orgId
 * @param {{ email: string, role: string, invitedBy: string }} payload
 * @returns {Promise<{data: any[] | null, error: any}>}
 */
export async function inviteAdmin(orgId, payload) {
  const { email, role, invitedBy } = payload || {};

  if (!orgId) {
    return { data: null, error: new Error("OrgId requerido") };
  }
  if (!email) {
    return { data: null, error: new Error("Email requerido") };
  }
  if (!role) {
    return { data: null, error: new Error("Rol requerido") };
  }

  const { data, error } = await supabase
    .from("org_invites")
    .insert({
      org_id: orgId,
      email,
      role,
      invited_by: invitedBy,
    })
    .select();

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
