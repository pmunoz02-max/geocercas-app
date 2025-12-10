// src/lib/actividadesApi.js
import { supabase } from "../supabaseClient";

// Obtiene un tenantId válido.
// Si no se pasa, llama a la función de Postgres que devuelve
// la organización "por defecto" del usuario actual.
async function ensureTenant(tenantId) {
  if (tenantId) return tenantId;

  const { data, error } = await supabase.rpc(
    "ensure_default_org_for_current_user"
  );

  if (error) {
    console.error(
      "[actividadesApi] ensure_default_org_for_current_user error:",
      error
    );
    throw error;
  }

  // data viene como array de filas [{ org_id, org_name, role, is_owner }]
  const org = Array.isArray(data) ? data[0] : null;

  if (!org || !org.org_id) {
    console.warn(
      "[actividadesApi] ensureTenant: RPC no devolvió organización válida",
      data
    );
    throw new Error("No hay organización asignada para el usuario actual");
  }

  return org.org_id; // 👈 devolvemos el UUID de la org
}

// 🔹 Listar actividades
export async function listActividades({
  includeInactive = false,
  tenantId = null,
} = {}) {
  try {
    const effectiveTenantId = await ensureTenant(tenantId);

    let query = supabase
      .from("activities")
      .select("*")
      .eq("tenant_id", effectiveTenantId)
      .order("name", { ascending: true });

    if (!includeInactive) {
      query = query.eq("active", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[actividadesApi] listActividades error:", error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    console.error("[actividadesApi] listActividades exception:", err);
    return { data: null, error: err };
  }
}

// 🔹 Crear actividad
export async function createActividad(payload = {}, opts = {}) {
  try {
    const effectiveTenantId = await ensureTenant(
      opts.tenantId ?? payload.tenant_id ?? null
    );

    const body = {
      tenant_id: effectiveTenantId,
      name: payload.name,
      description: payload.description ?? null,
      active: payload.active ?? true,
      currency_code: payload.currency_code,
      hourly_rate: payload.hourly_rate,
    };

    const { data, error } = await supabase
      .from("activities")
      .insert(body)
      .select("*")
      .single();

    if (error) {
      console.error("[actividadesApi] createActividad error:", error);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    console.error("[actividadesApi] createActividad exception:", err);
    return { data: null, error: err };
  }
}

// 🔹 Actualizar actividad
export async function updateActividad(id, updates = {}) {
  const { data, error } = await supabase
    .from("activities")
    .update({
      name: updates.name,
      description: updates.description ?? null,
      currency_code: updates.currency_code,
      hourly_rate: updates.hourly_rate,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[actividadesApi] updateActividad error:", error);
  }

  return { data, error };
}

// 🔹 Activar / desactivar
export async function toggleActividadActiva(id, newActive) {
  const { data, error } = await supabase
    .from("activities")
    .update({ active: newActive })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[actividadesApi] toggleActividadActiva error:", error);
  }

  return { data, error };
}

// 🔹 Eliminar (soft o hard, según tu tabla)
export async function deleteActividad(id) {
  const { error } = await supabase.from("activities").delete().eq("id", id);

  if (error) {
    console.error("[actividadesApi] deleteActividad error:", error);
  }

  return { error };
}
