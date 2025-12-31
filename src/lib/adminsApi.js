// src/lib/adminsApi.js
// =======================================================
// API para módulo Administrador / Invitaciones
// =======================================================

import { supabase } from "./supabaseClient";

/* ===========================
   Helpers
=========================== */

/**
 * Normaliza rol (UI puede mandar "ADMIN", "admin", etc.)
 * Edge function espera: "admin" | "owner"
 */
function normalizeRole(role) {
  const r = String(role || "").trim().toLowerCase();
  return r === "admin" ? "admin" : "owner";
}

/**
 * Normaliza email
 */
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/**
 * Invocador seguro de Edge Functions
 * - NO lanza excepciones (devuelve { data, error })
 * - Error incluye status + payload si existe
 */
async function invokeEdgeFunction(fnName, body) {
  try {
    const { data, error } = await supabase.functions.invoke(fnName, { body });

    // OK
    if (!error) {
      return { data, error: null };
    }

    // Intentar extraer respuesta detallada del backend
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

    const msg =
      (payload && typeof payload === "object" && (payload.message || payload.error)) ||
      (typeof payload === "string" ? payload : null) ||
      error.message ||
      `${fnName} falló`;

    const e = new Error(String(msg));
    e.status = error.status || 500;
    e.payload = payload;

    return { data: null, error: e };
  } catch (e) {
    // Errores JS puros (network/runtime)
    return {
      data: null,
      error: new Error(`No se pudo invocar ${fnName}: ${e?.message || String(e)}`),
    };
  }
}

/* ===========================
   Admins (RPCs)
=========================== */

/**
 * Lista administradores/owners de una organización.
 * Depende de tu RPC: public.admins_list(p_org_id uuid)
 */
export async function listAdmins(orgId) {
  if (!orgId) {
    return { data: null, error: new Error("orgId requerido") };
  }

  const { data, error } = await supabase.rpc("admins_list", {
    p_org_id: orgId,
  });

  if (error) return { data: null, error };

  // Asegura forma estable
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
 * Depende de tu RPC: public.admins_remove(p_org_id uuid, p_user_id uuid)
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

  // Si tu RPC devuelve { ok: false, error: "..."}
  if (data?.ok === false) {
    return { error: new Error(data.error || "No se pudo eliminar el admin") };
  }

  return { error: null };
}

/* ===========================
   Invitaciones (Edge Functions)
=========================== */

/**
 * Invita un ADMIN a la organización actual.
 * Firma usada por AdminsPage.jsx: inviteAdmin(currentOrg.id, { email, role: "ADMIN" })
 *
 * Nota: aunque mandes org_id, tu Edge Function puede ignorarlo si tu regla es:
 * "cada admin/owner tiene su propia org". Igual lo mandamos por compatibilidad.
 */
export async function inviteAdmin(orgId, { email, role } = {}) {
  if (!orgId) return { data: null, error: new Error("orgId requerido") };

  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return { data: null, error: new Error("Email requerido") };

  // Si UI manda "ADMIN", normalizamos
  const normalizedRole = normalizeRole(role || "admin");
  // Pero esta función es para admins de la org actual:
  const finalRole = normalizedRole === "admin" ? "admin" : "admin";

  return invokeEdgeFunction("invite_admin", {
    email: cleanEmail,
    role: finalRole,
    org_id: orgId,
  });
}

/**
 * Invita un OWNER independiente (crea nueva organización).
 * Firma usada por AdminsPage.jsx: inviteIndependentOwner({ email, full_name: null })
 */
export async function inviteIndependentOwner({ email } = {}) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return { data: null, error: new Error("Email requerido") };

  return invokeEdgeFunction("invite_admin", {
    email: cleanEmail,
    role: "owner",
    org_id: null,
  });
}

/**
 * Invita un TRACKER (Edge Function separada).
 */
export async function inviteTracker(orgId, { email } = {}) {
  if (!orgId) return { data: null, error: new Error("orgId requerido") };

  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return { data: null, error: new Error("Email requerido") };

  return invokeEdgeFunction("invite_tracker", {
    email: cleanEmail,
    org_id: orgId,
  });
}
