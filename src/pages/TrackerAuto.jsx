// src/lib/trackerApi.js
// Cliente del frontend para llamar a la Edge Function "send_position"

import { supabase } from "../supabaseClient";

/**
 * Envía UNA posición al backend.
 * El backend (Edge Function send_position) decide:
 *  - si guarda el punto
 *  - o si lo descarta por estar fuera de geocerca / sin asignaciones
 *
 * @param {Object} payload { lat, lng, accuracy?, at?, meta? }
 * @returns {Promise<{ok: boolean, error?: string, stored?: any, reason?: string}>}
 */
export async function sendPosition(payload) {
  try {
    const { data, error } = await supabase.functions.invoke("send_position", {
      body: payload,
    });

    if (error) {
      console.error("[sendPosition] error invoke:", error);
      return {
        ok: false,
        error: error.message || "Error llamando a send_position",
      };
    }

    // La Edge Function que construimos retorna algo tipo:
    // { ok: true/false, stored: {...} | false, reason?, min_interval_ms? }
    return data;
  } catch (err) {
    console.error("[sendPosition] exception:", err);
    return {
      ok: false,
      error: err?.message || "Error de red al llamar a send_position",
    };
  }
}
