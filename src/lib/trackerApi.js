// src/lib/trackerApi.js
// API unificada para tracking:
// - listTrackers: lista usuarios trackers del tenant
// - getSessionUser: obtiene usuario actual
// - upsertPositionCompat: envía posición al Edge Function send_position
// - suscribirsePosiciones: snapshot + realtime + polling sobre la tabla positions

<<<<<<< HEAD
import { supabase } from "./supabaseClient";
=======
import { supabase, getMemoryAccessToken } from "../lib/supabaseClient";
>>>>>>> preview

const EDGE_URL = import.meta.env.VITE_EDGE_SEND_POSITION;

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
  // ✅ Arquitectura final: primero token en memoria (AuthCallback lo setea)
  const mem = getMemoryAccessToken?.();
  if (mem) return mem;

  // fallback (por si en algún flujo hay sesión interna)
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("[trackerApi] getSessionAccessToken error:", error);
<<<<<<< HEAD
    throw error;
=======
    return "";
>>>>>>> preview
  }
  return data?.session?.access_token || "";
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
 *  - at (Date | string | null)
 */
export async function upsertPositionCompat(payload) {
<<<<<<< HEAD
=======
  if (!EDGE_URL) {
    throw new Error(
      "EDGE_URL no configurado (VITE_EDGE_SEND_POSITION). Revisa tu .env.local"
    );
  }

>>>>>>> preview
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
    throw new Error("Lat/Lng inválidos en upsertPositionCompat");
  }
<<<<<<< HEAD
=======
  if (!orgId) {
    console.warn("[trackerApi] upsertPositionCompat sin orgId");
  }

  const token = await getSessionAccessToken();
>>>>>>> preview

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

<<<<<<< HEAD
  // Preferir fetch directo si está configurado (compatibilidad)
  if (EDGE_URL) {
    const token = await getSessionAccessToken();

    const res = await fetch(EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token ? `Bearer ${token}` : "",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`send_position failed: ${res.status} ${text || res.statusText}`);
      // @ts-ignore
      err.status = res.status;
      try {
        // @ts-ignore
        err.details = JSON.parse(text);
      } catch {
        // ignore
      }
      console.error("[trackerApi] upsertPositionCompat error:", err);
      throw err;
    }

    try {
      return await res.json();
    } catch {
      return null;
    }
=======
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
>>>>>>> preview
  }

  // Fallback universal: Supabase Edge Functions invoke
  const { data, error } = await supabase.functions.invoke("send_position", { body });

  if (error) {
    console.error("[trackerApi] invoke send_position error:", error);
    throw new Error(error.message || "Error invoke send_position");
  }

  return data ?? null;
}

// ===================== Listar trackers =====================

/**
 * Lista usuarios del tenant actual que pueden actuar como trackers.
 * Usa v_app_profiles, filtrada por tenant_id vía RLS.
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

// ===================== Suscripción a posiciones =====================

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
<<<<<<< HEAD
    if (f.user_id) query = query.eq("user_id", f.user_id);
    if (f.org_id) query = query.eq("org_id", f.org_id);

    if (f.sinceMinutes && Number.isFinite(f.sinceMinutes)) {
      const since = new Date(Date.now() - f.sinceMinutes * 60 * 1000).toISOString();
=======

    if (f.sinceMinutes && Number.isFinite(f.sinceMinutes)) {
      const since = new Date(
        Date.now() - f.sinceMinutes * 60 * 1000
      ).toISOString();
>>>>>>> preview
      query = query.gte("ts", since);
    }
    return query;
  };

  async function loadSnapshot(isPoll = false) {
    try {
      let query = supabase
        .from("positions")
<<<<<<< HEAD
        .select("id, org_id, user_id, personal_id, lat, lng, accuracy, speed, heading, battery, ts, created_at")
=======
        .select(
          "id, user_id, personal_id, lat, lng, accuracy, speed, heading, battery, ts, created_at"
        )
>>>>>>> preview
        .order("ts", { ascending: false })
        .limit(200);

      query = applyFilters(query);
<<<<<<< HEAD
      const { data, error } = await query;
      if (error) throw error;

=======

      const { data, error } = await query;
      if (error) throw error;

      // Última posición por personal_id
>>>>>>> preview
      const map = new Map();
      for (const row of data || []) {
        const key = row.personal_id || row.user_id || row.id;
        if (!map.has(key)) map.set(key, row);
      }

<<<<<<< HEAD
      const rows = Array.from(map.values());
      callback({ type: isPoll ? "poll" : "snapshot", rows });
=======
      callback({ type: isPoll ? "poll" : "snapshot", rows: Array.from(map.values()) });
>>>>>>> preview
    } catch (e) {
      console.error("[trackerApi] loadSnapshot error:", e);
      callback({ type: isPoll ? "poll_error" : "snapshot_error", error: e });
    }
  }

  loadSnapshot(false);

  if (enablePollingBackup && intervalMs > 0) {
    timerId = setInterval(() => {
      if (!stopped) loadSnapshot(true);
    }, intervalMs);
  }

<<<<<<< HEAD
=======
  // 3) Realtime
>>>>>>> preview
  if (typeof supabase.channel === "function") {
    try {
      channel = supabase
        .channel("positions_tracker")
<<<<<<< HEAD
        .on("postgres_changes", { event: "*", schema: "public", table: "positions" }, (payload) => {
          if (stopped) return;
          const newRow = payload.new || payload.record || null;
          if (!newRow) return;
=======
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "positions" },
          (payload) => {
            if (stopped) return;

            // Filtra por evento (INSERT/UPDATE/DELETE)
            if (payload?.eventType && !events.includes(payload.eventType)) return;

            const newRow = payload.new || payload.record || null;
            if (!newRow) return;
>>>>>>> preview

          const f = filtros || {};
          if (f.personal_id && newRow.personal_id !== f.personal_id) return;
          if (f.user_id && newRow.user_id !== f.user_id) return;
          if (f.org_id && newRow.org_id !== f.org_id) return;

<<<<<<< HEAD
          if (!events.includes(payload.eventType)) return;

          callback({ type: "realtime", row: newRow });
        })
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR") {
            callback({ type: "realtime_error", error: new Error("Error en canal realtime positions_tracker") });
=======
            callback({ type: "realtime", row: newRow });
          }
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR") {
            callback({
              type: "realtime_error",
              error: new Error("Error en canal realtime positions_tracker"),
            });
>>>>>>> preview
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
<<<<<<< HEAD
          console.warn("[trackerApi] error removeChannel:", e);
=======
          console.warn("[trackerApi] error cerrando canal:", e);
>>>>>>> preview
        }
        channel = null;
      }
    },
  };
}
