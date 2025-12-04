// src/lib/costosApi.js
import { supabase } from "../supabaseClient";

/**
 * Helper para convertir fechas de inputs type="date" a rango timestamptz ISO.
 *
 * @param {string} fromDateStr  "YYYY-MM-DD" o ""
 * @param {string} toDateStr    "YYYY-MM-DD" o ""
 * @returns {{ from: string|null, to: string|null }}
 *
 * Se interpreta como:
 *   start_time >= from
 *   start_time  < to
 *
 * Es decir, el día "Hasta" se incluye completo.
 */
export function buildDateRangeForCostos(fromDateStr, toDateStr) {
  let from = null;
  let to = null;

  if (fromDateStr) {
    const d = new Date(fromDateStr + "T00:00:00");
    if (!Number.isNaN(d.getTime())) {
      from = d.toISOString();
    }
  }

  if (toDateStr) {
    const d = new Date(toDateStr + "T00:00:00");
    if (!Number.isNaN(d.getTime())) {
      d.setDate(d.getDate() + 1);
      to = d.toISOString(); // día siguiente a las 00:00
    }
  }

  return { from, to };
}

/**
 * Obtiene el detalle de costos de asignaciones para un rango de fechas.
 *
 * @param {Object} params
 * @param {string|null} params.from  ISO string (timestamptz) inicio rango, o null
 * @param {string|null} params.to    ISO string (timestamptz) fin rango exclusivo, o null
 * @param {string}      params.orgId UUID de la organización
 */
export async function getCostosAsignaciones({ from, to, orgId }) {
  const { data, error } = await supabase.rpc("get_costos_asignaciones", {
    p_from: from,
    p_to: to,
    p_org_id: orgId,
  });

  if (error) {
    console.error("[costosApi] get_costos_asignaciones RPC error:", error);
  }

  return { data: data || [], error };
}
