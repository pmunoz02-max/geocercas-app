// src/lib/adminsApi.js
// =======================================================
// API BLINDADA para módulo Administrador
// - ROOT OWNER ONLY (Fenice)
// - Sin acceso directo a tablas
// - Usa RPCs security definer
// - Edge Functions SIEMPRE con Authorization: Bearer <JWT>
// =======================================================

import { supabase } from "../supabaseClient";

/**
 * Helper: obtiene el JWT actual para invocar Edge Functions.
 * Si no hay sesión, devuelve null.
 */
async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session?.access_token ?? null;
}

/**
 * Helper: normaliza errores de Edge Functions (para mostrar detail/hint si existen)
 */
if (error) {
  console.error("INVITE-USER RAW ERROR:", error);
  throw error; // <- esto fuerza a ver el error real
}
return { data, error: null };

  // Supabase FunctionsHttpError suele venir con "context" / "details" dependiendo del entorno.
  // Lo mantenemos genérico y seguro.
  const message =
    error?.message ||
    error?.name ||
    "Error al invocar Edge Function (sin mensaje)";

  const e = new Error(message);

  // Adjuntar información útil si existe (sin romper compatibilidad)
  if (error?.context) e.context = error.context;
  if (error?.details) e.details = error.details;
  if (error?.status) e.status = error.status;

  return e;
}

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
 * El backend (Edge Function) valida permisos:
 * - OWNER/ADMIN => ROOT ONLY
 */
export async function inviteAdmin(orgId, payload) {
  const { email, role, full_name } = payload || {};

  if (!orgId) return { data: null, error: new Error("OrgId requerido") };
  if (!email) return { data: null, error: new Error("Email requerido") };
  if (!role) return { data: null, error: new Error("Rol requerido") };

  const role_name = String(role).toUpperCase(); // ADMIN (o OWNER si lo usas aquí)

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return {
      data: null,
      error: new Error("Sesión no disponible. Vuelve a iniciar sesión."),
    };
  }

  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: {
      email,
      full_name: full_name ?? null,
      role_name,
      org_id: orgId,
    },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return { data, error: normalizeInvokeError(error) };
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

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return {
      data: null,
      error: new Error("Sesión no disponible. Vuelve a iniciar sesión."),
    };
  }

  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: {
      email,
      full_name: full_name ?? null,
      role_name: "OWNER",
      org_id: null, // backend crea org nueva
    },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return { data, error: normalizeInvokeError(error) };
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

  if (error) return { error };

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
