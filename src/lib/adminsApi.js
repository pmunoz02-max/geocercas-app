// src/lib/adminsApi.js
// API para gestionar administradores usando la tabla "memberships"
// y el enum role_type: owner / admin / tracker / viewer.

import { supabase } from "../supabaseClient";

/**
 * Lista administradores y propietarios de una organización.
 * - Lee la tabla memberships
 * - Incluye roles: owner, admin
 */
export async function listAdmins(orgId) {
  if (!orgId) {
    return {
      data: [],
      error: new Error("OrgId requerido para listar administradores"),
    };
  }

  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, org_id, role, created_at")
    .eq("org_id", orgId)
    .in("role", ["owner", "admin"]);

  if (error) {
    return { data: null, error };
  }

  const normalized =
    (data || []).map((row) => ({
      user_id: row.user_id,
      org_id: row.org_id,
      role: row.role?.toUpperCase() ?? "—", // OWNER / ADMIN
      email: null, // de momento no traemos email
      full_name: null,
      created_at: row.created_at,
    })) || [];

  return { data: normalized, error: null };
}

/**
 * Invita a un administrador (o owner adicional) a la ORGANIZACIÓN ACTUAL.
 *
 * @param {string} orgId
 * @param {{ email: string, role: string, full_name?: string, invitedBy?: string }} payload
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
  const role_name = String(role).toUpperCase(); // ADMIN, OWNER

  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: {
      email,
      full_name: full_name ?? null,
      role_name,
      org_id: orgId, // siempre la org actual
    },
  });

  return { data, error };
}

/**
 * Invita a un NUEVO OWNER independiente, con su propia organización.
 *
 * @param {{ email: string, full_name?: string }} payload
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
      org_id: null, // trigger creará la nueva organización
    },
  });

  return { data, error };
}

/**
 * Elimina un administrador de la organización y delega la lógica
 * de borrado completo a la Edge Function "delete-admin".
 *
 * La Edge Function debe:
 *  - Verificar que el usuario no sea OWNER.
 *  - Borrar memberships / user_organizations de esa org.
 *  - Borrar el usuario en auth.users.
 */
export async function deleteAdmin(orgId, userId) {
  if (!orgId || !userId) {
    return {
      error: new Error("OrgId y userId requeridos para eliminar admin"),
    };
  }

  const { data, error } = await supabase.functions.invoke("delete-admin", {
    body: { org_id: orgId, user_id: userId },
  });

  if (error) {
    return { error };
  }

  if (data && data.ok === false) {
    return {
      error: new Error(data.error || "No se pudo eliminar al administrador."),
    };
  }

  return { error: null };
}

/**
 * Actualizar rol de admin (pendiente de implementar).
 */
export async function updateAdmin(_orgId, _userId, _fields) {
  return {
    data: null,
    error: new Error("updateAdmin aún en construcción"),
  };
}
