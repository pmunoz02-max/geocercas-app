// src/lib/actividadesApi.js
// API de Actividades multi-tenant (usa tenant_id = organización actual)

import { supabase } from "../supabaseClient";

// ✅ Todas las funciones requieren tenantId explícito desde AuthContext.
// ✅ NO usamos RPCs antiguas (ensure_default_org_for_current_user).

// ---------------------------------------------------------------------------
// Listar actividades
// ---------------------------------------------------------------------------
export async function listActividades({
  includeInactive = false,
  tenantId = null,
} = {}) {
  if (!tenantId) {
    // Esto solo debería pasar si AuthContext falló antes.
    const error = new Error(
      "Falta tenantId para listar actividades (revisa AuthContext)"
    );
    console.error("[actividadesApi] listActividades sin tenantId:", error);
    return { data: null, error };
  }

  try {
    let query = supabase
      .from("activities")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true });

    if (!includeInactive) {
      query = query.eq("active", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[actividadesApi] listActividades error:", error);
      return { data: null, error };
    }

    return { data: data || [], error: null };
  } catch (err) {
    console.error("[actividadesApi] listActividades exception:", err);
    return { data: null, error: err };
  }
}

// ---------------------------------------------------------------------------
// Crear actividad
// ---------------------------------------------------------------------------
export async function createActividad(payload = {}, opts = {}) {
  const tenantId = opts.tenantId ?? payload.tenant_id ?? null;

  if (!tenantId) {
    const error = new Error(
      "Falta tenantId para crear actividad (revisa AuthContext)"
    );
    console.error("[actividadesApi] createActividad sin tenantId:", error);
    return { data: null, error };
  }

  try {
    const body = {
      tenant_id: tenantId,
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

// ---------------------------------------------------------------------------
// Actualizar actividad
// ---------------------------------------------------------------------------
export async function updateActividad(id, updates = {}) {
  if (!id) {
    const error = new Error("updateActividad requiere id");
    console.error("[actividadesApi] updateActividad sin id:", error);
    return { data: null, error };
  }

  const patch = {
    name: updates.name,
    description: updates.description ?? null,
    currency_code: updates.currency_code,
    hourly_rate: updates.hourly_rate,
  };

  const { data, error } = await supabase
    .from("activities")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[actividadesApi] updateActividad error:", error);
  }

  return { data, error };
}

// ---------------------------------------------------------------------------
// Activar / desactivar
// ---------------------------------------------------------------------------
export async function toggleActividadActiva(id, newActive) {
  if (!id) {
    const error = new Error("toggleActividadActiva requiere id");
    console.error("[actividadesApi] toggleActividadActiva sin id:", error);
    return { data: null, error };
  }

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

// ---------------------------------------------------------------------------
// Eliminar (soft o hard, según tu tabla)
// ---------------------------------------------------------------------------
export async function deleteActividad(id) {
  if (!id) {
    const error = new Error("deleteActividad requiere id");
    console.error("[actividadesApi] deleteActividad sin id:", error);
    return { error };
  }

  const { error } = await supabase.from("activities").delete().eq("id", id);

  if (error) {
    console.error("[actividadesApi] deleteActividad error:", error);
  }

  return { error };
}
