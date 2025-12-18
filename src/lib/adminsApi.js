// src/lib/adminsApi.js
// =======================================================
// API para módulo Administrador / Invitaciones
// - RPCs: admins_list, admins_remove (root-only por backend)
// - Edge Function: invite-user (requiere Authorization: Bearer <JWT>)
// =======================================================

import { supabase } from "../supabaseClient";

/* ===========================
   Helpers
=========================== */
async function getAccessTokenOrThrow() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(`No se pudo leer la sesión: ${error.message}`);
  }
  const token = data?.session?.access_token;
  if (!token) {
    throw new Error("Sesión no disponible. Inicia sesión nuevamente.");
  }
  return token;
}

function normalizeEdgeInvokeError(error, fallbackMessage = "Error al invocar Edge Function") {
  if (!error) return null;

  // Supabase FunctionsHttpError suele traer solo message; a veces trae context/details.
  const msg = error?.message ? String(error.message) : fallbackMessage;

  const e = new Error(msg);
  // Adjuntamos metadata sin romper nada (propiedades opcionales)
  if (error?.name) e.name = String(error.name);
  if (typeof error?.status !== "undefined") e.status = error.status;
  if (typeof error?.context !== "undefined") e.context = error.context;
  if (typeof error?.details !== "undefined") e.details = error.details;

  return e;
}

async function invokeInviteUser(body) {
  const token = await getAccessTokenOrThrow();

  const { data, error } = await supabase.functions.invoke("invite-user", {
    body,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  // Devuelve error normalizado para UI
  return { data, error: normalizeEdgeInvokeError(error, "invite-user falló") };
}

/* ===========================
   Admins (RPCs)
=========================== */

/**
 * Lista administradores/owners de una organización.
 * Root-only se valida en el backend (RPC security definer).
 */
export async function listAdmins(orgId) {
  if (!orgId) {
    return { data: null, error: new Error("orgId requerido") };
  }

  const { data, error } = await supabase.rpc("admins_list", { p_org_id: orgId });
  if (error) return { data: null, error };

  // Normaliza salida (sin asumir columnas extras)
  const rows = Array.isArray(data) ? data : [];
  return {
    data: rows.map((r) => ({
      user_id: r.user_id,
      email: r.email,
      role: r.role, // OWNER / ADMIN (según tu RPC)
    })),
    error: null,
  };
}

/**
 * Elimina un admin de la organización (root-only en backend).
 */
export async function deleteAdmin(orgId, userId) {
  if (!orgId || !userId) {
    return { error: new Error("orgId y userId requeridos") };
  }

  const { data, error } = await supabase.rpc("admins_remove", {
    p_org_id: orgId,
    p_user_id: userId,
  });

  if (error) return { error };

  // Si tu RPC devuelve { ok: false, error: '...' }
  if (data && typeof data === "object" && data.ok === false) {
    return { error: new Error(data.error || "No se pudo eliminar el admin") };
  }

  return { error: null };
}

/* ===========================
   Invitaciones (Edge Function)
=========================== */

/**
 * Invita un TRACKER a una organización específica.
 * Requiere orgId.
 */
export async function inviteTracker(orgId, { email, full_name } = {}) {
  if (!orgId) return { data: null, error: new Error("orgId requerido") };
  if (!email) return { data: null, error: new Error("Email requerido") };

  return invokeInviteUser({
    email,
    full_name: full_name ?? null,
    role_name: "TRACKER",
    org_id: orgId,
  });
}

/**
 * Invita un ADMIN a una organización específica.
 * Requiere orgId.
 */
export async function inviteAdmin(orgId, { email, full_name } = {}) {
  if (!orgId) return { data: null, error: new Error("orgId requerido") };
  if (!email) return { data: null, error: new Error("Email requerido") };

  return invokeInviteUser({
    email,
    full_name: full_name ?? null,
    role_name: "ADMIN",
    org_id: orgId,
  });
}

/**
 * Invita un OWNER independiente (nueva organización).
 * org_id = null (tu backend/edge define el comportamiento).
 */
export async function inviteIndependentOwner({ email, full_name } = {}) {
  if (!email) return { data: null, error: new Error("Email requerido") };

  return invokeInviteUser({
    email,
    full_name: full_name ?? null,
    role_name: "OWNER",
    org_id: null,
  });
}

/**
 * Placeholder para futuro.
 */
export async function updateAdmin() {
  return {
    data: null,
    error: new Error("updateAdmin aún no implementado"),
  };
}
