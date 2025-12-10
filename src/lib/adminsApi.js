// src/lib/adminsApi.js
// API corregida para gestionar administrators usando la tabla REAL "memberships"
// y roles del enum role_type: admin / owner / tracker / viewer.

import { supabase } from "../supabaseClient";

/**
 * Lista administradores y propietarios de una organización.
 * - Lee la tabla memberships
 * - Incluye roles: owner, admin
 * - Trae email desde auth.users vía relación "users"
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
    .select(
      `
      user_id,
      org_id,
      role,
      created_at,
      users(email, raw_user_meta_data)
    `
    )
    .eq("org_id", orgId)
    .in("role", ["owner", "admin"]);

  if (error) {
    return { data: null, error };
  }

  // Normalizamos para la UI
  const normalized =
    (data || []).map((row) => ({
      user_id: row.user_id,
      org_id: row.org_id,
      role: row.role?.toUpperCase() ?? "—", // OWNER / ADMIN
      email: row.users?.email ?? null,
      full_name: row.users?.raw_user_meta_data?.full_name ?? null,
      created_at: row.created_at,
    })) || [];

  return { data: normalized, error: null };
}

/**
 * Invita a un nuevo admin dentro de la misma organización
 */
export async function inviteAdmin(orgId, payload) {
  const { email, role, full_name } = payload || {};

  if (!orgId) return { data: null, error: new Error("OrgId requerido") };
  if (!email) return { data: null, error: new Error("Email requerido") };
  if (!role) return { data: null, error: new Error("Rol requerido") };

  const role_name = String(role).toUpperCase(); // ADMIN, OWNER

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

/**
 * Invita a un nuevo owner independiente (crea nueva organización)
 */
export async function inviteIndependentOwner(payload) {
  const { email, full_name } = payload || {};

  if (!email)
    return {
      data: null,
      error: new Error("Email requerido para invitar owner independiente"),
    };

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
 * Eliminar administrador de la organización
 */
export async function deleteAdmin(orgId, userId) {
  if (!orgId || !userId)
    return {
      error: new Error("OrgId y userId requeridos para eliminar admin"),
    };

  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .in("role", ["admin"]); // no borrar owners

  return { error };
}

/**
 * Actualizar rol de admin (por ahora pendiente)
 */
export async function updateAdmin(_orgId, _userId, _fields) {
  return {
    data: null,
    error: new Error("updateAdmin aún en construcción"),
  };
}
