// src/lib/trackerApi.js
// API unificada para tracking:
// - listTrackers: lista usuarios trackers del tenant
// - getSessionUser: obtiene usuario actual
// - upsertPositionCompat: envía posición al Edge Function send_position
// - suscribirsePosiciones: snapshot + realtime + polling sobre la tabla positions

import { supabase } from '../supabaseClient';

const EDGE_URL = import.meta.env.VITE_EDGE_SEND_POSITION;

// ===================== Helpers de Auth =====================

export async function getSessionUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error('[trackerApi] getSessionUser error:', error);
    throw error;
  }
  return data?.user || null;
}

async function getSessionAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[trackerApi] getSessionAccessToken error:', error);
    throw error;
  }
  return data?.session?.access_token || '';
}

// ===================== Envío de posiciones =====================

/**
 * upsertPositionCompat
 * Enviar posición al Edge Function send_position.
 * payload:
 *  - orgId
 *  - userId
 *  - personalId (opcional)
 *  - lat, lng
 *  - accuracy, speed, heading, battery (opcionales)
 *  - at (Date | string | null) – timestamp de la posición
 */
export async function upsertPositionCompat(payload) {
  if (!EDGE_URL) {
    throw new Error(
      'EDGE_URL no configurado (VITE_EDGE_SEND_POSITION). Revisa tu .env.local'
    );
  }

  const {
    orgId,
    userId,
    personalId = null,
    lat,
    lng,
    accuracy = null,
    speed = null,
    heading = null,
    battery = null,
    at = new Date(),
  } = payload || {};

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new Error('Lat/Lng inválidos en upsertPositionCompat');
  }
  if (!orgId) {
    console.warn('[trackerApi] upsertPositionCompat sin orgId');
  }

  const token = await getSessionAccessToken();

  const body = {
    org_id: orgId || null,
    user_id: userId || null,
    personal_id: personalId || null,
    lat,
    lng,
    accuracy,
    speed,
    heading,
    battery,
    at: at instanceof Date ? at.toISOString() : at || new Date().toISOString(),
  };

  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(
      `send_position failed: ${res.status} ${text || res.statusText}`
    );
    // @ts-ignore
    err.status = res.status;
    try {
      // @ts-ignore
      err.details = JSON.parse(text);
    } catch {
      // ignore
    }
    console.error('[trackerApi] upsertPositionCompat error:', err);
    throw err;
  }

  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ===================== Listar trackers =====================

/**
 * Lista usuarios del tenant actual que pueden actuar como trackers.
 * Usa v_app_profiles, filtrada por tenant_id vía RLS.
 */
export async function listTrackers() {
  const { data, error } = await supabase
    .from('v_app_profiles')
    .select('id, email, full_name, role, tenant_id, is_active')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (error) {
    console.error('[trackerApi] listTrackers error:', error);
    throw error;
  }

  return data || [];
}

// ===================== Suscripción a posiciones =====================

/**
 * suscribirsePosiciones(callback, options)
 *
 * callback(evt):
 *  - snapshot: { type: 'snapshot', rows: [...] }
 *  - poll:     { type: 'poll', rows: [...] }
 *  - realtime: { type: 'realtime', row: {...} }
 *  - *_error:  { type: 'snapshot_error' | 'poll_error' | 'realtime_error', error }
 *
 * options:
 *  - filtros: { personal_id?, sinceMinutes? }
 *  - intervalMs: número ms para polling (backup)
 *  - enablePollingBackup: boolean
 *  - events: ['INSERT','UPDATE',...]
 */
export function suscribirsePosiciones(callback, options = {}) {
  const {
    filtros = {},
    intervalMs = 15000,
    enablePollingBackup = true,
    events = ['INSERT', 'UPDATE'],
  } = options;

  let stopped = false;
  let timerId = null;
  let channel = null;

  const applyFilters = (query) => {
    const f = filtros || {};
    if (f.personal_id) {
      query = query.eq('personal_id', f.personal_id);
    }
    if (f.sinceMinutes && Number.isFinite(f.sinceMinutes)) {
      const since = new Date(Date.now() - f.sinceMinutes * 60 * 1000).toISOString();
      query = query.gte('ts', since);
    }
    return query;
  };

  async function loadSnapshot(isPoll = false) {
    try {
      let query = supabase
        .from('positions')
        .select(
          'id, user_id, personal_id, lat, lng, accuracy, speed, heading, battery, ts, created_at'
        )
        .order('ts', { ascending: false })
        .limit(200); // límite razonable

      query = applyFilters(query);
      const { data, error } = await query;

      if (error) throw error;

      // Reducimos a "última posición por personal_id"
      const map = new Map();
      for (const row of data || []) {
        const key = row.personal_id || row.user_id || row.id;
        if (!map.has(key)) {
          map.set(key, row);
        }
      }

      const rows = Array.from(map.values());
      callback({
        type: isPoll ? 'poll' : 'snapshot',
        rows,
      });
    } catch (e) {
      console.error('[trackerApi] loadSnapshot error:', e);
      callback({
        type: isPoll ? 'poll_error' : 'snapshot_error',
        error: e,
      });
    }
  }

  // 1) Snapshot inicial
  loadSnapshot(false);

  // 2) Polling backup
  if (enablePollingBackup && intervalMs > 0) {
    timerId = setInterval(() => {
      if (!stopped) loadSnapshot(true);
    }, intervalMs);
  }

  // 3) Realtime via supabase.channel (si está disponible)
  if (typeof supabase.channel === 'function') {
    try {
      channel = supabase
        .channel('positions_tracker')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'positions' },
          (payload) => {
            if (stopped) return;
            const newRow = payload.new || payload.record || null;
            if (!newRow) return;

            const f = filtros || {};
            if (f.personal_id && newRow.personal_id !== f.personal_id) return;

            if (!events.includes(payload.eventType)) return;

            callback({
              type: 'realtime',
              row: newRow,
            });
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            callback({
              type: 'realtime_error',
              error: new Error('Error en canal realtime positions_tracker'),
            });
          }
        });
    } catch (e) {
      console.error('[trackerApi] error configurando realtime:', e);
      callback({ type: 'realtime_error', error: e });
    }
  }

  return {
    stop() {
      stopped = true;
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (e) {
          console.warn('[trackerApi] error removeChannel:', e);
        }
        channel = null;
      }
    },
  };
}
