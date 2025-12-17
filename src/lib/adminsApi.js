// src/lib/adminsApi.js
// =======================================================
// API BLINDADA para módulo Administrador
// - ROOT OWNER ONLY (Fenice)
// - Sin acceso directo a tablas
// - Usa RPCs security definer
// =======================================================

import { supabase } from "../supabaseClient";

/**
 * Lista administradores y propietarios de una organización.
 * ROOT OWNER ONLY
 * Backend decide permisos vía is_root_owner()
 */
export async function listAdmins(orgId) {
  if (!orgId) {
    return {
      data: [],
      error: new Error("OrgId requerido para listar administradores"),
    };
  }

  const { data, error } = await supabase.rpc("admins_list", {
    p_org_id: orgId,
  });

  if (error) {
    return { data: null, error };
  }

  const normalized =
    (data || []).map((row) => ({
      user_id: row.user_id,
      email: row.email,
      role: String(row.role || "").toUpperCase(), // OWNER / ADMIN
    })) || [];

  return { data: normalized, error: null };
}

/**
 * Invita a un administrador a la ORGANIZACIÓN ACTUAL.
 * El backend (Edge Function) debe validar is_root_owner().
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

  const role_name = String(role).toUpperCase(); // ADMIN

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
 * Invita a un NUEVO OWNER independiente (nueva organización).
 * ROOT OWNER ONLY (validado en backend).
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
      org_id: null, // backend crea org nueva
    },
  });

  return { data, error };
}

/**
 * Elimina un administrador de la organización.
 * ROOT OWNER ONLY
 * - NO permite eliminar OWNER
 * - NO toca tablas directo
 */
export async function deleteAdmin(orgId, userId) {
  if (!orgId || !userId) {
    return {
      error: new Error("OrgId y userId requeridos para eliminar admin"),
    };
  }

  const { data, error } = await supabase.rpc("admins_remove", {
    p_org_id: orgId,
    p_user_id: userId,
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
 * Actualizar rol de admin (reservado para futuro).
 * Se implementará vía RPC root-only.
 */
export async function updateAdmin() {
  return {
    data: null,
    error: new Error("updateAdmin aún no implementado"),
  };
}
