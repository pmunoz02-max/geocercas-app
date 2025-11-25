// src/lib/personalApi.js
// API de Personal para App Geocercas
// Incluye: listPersonal, newPersonal, upsertPersonal, toggleVigente, deletePersonal

import { supabase } from "../supabaseClient";

/** Normaliza teléfono: quita espacios y guiones. */
function normalizePhone(phone) {
  if (!phone) return "";
  return String(phone).replace(/[\s-]/g, "");
}

/**
 * Devuelve solo el usuario autenticado (auth.users).
 */
async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error("No hay usuario autenticado");
  return user;
}

/**
 * Lista personal.
 * - Solo registros is_deleted = false
 * - Si orgId está definido → filtra por org_id = orgId
 * - Si orgId es null → fallback: owner_id = user.id (modo legado)
 * - Búsqueda por nombre, apellido, email, teléfono
 */
export async function listPersonal({
  q = "",
  onlyActive = true,
  orgId = null,
} = {}) {
  const user = await getCurrentUser();

  let query = supabase
    .from("personal")
    .select("*")
    .eq("is_deleted", false)
    .order("nombre", { ascending: true });

  if (orgId) {
    // Modo multi-tenant real: por organización actual
    query = query.eq("org_id", orgId);
  } else {
    // Fallback de compatibilidad: por dueño
    query = query.eq("owner_id", user.id);
  }

  if (onlyActive) {
    query = query.eq("vigente", true);
  }

  const txt = q.trim();
  if (txt) {
    const pattern = `%${txt}%`;
    query = query.or(
      [
        `nombre.ilike.${pattern}`,
        `apellido.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `telefono.ilike.${pattern}`,
      ].join(",")
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error listPersonal:", error);
    throw new Error("No se pudo listar personal");
  }

  return data ?? [];
}

/**
 * Crea un nuevo registro de personal.
 * Alias conveniente sobre upsertPersonal(payload, orgId) sin id.
 */
export async function newPersonal(payload, orgId = null) {
  const clean = { ...payload };
  delete clean.id;
  return upsertPersonal(clean, orgId);
}

/**
 * Crea o actualiza un registro de personal.
 *
 * payload:
 *  - id? (si existe → update, si no → insert)
 *  - nombre (string, requerido)
 *  - apellido? (string)
 *  - email (string, requerido)
 *  - telefono? (string)
 *  - documento? (string)
 *  - fecha_inicio? (YYYY-MM-DD)
 *  - fecha_fin? (YYYY-MM-DD)
 *  - vigente? (bool)
 *  - position_interval_min? (number, minutos, min 5)
 *
 * orgId:
 *  - UUID de la organización actual (currentOrg.id)
 *  - Si es null, se intentará usar payload.org_id (modo legado)
 */
export async function upsertPersonal(payload, orgId = null) {
  const user = await getCurrentUser();
  const nowIso = new Date().toISOString();

  const nombre = (payload.nombre || "").trim();
  const apellido = (payload.apellido || "").trim();
  const email = (payload.email || "").trim().toLowerCase();
  const telefono = (payload.telefono || "").trim();
  const telefonoNorm = normalizePhone(telefono);
  const documento = payload.documento ? String(payload.documento).trim() : null;

  const fecha_inicio = payload.fecha_inicio || null;
  const fecha_fin = payload.fecha_fin || null;

  let intervalMin = Number(payload.position_interval_min ?? 5);
  if (!Number.isFinite(intervalMin) || intervalMin < 5) intervalMin = 5;
  const position_interval_sec = intervalMin * 60;

  if (!nombre) {
    throw new Error("Nombre es obligatorio");
  }
  if (!email) {
    throw new Error("Email es obligatorio");
  }

  // Org efectiva: la que viene del contexto (currentOrg.id) o del payload (modo legado)
  const effectiveOrgId = orgId ?? payload.org_id ?? null;
  if (!effectiveOrgId) {
    throw new Error(
      "No se encontró organización para el registro de personal. Vuelve a entrar a la app o selecciona una organización."
    );
  }

  // 1) Verificación de duplicados: misma combinación (org_id, email, telefono_norm)
  //    Respetando el índice: personal_unique_active_per_org
  let dupQuery = supabase
    .from("personal")
    .select("id")
    .eq("is_deleted", false)
    .eq("org_id", effectiveOrgId)
    .eq("email", email);

  if (telefonoNorm) {
    dupQuery = dupQuery.eq("telefono_norm", telefonoNorm);
  } else {
    dupQuery = dupQuery.is("telefono_norm", null);
  }

  if (payload.id) {
    dupQuery = dupQuery.neq("id", payload.id);
  }

  const { data: dupRows, error: dupError } = await dupQuery;

  if (dupError) {
    console.error("Error comprobando duplicados en personal:", dupError);
    throw new Error("No se pudo validar duplicados de personal");
  }

  if (dupRows && dupRows.length > 0) {
    throw new Error(
      "Ya existe una persona con este email y número telefónico en esta organización. Usa editar en lugar de crear."
    );
  }

  const baseRow = {
    nombre,
    apellido: apellido || null,
    email,
    telefono: telefono || null,
    telefono_norm: telefonoNorm || null,
    documento,
    fecha_inicio,
    fecha_fin,
    vigente: payload.vigente ?? true,
    position_interval_sec,
    updated_at: nowIso,
  };

  // Nunca tocamos columnas generadas: activo, activo_bool, fingerprint, etc.
  // Nunca escribimos is_deleted aquí: deletePersonal se encarga.

  if (!payload.id) {
    // INSERT
    const insertRow = {
      ...baseRow,
      owner_id: user.id,
      org_id: effectiveOrgId,
      created_at: nowIso,
    };

    const { data, error } = await supabase
      .from("personal")
      .insert(insertRow)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Error newPersonal:", error);
      if (
        error.code === "23505" ||
        (typeof error.message === "string" &&
          error.message.toLowerCase().includes("duplicate key value"))
      ) {
        throw new Error(
          "Ya existe una persona con este email y número telefónico en esta organización."
        );
      }
      throw new Error("No se pudo crear el registro de personal");
    }

    return data;
  }

  // UPDATE
  const { data, error } = await supabase
    .from("personal")
    .update(baseRow)
    .eq("id", payload.id)
    .eq("is_deleted", false)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Error upsertPersonal (update):", error);
    if (
      error.code === "23505" ||
      (typeof error.message === "string" &&
        error.message.toLowerCase().includes("duplicate key value"))
    ) {
      throw new Error(
        "Ya existe una persona con este email y número telefónico en esta organización. Ajusta los datos o utiliza otra combinación."
      );
    }
    throw new Error("No se pudo actualizar el registro de personal");
  }

  return data;
}

/**
 * Cambia el estado `vigente` de una persona (toggle) respetando soft delete.
 */
export async function toggleVigente(id) {
  const nowIso = new Date().toISOString();

  const { data: row, error: fetchError } = await supabase
    .from("personal")
    .select("vigente")
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle();

  if (fetchError) {
    console.error("Error leyendo vigente en toggleVigente:", fetchError);
    throw new Error("No se pudo leer el estado vigente/activo");
  }
  if (!row) {
    throw new Error("Registro de personal no encontrado");
  }

  const { data, error } = await supabase
    .from("personal")
    .update({
      vigente: !row.vigente,
      updated_at: nowIso,
    })
    .eq("id", id)
    .eq("is_deleted", false)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Error toggleVigente:", error);
    throw new Error("No se pudo actualizar el estado vigente/activo");
  }

  return data;
}

/**
 * Soft delete de personal.
 * Marca is_deleted=true, vigente=false, deleted_at=now.
 */
export async function deletePersonal(id) {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("personal")
    .update({
      is_deleted: true,
      vigente: false,
      deleted_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", id)
    .eq("is_deleted", false)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Error deletePersonal:", error);
    throw new Error("No se pudo eliminar el registro de personal");
  }

  return data;
}
