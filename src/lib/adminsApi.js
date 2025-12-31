// src/lib/adminsApi.js
// =======================================================
// API para módulo Administrador / Invitaciones
// =======================================================

import { supabase } from "../supabaseClient";

/* ===========================
   Helpers
=========================== */

/**
 * Invocador seguro de Edge Functions
 * - NO lanza excepciones
 * - Devuelve { data, error }
 * - Error incluye status + payload si existe
 */
async function invokeEdgeFunction(fnName, body) {
  try {
    const { data, error } = await supabase.functions.invoke(fnName, {
      body,
    });

    if (!error) {
      return { data, error: null };
    }

    // Intentar leer respuesta detallada del backend
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

    e.status = error.status || 500;
    e.payload = payload;

    return { data: null, error: e };
  } catch (e) {
    // Errores JS puros (network, runtime, etc.)
    return {
      data: null,
      error: new Error(`No se pudo invocar ${fnName}: ${e.message}`),
    };
  }
}

/* ===========================
   Admins (RPCs)
=========================== */

/**
 * Lista administradores/owners de una organización.
 */
export async function listAdmins(orgId) {
  if (!orgId) {
    return { data: null, error: new Error("orgId requerido") };
  }

  const { data, error } = await supabase.rpc("admins_list", {
    p_org_id: orgId,
  });

  if (error) return { data: null, error };

  return {
    data: (Array.isArray(data) ? data : []).map((r) => ({
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
  if (!orgId || !userId) {
    return { error: new Error("orgId y userId requeridos") };
  }

  const { data, error } = await supabase.rpc("admins_remove", {
    p_org_id: orgId,
    p_user_id: userId,
  });

  if (error) return { error };

  if (data?.ok === false) {
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
 * Invita un TRACKER (Edge Function separada).
 */
export async function inviteTracker(orgId, { email } = {}) {
  if (!orgId) return { data: null, error: new Error("orgId requerido") };
  if (!email) return { data: null, error: new Error("Email requerido") };

  return invokeEdgeFunction("invite_tracker", {
    email,
    org_id: orgId,
  });
}
