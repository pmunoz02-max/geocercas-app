// src/lib/costosApi.js
import { supabase } from "../supabaseClient";

/**
 * Convierte fechas de inputs type="date" (YYYY-MM-DD) a un rango ISO (timestamptz).
 *
 * Retorna:
 *  - fromIso:        ISO inclusive  (>=)
 *  - toIsoExclusive: ISO exclusivo  (<)  -> incluye completo el día "Hasta"
 */
export function buildDateRangeIso(fromDateStr, toDateStr) {
  let fromIso = null;
  let toIsoExclusive = null;

  if (fromDateStr) {
    const d = new Date(fromDateStr + "T00:00:00");
    if (!Number.isNaN(d.getTime())) fromIso = d.toISOString();
  }

  if (toDateStr) {
    const d = new Date(toDateStr + "T00:00:00");
    if (!Number.isNaN(d.getTime())) {
      d.setDate(d.getDate() + 1); // día siguiente a las 00:00
      toIsoExclusive = d.toISOString();
    }
  }

  return { fromIso, toIsoExclusive };
}

/**
 * Obtiene el detalle de costos por asignación (filtrado SIEMPRE por org).
 *
 * @param {Object} params
 * @param {string|null} params.from   ISO timestamptz inclusive (>=). Ej: "2025-12-01T05:00:00.000Z"
 * @param {string|null} params.to     ISO timestamptz exclusivo (<). Ej: "2025-12-31T05:00:00.000Z"
 * @param {string}      params.orgId  UUID de la organización activa (org_id).
 */
export async function getCostosAsignaciones({ from = null, to = null, orgId }) {
  if (!orgId) {
    const error = new Error("orgId is required in getCostosAsignaciones()");
    console.error("[costosApi] Missing orgId:", { from, to, orgId });
    return { data: [], error };
  }

  // RPC V2: blindado por org_id + validación de membresía en backend.
  // Si por cualquier razón la V2 no existiera aún, hacemos fallback al RPC antiguo.
  const tryV2 = async () =>
    supabase.rpc("get_costos_asignaciones_v2", {
      p_org_id: orgId,
      p_from: from,
      p_to: to,
    });

  const tryV1 = async () =>
    supabase.rpc("get_costos_asignaciones", {
      p_org_id: orgId,
      p_from: from,
      p_to: to,
    });

  let res = await tryV2();

  // Si la función no existe (PGRST202) o 42883 (undefined_function), cae a V1.
  if (res?.error) {
    const msg = String(res.error?.message || "");
    const code = String(res.error?.code || "");
    const isMissingFn =
      code === "42883" ||
      msg.toLowerCase().includes("does not exist") ||
      msg.toLowerCase().includes("undefined function") ||
      msg.toLowerCase().includes("could not find the function") ||
      msg.toLowerCase().includes("pgrst202");

    if (isMissingFn) {
      console.warn("[costosApi] RPC V2 not found, falling back to V1:", res.error);
      res = await tryV1();
    }
  }

  const { data, error } = res || { data: null, error: null };

  if (error) {
    console.error("[costosApi] RPC error:", error);
  }

  return { data: data || [], error };
}
