// src/lib/adminsApi.js
// API para gestionar administradores de la organización actual
// y para manejar invitaciones de nuevos owners independientes.
//
// Escenarios:
//
// 1) listAdmins(orgId)
//    - Lee la tabla app_user_roles para una org existente.
//    - Roles considerados: OWNER / ADMIN.
//
// 2) inviteAdmin(orgId, payload)
//    - Invita a un ADMIN (o OWNER adicional) a la organización ACTUAL.
//    - Llama a la Edge Function 'invite-user' con org_id != null.
//
// 3) inviteIndependentOwner(payload)
//    - Invita a un NUEVO OWNER independiente, con su propia organización.
//    - Llama a 'invite-user' con role_name = "OWNER" y org_id = null.
//    - En el backend, 'invite-user' debe insertar en app_user_roles
//      un registro con role = 'owner' y org_id = null, para que el
//      trigger SQL `ensure_org_for_owner_role()` cree la organización.
//
// 4) updateAdmin / deleteAdmin
//    - Placeholders por ahora.

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
 * Invita a un administrador (o owner adicional) a la ORGANIZACIÓN ACTUAL.
 *
 * Este flujo es para:
 *  - Agregar admins secundarios a la misma empresa.
 *  - Agregar otro owner a la misma empresa.
 *
 * NO crea organizaciones nuevas; usa el orgId existente.
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
      org_id: orgId, //← aquí SIEMPRE usamos la org actual
    },
  });

  return { data, error };
}

/**
 * Invita a un NUEVO OWNER independiente, con su propia organización.
 *
 * Este flujo es para “nuevo cliente/empresa” que será dueño de su propia org.
 *
 * IMPORTANTE (backend):
 *   - La Edge Function 'invite-user' debe:
 *       1) Aceptar org_id = null y role_name = "OWNER".
 *       2) Insertar en app_user_roles:
 *            { user_id, role: 'owner', org_id: null }
 *       3) El trigger `ensure_org_for_owner_role()` creará la org y
 *          actualizará org_id automáticamente.
 *
 * @param {{ email: string, full_name?: string }} payload
 * @returns {Promise<{data: any | null, error: any}>}
 */
export async function inviteIndependentOwner(payload) {
  const { email, full_name } = payload || {};

  if (!email) {
    return {
      data: null,
      error: new Error("Email requerido para invitar owner independiente"),
    };
  }

  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: {
      email,
      full_name: full_name ?? null,
      role_name: "OWNER",
      org_id: null, // ← clave: dejar NULL para que actúe el trigger
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
