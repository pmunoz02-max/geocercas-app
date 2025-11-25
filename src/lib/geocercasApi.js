// src/lib/geocercasApi.js
// API oficial de geocercas para toda la app (Asignaciones, etc.)

import supabase from '../supabaseClient';

// Pequeño helper común
function normalizeError(ctx, error) {
  console.error(`[geocercasApi] ${ctx}:`, error);
  const msg = error?.message || error?.error_description || String(error);
  return new Error(msg);
}

/**
 * Lista geocercas de la organización actual.
 *
 * Opciones:
 *  - orgId (uuid de la organización) — OBLIGATORIO
 *  - onlyActive (boolean, default: true) → si true, solo activo = true
 *
 * Devuelve array de objetos:
 *  { id, nombre, org_id, activo }
 */
export async function listGeocercas({ orgId, onlyActive = true } = {}) {
  try {
    // Si aún no hay organización seleccionada, devolvemos vacío
    if (!orgId) {
      console.warn('[geocercasApi] listGeocercas llamado sin orgId → []');
      return [];
    }

    let query = supabase
      .from('geocercas')
      .select('id, nombre, org_id, activo')
      .eq('org_id', orgId)
      .order('nombre', { ascending: true });

    if (onlyActive) {
      query = query.eq('activo', true);
    }

    const { data, error } = await query;

    if (error) throw normalizeError('listGeocercas', error);
    return data || [];
  } catch (e) {
    console.error('[geocercasApi] listGeocercas ERROR:', e);
    throw e;
  }
}

/**
 * Obtiene una geocerca por id (dentro de una organización)
 *
 * @param {Object} params
 * @param {string} params.id       - id de la geocerca
 * @param {string} params.orgId    - id de la organización (para validar multi-tenant)
 */
export async function getGeocerca({ id, orgId }) {
  try {
    if (!orgId) {
      console.warn('[geocercasApi] getGeocerca llamado sin orgId → null');
      return null;
    }
    if (!id) {
      console.warn('[geocercasApi] getGeocerca llamado sin id → null');
      return null;
    }

    const { data, error } = await supabase
      .from('geocercas')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (error) throw normalizeError('getGeocerca', error);
    return data;
  } catch (e) {
    console.error('[geocercasApi] getGeocerca ERROR:', e);
    throw e;
  }
}

/**
 * Crea una geocerca nueva.
 *
 * Espera un payload con:
 *  - nombre
 *  - orgId
 *  - geometry / geojson / polygon según tu modelo
 */
export async function createGeocerca(payload) {
  try {
    const { orgId, ...rest } = payload || {};
    if (!orgId) {
      throw new Error('createGeocerca requiere orgId');
    }

    const insert = {
      ...rest,
      org_id: orgId,
    };

    const { data, error } = await supabase
      .from('geocercas')
      .insert(insert)
      .select('*')
      .single();

    if (error) throw normalizeError('createGeocerca', error);
    return data;
  } catch (e) {
    console.error('[geocercasApi] createGeocerca ERROR:', e);
    throw e;
  }
}

/**
 * Actualiza una geocerca existente.
 *
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.orgId
 * @param {Object} params.changes - campos a actualizar
 */
export async function updateGeocerca({ id, orgId, changes }) {
  try {
    if (!orgId) {
      throw new Error('updateGeocerca requiere orgId');
    }
    if (!id) {
      throw new Error('updateGeocerca requiere id');
    }

    const { data, error } = await supabase
      .from('geocercas')
      .update({
        ...changes,
      })
      .eq('id', id)
      .eq('org_id', orgId)
      .select('*')
      .single();

    if (error) throw normalizeError('updateGeocerca', error);
    return data;
  } catch (e) {
    console.error('[geocercasApi] updateGeocerca ERROR:', e);
    throw e;
  }
}

/**
 * Elimina (hard delete) una geocerca por id.
 * En producción probablemente quieras soft delete con "activo = false".
 */
export async function deleteGeocerca({ id, orgId }) {
  try {
    if (!orgId) {
      throw new Error('deleteGeocerca requiere orgId');
    }
    if (!id) {
      throw new Error('deleteGeocerca requiere id');
    }

    const { error } = await supabase
      .from('geocercas')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) throw normalizeError('deleteGeocerca', error);
    return true;
  } catch (e) {
    console.error('[geocercasApi] deleteGeocerca ERROR:', e);
    throw e;
  }
}

/**
 * Marca una geocerca como activa / inactiva (soft delete / restore)
 */
export async function setGeocercaActiva({ id, orgId, activa }) {
  try {
    if (!orgId) {
      throw new Error('setGeocercaActiva requiere orgId');
    }
    if (!id) {
      throw new Error('setGeocercaActiva requiere id');
    }

    const { data, error } = await supabase
      .from('geocercas')
      .update({ activo: !!activa })
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id, activo')
      .single();

    if (error) throw normalizeError('setGeocercaActiva', error);
    return data;
  } catch (e) {
    console.error('[geocercasApi] setGeocercaActiva ERROR:', e);
    throw e;
  }
}
