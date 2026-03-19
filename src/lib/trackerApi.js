// src/lib/trackerApi.js
// API unificada para tracking (CAN├ôNICO: tracker_positions)
// - listTrackers: lista usuarios trackers del tenant
// - getSessionUser: obtiene usuario actual
// - upsertPositionCompat: env├¡a posici├│n al Edge Function send_position
// - suscribirsePosiciones: snapshot + realtime + polling sobre tracker_positions
// - fetchLatest / subscribeLatest: helpers usados por useRealtimePositions

import { supabase, getMemoryAccessToken } from "../lib/supabaseClient";

// Ô£à Tabla can├│nica ├║nica
const POSITIONS_TABLE = "tracker_positions";
const TRACKER_ACTIVE_PING_WINDOW_MS = 5 * 60 * 1000;

// EDGE_URL puede venir como:
// - URL completa a la function (recomendado): https://...supabase.co/functions/v1/send_position
// - o base supabase url: https://...supabase.co  (se completa autom├íticamente)
// - o vac├¡o: intenta VITE_SUPABASE_FUNCTIONS_URL + /functions/v1/send_position
const RAW_EDGE_URL =
  import.meta.env.VITE_EDGE_SEND_POSITION ||
  import.meta.env.VITE_SUPABASE_FUNCTIONS_URL ||
  "";

function buildEdgeUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  // si ya apunta a functions/v1, lo dejamos
  if (s.includes("/functions/v1/")) return s;
  // si termina en /, quitamos
  const base = s.replace(/\/+$/, "");
  return `${base}/functions/v1/send_position`;
}

const EDGE_URL = buildEdgeUrl(RAW_EDGE_URL);

function getTrackerActivePingKey(orgId, userId) {
  return `tracker_ping_${orgId}_${userId}`;
}

function getTrackerActivePingLastAt(key) {
  if (typeof localStorage === "undefined") return 0;
  return Number(localStorage.getItem(key) || 0);
}

function setTrackerActivePingLastAt(key, value) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, String(value));
}

function emitTrackerActivePing({ orgId, userId, lat, lng }) {
  if (!orgId || !userId) return;

  const key = getTrackerActivePingKey(orgId, userId);
  const now = Date.now();
  const lastPing = getTrackerActivePingLastAt(key);

  if (now - lastPing <= TRACKER_ACTIVE_PING_WINDOW_MS) return;

  setTrackerActivePingLastAt(key, now);

  void supabase
    .from("org_metrics_events")
    .insert({
      org_id: orgId,
      user_id: userId,
      event_type: "tracker_active_ping",
      meta: {
        lat,
        lng,
      },
    })
    .catch(() => {
      // never block tracking
    });
}

// ===================== Helpers de Auth =====================

export async function getSessionUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("[trackerApi] getSessionUser error:", error);
    throw error;
  }
  return data?.user || null;
}

async function getSessionAccessToken() {
  // Ô£à Arquitectura final: primero token en memoria (AuthCallback lo setea)
  const mem = getMemoryAccessToken?.();
  if (mem) return mem;

  // fallback (por si en alg├║n flujo hay sesi├│n interna)
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("[trackerApi] getSessionAccessToken error:", error);
    return "";
  }
  return data?.session?.access_token || "";
}

// ===================== Env├¡o de posiciones =====================

/**
 * upsertPositionCompat
 * Enviar posici├│n al Edge Function send_position (server-owned):
 * payload:
 *  - orgId (opcional; server lo ignora y resuelve org can├│nica)
 *  - userId (opcional; server usa el user del JWT)
 *  - personalId (opcional)
 *  - lat, lng
 *  - accuracy, speed, heading, battery (opcionales)
 *  - at (Date | string | null) ÔÇô timestamp de la posici├│n
 */
