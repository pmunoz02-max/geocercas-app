// src/lib/costosApi.js
import { supabase } from "../supabaseClient";

/**
 * Obtiene el detalle de costos de asignaciones para un rango de fechas.
 * @param {Object} params
 * @param {string} params.from ISO string (timestamptz) inicio rango
 * @param {string} params.to   ISO string (timestamptz) fin rango
 */
export async function getCostosAsignaciones({ from, to }) {
  const { data, error } = await supabase.rpc("get_costos_asignaciones", {
    p_from: from,
    p_to: to,
  });

  return { data: data || [], error };
}
