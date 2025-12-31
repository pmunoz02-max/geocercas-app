// src/lib/adminsApi.js
// =======================================================
// API para módulo Administrador / Invitaciones
// - Un solo Supabase (panel) -> ../supabaseClient
// - Invoca Edge Functions con Authorization explícito (evita 401 por token vacío)
// - NO lanza excepciones: devuelve { data, error }
// =======================================================

import { supabase } from "../supabaseClient";

/* ===========================
   Helpers
=========================== */

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeRole(role) {
  const r = String(role || "").trim().toLowerCase();
  return r === "owner" ? "owner" : "admin";
}

/**
 * Espera corto por una sesión (evita “access_token vacío” cuando la app aún está cargando sesión).
 * - Intenta getSession inmediato.
 * - Se suscribe 1 vez a onAuthStateChange.
 * - Timeout corto (700ms) para no colgar UI.
 */
async function waitForAccessToken() {
  try {
    const first = await supabase.auth.getSession();
    const token1 = first?.data?.session?.access_token || null;
    if (token1) return token1;

    return await new Promise((resolve) => {
      let done = false;

      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (done) return;
        const tok = session?.access_token || null;
        if (tok) {
          done = true;
          sub?.subscription?.unsubscribe?.();
          resolve(tok);
        }
      });

      // timeout corto
      setTimeout(async () => {
        if (done) return;
        done = true;
        sub?.subscription?.unsubscribe?.();

        const again = await supabase.auth.getSession();
        const tok2 = again?.data?.session?.access_token || null;
        resolve(tok2 || null);
      }, 700);
    });
  } catch {
    return null;
  }
}

/**
 * Invocador seguro de Edge Functions
 * - Inyecta Authorization explícitamente (FIX 401)
 * - NO lanza excepciones
 * - Devuelve { data, error }
 * - Error incluye status + payload si existe
 */
async function invokeEdgeFunction(fnName, body) {
  try {
    const token = await waitForAccessToken();
    if (!token) {
      const e = new Error(
        "No hay sesión activa (access_token vacío). Recarga la página o vuelve a iniciar sesión."
      );
      e.status = 401;
      e.payload = null;
      return { data: null, error: e };
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

    const e = new Error(
      payload?.message ||
        payload?.error ||
        error.message ||
        `${fnName} falló`
    );
    e.status = error.status || payload?.status || 500;
    e.payload = payload;

    return { data: null, error: e };
  } catch (err) {
    const e = new Error(`No se pudo invocar ${fnName}: ${err?.message || String(err)}`);
    e.status = 0;
    e.payload = null;
    return { data: null, error: e };
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

  if (error) {
    const e = new Error(error.message || "admins_list falló");
    e.status = error.code ? 400 : 500;
    e.payload = error;
    return { data: null, error: e };
  }

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

  if (error) {
    const e = new Error(error.message || "admins_remove falló");
    e.payload = error;
    return { error: e };
  }

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
 * IMPORTANTE: envía org_id (org existente) -> Edge Function ahora lo usa (ya NO crea org para admin).
 */
export async function inviteAdmin(orgId, { email, role = "admin" } = {}) {
  if (!orgId) return { data: null, error: new Error("orgId requerido") };

  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return { data: null, error: new Error("Email requerido") };

  const finalRole = normalizeRole(role) === "owner" ? "admin" : "admin";

  return invokeEdgeFunction("invite_admin", {
    email: cleanEmail,
    role: finalRole,
    org_id: orgId,
  });
}

/**
 * Invita un OWNER independiente (crea nueva organización).
 */
export async function inviteIndependentOwner({ email, org_name } = {}) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return { data: null, error: new Error("Email requerido") };

  return invokeEdgeFunction("invite_admin", {
    email: cleanEmail,
    role: "owner",
    org_id: null,
    org_name: org_name ? String(org_name).trim() : undefined,
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
