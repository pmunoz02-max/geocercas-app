// src/lib/adminsApi.js
// =======================================================
// API para módulo Administrador / Invitaciones
// - RPCs: admins_list, admins_remove (root-only por backend)
// - Edge Functions:
//      • invite_admin   (ADMIN / OWNER)
//      • invite_tracker (TRACKER)
// =======================================================

import { supabase } from "../supabaseClient";

/* ===========================
   Helpers
=========================== */
async function getAccessTokenOrThrow() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`No se pudo leer la sesión: ${error.message}`);

  const token = data?.session?.access_token;
  if (!token) throw new Error("Sesión no disponible. Inicia sesión nuevamente.");
  return token;
}

/**
 * Invocador genérico de Edge Functions con manejo de errores
 */
async function invokeEdgeFunction(fnName, body) {
  const token = await getAccessTokenOrThrow();

  const { data, error } = await supabase.functions.invoke(fnName, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!error) return { data, error: null };

  // Intentar leer payload detallado
  let payload = null;
  try {
    const resp = error?.context?.response;
    if (resp) {
      try {
        payload = await resp.clone().json();
      } catch {
        payload = await resp.clone().text();
      }
    }
  } catch {
    payload = null;
  }

  const e = new Error(
    payload?.error ||
      payload?.message ||
      error.message ||
      `${fnName} falló`
  );
  e.payload = payload;
  e.status = error.status;

  return { data: null, error: e };
}

/* ===========================
   Admins (RPCs)
=========================== */

/**
 * Lista administradores/owners de una organización.
 * Root-only se valida en el backend.
 */
export async function listAdmins(orgId) {
  if (!orgId) return { data: null, error: new Error("orgId requerido") };

  const { data, error } = await supabase.rpc("admins_list", { p_org_id: orgId });
  if (error) return { data: null, error };

  const rows = Array.isArray(data) ? data : [];
  return {
    data: rows.map((r) => ({
      user_id: r.user_id,
      email: r.email,
      role: r.role,
    })),
    error: null,
  };
}

/**
 * Elimina un admin de la organización.
 */
export async function deleteAdmin(orgId, userId) {
  if (!orgId || !userId)
    return { error: new Error("orgId y userId requeridos") };

  const { data, error } = await supabase.rpc("admins_remove", {
    p_org_id: orgId,
    p_user_id: userId,
  });

  if (error) return { error };

  if (data && data.ok === false) {
    return { error: new Error(data.error || "No se pudo eliminar el admin") };
  }

  return { error: null };
}

/* ===========================
   Invitaciones
=========================== */

/**
 * Invita un ADMIN a la organización actual.
 */
export async function inviteAdmin(orgId, { email } = {}) {
  if (!orgId) return { data: null, error: new Error("orgId requerido") };
  if (!email) return { data: null, error: new Error("Email requerido") };

  return invokeEdgeFunction("invite_admin", {
    email,
    role: "admin",
    org_id: orgId,
  });
}

/**
 * Invita un OWNER independiente (crea nueva organización).
 */
export async function inviteIndependentOwner({ email } = {}) {
  if (!email) return { data: null, error: new Error("Email requerido") };

  return invokeEdgeFunction("invite_admin", {
    email,
    role: "owner",
    org_id: null,
  });
}

/**
 * Invita un TRACKER (usa Edge Function separada).
 */
export async function inviteTracker(orgId, { email } = {}) {
  if (!orgId) return { data: null, error: new Error("orgId requerido") };
  if (!email) return { data: null, error: new Error("Email requerido") };

  return invokeEdgeFunction("invite_tracker", {
    email,
    org_id: orgId,
  });
}
