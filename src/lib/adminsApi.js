// src/lib/adminsApi.js
// API para gestionar administradores de la organización actual.
//
// NOTA IMPORTANTE (BD real):
// - La vista user_roles_view SOLO expone: user_id, role_name
// - NO tiene org_id, org_name, email, full_name, created_at
//   (esto está documentado en la Nota Maestra).
//
// Por eso, esta primera versión de listAdmins se centra en:
//   • Leer user_id + role_name
//   • Filtrar por roles owner/admin
//   • Devolver un objeto "normalizado" que la UI pueda mostrar
//
// Más adelante podremos cambiar la fuente de datos a una vista
// más rica (por ejemplo una vista user_organizations con email, nombre, org, etc.)

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
  // Mantenemos la validación por si acaso en el futuro usamos orgId en la query.
  if (!orgId) {
    return {
      data: [],
      error: new Error("OrgId requerido para listar administradores"),
    };
  }

  // Consultamos únicamente columnas que EXISTEN en user_roles_view:
  //   - user_id
  //   - role_name
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

  // Normalizamos la respuesta a un formato que la UI pueda consumir
  // sin romper, aunque falte email, nombre, fechas, etc.
  const normalized =
    (data || []).map((row) => ({
      user_id: row.user_id,
      // org_id lo igualamos al orgId actual para poder usarlo como key o mostrarlo si hace falta
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
