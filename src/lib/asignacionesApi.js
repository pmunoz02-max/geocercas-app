// src/lib/asignacionesApi.js

import { supabase } from '../supabaseClient';

/**
 * Normaliza un string de búsqueda.
 */
function normalizeSearch(q) {
  if (!q) return '';
  return q.trim();
}

/**
 * Lista asignaciones usando la vista v_asignaciones_ui.
 * Soporta filtros por texto, estado, personal, geocerca y rango de fechas.
 *
 * La vista v_asignaciones_ui (versión actual) expone:
 *  - id
 *  - personal_id, personal_nombre, personal_email
 *  - geocerca_id, geocerca_nombre
 *  - activity_id, activity_name
 *  - start_date, end_date
 *  - estado
 *  - frecuencia_envio_sec
 *  - created_at
 *  - is_deleted
 */
export async function listAsignaciones(filters = {}) {
  const {
    q,
    estado,
    geocercaId,
    personalId,
    startDate,
    endDate,
  } = filters;

  let query = supabase
    .from('v_asignaciones_ui')
    .select(
      `
      id,
      personal_id,
      personal_nombre,
      personal_email,
      geocerca_id,
      geocerca_nombre,
      activity_id,
      activity_name,
      start_date,
      end_date,
      estado,
      frecuencia_envio_sec,
      created_at,
      is_deleted
    `
    )
    .eq('is_deleted', false);

  if (estado) {
    query = query.eq('estado', estado);
  }

  if (geocercaId) {
    query = query.eq('geocerca_id', geocercaId);
  }

  if (personalId) {
    query = query.eq('personal_id', personalId);
  }

  if (startDate) {
    query = query.gte('start_date', startDate);
  }

  if (endDate) {
    query = query.lte('end_date', endDate);
  }

  const search = normalizeSearch(q);
  if (search) {
    const like = `%${search}%`;
    query = query.or(
      `personal_nombre.ilike.${like},personal_email.ilike.${like},geocerca_nombre.ilike.${like}`
    );
  }

  const { data, error } = await query.order('start_date', { ascending: true });

  if (error) {
    console.error('[listAsignaciones] error:', error);
    throw error;
  }

  return data || [];
}

/**
 * Crea una nueva asignación en la tabla public.asignaciones.
 *
 * IMPORTANTE:
 *  - Aquí NO va user_id.
 *  - El payload debe incluir los campos reales de la tabla:
 *    personal_id, geocerca_id, activity_id?, start_date, end_date,
 *    estado, frecuencia_envio_sec, org_id/tenant_id si tu tabla lo exige,
 *    etc.
 *
 * Devuelve la fila recién creada.
 */
export async function createAsignacion(payload) {
  // Por seguridad eliminamos cualquier user_id que pudiera venir arrastrado
  // desde código viejo.
  const { user_id, ...cleanPayload } = payload || {};

  const { data, error } = await supabase
    .from('asignaciones')
    .insert(cleanPayload)
    .select(
      `
      id,
      personal_id,
      geocerca_id,
      activity_id,
      start_date,
      end_date,
      estado,
      frecuencia_envio_sec,
      created_at,
      is_deleted
    `
    )
    .single();

  if (error) {
    console.error('[createAsignacion] error:', error);
    throw error;
  }

  return data;
}

/**
 * Actualiza una asignación existente.
 *
 * Tampoco se usa user_id aquí.
 * Se pasa solo el patch (campos a modificar).
 */
export async function updateAsignacion(id, patch) {
  if (!id) {
    throw new Error('[updateAsignacion] id es obligatorio');
  }

  const { user_id, ...cleanPatch } = patch || {};

  const { data, error } = await supabase
    .from('asignaciones')
    .update(cleanPatch)
    .eq('id', id)
    .select(
      `
      id,
      personal_id,
      geocerca_id,
      activity_id,
      start_date,
      end_date,
      estado,
      frecuencia_envio_sec,
      created_at,
      is_deleted
    `
    )
    .single();

  if (error) {
    console.error('[updateAsignacion] error:', error);
    throw error;
  }

  return data;
}

/**
 * Soft delete de una asignación (is_deleted = true).
 */
export async function softDeleteAsignacion(id) {
  if (!id) {
    throw new Error('[softDeleteAsignacion] id es obligatorio');
  }

  const { error } = await supabase
    .from('asignaciones')
    .update({ is_deleted: true })
    .eq('id', id);

  if (error) {
    console.error('[softDeleteAsignacion] error:', error);
    throw error;
  }
}