export async function upsertPositionCompat(payload) {
  if (!EDGE_URL) {
    throw new Error(
      "EDGE_URL no configurado (VITE_EDGE_SEND_POSITION o VITE_SUPABASE_FUNCTIONS_URL). Revisa tu .env.local"
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

  if (typeof lat !== "number" || typeof lng !== "number") {
    throw new Error("Lat/Lng inv├ílidos en upsertPositionCompat");
  }

  const token = await getSessionAccessToken();

  const body = {
    org_id: orgId || null, // server-owned (ignorado)
    user_id: userId || null, // server-owned (ignorado)
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
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(
      `send_position failed: ${res.status} ${text || res.statusText}`
    );
    // @ts-ignore
    err.status = res.status;
    try {
      // @ts-ignore
      err.details = text ? JSON.parse(text) : null;
    } catch {
      // ignore
    }
    console.error("[trackerApi] upsertPositionCompat error:", err);
    throw err;
  }

  try {
    const data = await res.json();
    emitTrackerActivePing({ orgId, userId, lat, lng });
    return data;
  } catch {
    emitTrackerActivePing({ orgId, userId, lat, lng });
    return null;
  }
}

// ===================== Listar trackers =====================

/**
 * Lista usuarios del tenant actual que pueden actuar como trackers.
 * Usa v_app_profiles, filtrada por tenant_id v├¡a RLS.
 */
export async function listTrackers() {
  const { data, error } = await supabase
    .from("v_app_profiles")
    .select("id, email, full_name, role, tenant_id, is_active")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) {
    console.error("[trackerApi] listTrackers error:", error);
    throw error;
  }

  return data || [];
}

// ===================== Suscripci├│n a posiciones (CAN├ôNICO) =====================

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
 *  - intervalMs: n├║mero ms para polling (backup)
 *  - enablePollingBackup: boolean
 *  - events: ['INSERT','UPDATE',...]
 */
export function suscribirsePosiciones(callback, options = {}) {
  const {
    filtros = {},
    intervalMs = 15000,
    enablePollingBackup = true,
    events = ["INSERT", "UPDATE"],
  } = options;

  let stopped = false;
  let timerId = null;
  let channel = null;

  const applyFilters = (query) => {
    const f = filtros || {};
    if (f.personal_id) query = query.eq("personal_id", f.personal_id);

    if (f.sinceMinutes && Number.isFinite(f.sinceMinutes)) {
      const since = new Date(
        Date.now() - f.sinceMinutes * 60 * 1000
      ).toISOString();
      query = query.gte("recorded_at", since);
    }
    return query;
  };

  async function loadSnapshot(isPoll = false) {
    try {
      let query = supabase
        .from(POSITIONS_TABLE)
        .select(
          "id, org_id, user_id, personal_id, lat, lng, accuracy, speed, heading, battery, source, recorded_at, created_at"
        )
        .order("recorded_at", { ascending: false })
        .limit(500);

      query = applyFilters(query);

      const { data, error } = await query;
      if (error) throw error;

      // ├Ültima posici├│n por personal_id (o user_id como fallback)
      const map = new Map();
      for (const row of data || []) {
        const key = row.personal_id || row.user_id || row.id;
        if (!map.has(key)) map.set(key, row);
      }

      callback({
        type: isPoll ? "poll" : "snapshot",
        rows: Array.from(map.values()),
      });
    } catch (e) {
      console.error("[trackerApi] loadSnapshot error:", e);
      callback({ type: isPoll ? "poll_error" : "snapshot_error", error: e });
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

  // 3) Realtime
  if (typeof supabase.channel === "function") {
    try {
      channel = supabase
        .channel("tracker_positions_channel")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: POSITIONS_TABLE },
          (payload) => {
            if (stopped) return;

            if (payload?.eventType && !events.includes(payload.eventType)) return;

            const newRow = payload.new || payload.record || null;
            if (!newRow) return;

            const f = filtros || {};
            if (f.personal_id && newRow.personal_id !== f.personal_id) return;

            callback({ type: "realtime", row: newRow });
          }
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR") {
            callback({
              type: "realtime_error",
              error: new Error("Error en canal realtime tracker_positions_channel"),
            });
          }
        });
    } catch (e) {
      console.error("[trackerApi] error configurando realtime:", e);
      callback({ type: "realtime_error", error: e });
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
          if (typeof supabase.removeChannel === "function") {
            supabase.removeChannel(channel);
          } else if (typeof channel.unsubscribe === "function") {
            channel.unsubscribe();
          }
        } catch (e) {
          console.warn("[trackerApi] error cerrando canal:", e);
        }
        channel = null;
      }
    },
  };
}

// ===================== Helpers usados por useRealtimePositions =====================

export async function fetchLatest(orgId, { limit = 500 } = {}) {
  if (!orgId) return [];

  const { data, error } = await supabase
    .from(POSITIONS_TABLE)
    .select("id, org_id, user_id, personal_id, lat, lng, accuracy, speed, heading, battery, source, recorded_at, created_at")
    .eq("org_id", orgId)
    .order("recorded_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[trackerApi] fetchLatest error:", error);
    throw error;
  }

  // last by user_id
  const map = new Map();
  for (const r of data || []) {
    const k = r.user_id || r.id;
    if (!map.has(k)) map.set(k, r);
  }
  return Array.from(map.values());
}

export function subscribeLatest({ orgId, onInsertOrUpdate } = {}) {
  if (!orgId) return { unsubscribe: () => {} };

  const ch = supabase
    .channel(`rt-${POSITIONS_TABLE}-${orgId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: POSITIONS_TABLE, filter: `org_id=eq.${orgId}` },
      (payload) => {
        if (!payload) return;
        if (payload.eventType !== "INSERT" && payload.eventType !== "UPDATE") return;
        onInsertOrUpdate?.(payload);
      }
    )
    .subscribe();

  return {
    unsubscribe() {
      try {
        if (typeof supabase.removeChannel === "function") supabase.removeChannel(ch);
        else if (typeof ch.unsubscribe === "function") ch.unsubscribe();
      } catch {}
    },
  };
}
