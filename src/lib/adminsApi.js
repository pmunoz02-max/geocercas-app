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

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session?.access_token || null;
}

/**
 * Invocador seguro de Edge Functions
 * - Inyecta Authorization explícitamente
 * - NO lanza excepciones (devuelve { data, error })
 */
async function invokeEdgeFunction(fnName, body) {
  try {
    const token = await getAccessToken();

    if (!token) {
      return {
        data: null,
        error: new Error(
          "No hay sesión activa (access_token vacío). Recarga la página o vuelve a iniciar sesión."
        ),
      };
    }

    const { data, error } = await supabase.functions.invoke(fnName, {
      body,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

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

/* ===========================
   Admins (RPCs)
=========================== */

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
   Invitaciones (Edge Functions)
=========================== */

export async function inviteAdmin(orgId, { email, role } = {}) {
  if (!orgId) return { data: null, error: new Error("orgId requerido") };

  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return { data: null, error: new Error("Email requerido") };

  // Acción: invitar admin a la org actual
  const normalizedRole = normalizeRole(role || "admin");
  const finalRole = normalizedRole === "admin" ? "admin" : "admin";

  return invokeEdgeFunction("invite_admin", {
    email: cleanEmail,
    role: finalRole,
    org_id: orgId,
  });
}

export async function inviteIndependentOwner({ email } = {}) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return { data: null, error: new Error("Email requerido") };

  return invokeEdgeFunction("invite_admin", {
    email: cleanEmail,
    role: "owner",
    org_id: null,
  });
}

export async function inviteTracker(orgId, { email } = {}) {
  if (!orgId) return { data: null, error: new Error("orgId requerido") };

  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return { data: null, error: new Error("Email requerido") };

  return invokeEdgeFunction("invite_tracker", {
    email: cleanEmail,
    org_id: orgId,
  });
}
