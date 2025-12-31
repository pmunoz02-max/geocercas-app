// src/lib/adminsApi.js
// =======================================================
// API para módulo Administrador / Invitaciones (Panel)
// =======================================================

import { supabase } from "./supabaseClient";

/* ===========================
   Helpers
=========================== */

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeRole(role) {
  const r = String(role || "").trim().toLowerCase();
  return r === "admin" ? "admin" : "owner";
}

/**
 * Invocador seguro de Edge Functions
 * - NO lanza excepciones (devuelve { data, error })
 * - Error incluye status + payload si existe
 */
async function invokeEdgeFunction(fnName, body) {
  try {
    const { data, error } = await supabase.functions.invoke(fnName, { body });

    if (!error) return { data, error: null };

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
    return {
      data: null,
      error: new Error(`No se pudo invocar ${fnName}: ${e?.message || String(e)}`),
    };
  }
}

/**
 * RPC universal con fallback de firma:
 * - Primero intenta args "canon" (p_org_id / p_user_id)
 * - Si PostgREST responde 400 por firma/param, reintenta con (org_id / user_id)
 *
 * Devuelve { data, error }
 */
async function invokeRpcWithFallback(rpcName, variants) {
  let lastError = null;

  for (const args of variants) {
    const { data, error } = await supabase.rpc(rpcName, args);

    if (!error) return { data, error: null };

    // Guardamos el error y probamos el siguiente set de args
    lastError = error;

    // Si el error NO es por firma/param, no tiene sentido reintentar
    // PostgREST suele usar 400 para firma; supabase-js lo pone en error.
    const msg = String(error.message || "");
    const looksLikeSignature =
      msg.toLowerCase().includes("could not find the function") ||
      msg.toLowerCase().includes("function") && msg.toLowerCase().includes("does not exist") ||
      msg.toLowerCase().includes("invalid input syntax") ||
      msg.toLowerCase().includes("schema cache") ||
      msg.toLowerCase().includes("pgrst");

    if (!looksLikeSignature) {
      return { data: null, error };
    }
  }

  return { data: null, error: lastError || new Error(`RPC ${rpcName} falló`) };
}

/* ===========================
   Admins (RPCs)
=========================== */

/**
 * Lista administradores/owners de una organización.
 * Soporta firmas típicas:
 *  - admins_list(p_org_id uuid)
 *  - admins_list(org_id uuid)
 */
export async function listAdmins(orgId) {
  if (!orgId) return { data: null, error: new Error("orgId requerido") };

  const { data, error } = await invokeRpcWithFallback("admins_list", [
    { p_org_id: orgId },
    { org_id: orgId },
    { p_org: orgId },
  ]);

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
 * Soporta firmas típicas:
 *  - admins_remove(p_org_id uuid, p_user_id uuid)
 *  - admins_remove(org_id uuid, user_id uuid)
 */
export async function deleteAdmin(orgId, userId) {
  if (!orgId || !userId) {
    return { error: new Error("orgId y userId requeridos") };
  }

  const { data, error } = await invokeRpcWithFallback("admins_remove", [
    { p_org_id: orgId, p_user_id: userId },
    { org_id: orgId, user_id: userId },
    { p_org: orgId, p_user: userId },
  ]);

  if (error) return { error };

  // Si tu RPC devuelve { ok: false, error: "..." }
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
 * Firma usada por AdminsPage.jsx:
 *   inviteAdmin(currentOrg.id, { email, role: "ADMIN" })
 */
export async function inviteAdmin(orgId, { email, role } = {}) {
  if (!orgId) return { data: null, error: new Error("orgId requerido") };

  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return { data: null, error: new Error("Email requerido") };

  // UI puede mandar "ADMIN"; normalizamos
  const normalizedRole = normalizeRole(role || "admin");

  // Esta función es para invitar admin de la org actual
  const finalRole = normalizedRole === "admin" ? "admin" : "admin";

  return invokeEdgeFunction("invite_admin", {
    email: cleanEmail,
    role: finalRole,
    org_id: orgId,
  });
}

/**
 * Invita un OWNER independiente (crea nueva org).
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
