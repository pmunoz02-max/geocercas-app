// src/services/asistencia.js
import supabase from "../lib/supabaseClient";

const TABLE = "asistencias"; // usa el nombre real de tu tabla

function sb() {
  if (!supabase || typeof supabase.from !== "function") {
    throw new Error("[asistencia] Supabase no está inicializado");
  }
  return supabase;
}

/**
 * Devuelve las asistencias de HOY del usuario/owner actual (si usas RLS por owner)
 * Ajusta filtros según tu esquema (persona_id, geocerca_id, etc.)
 */
export async function asistenciaHoy() {
  // rango de hoy en UTC (ajusta si necesitas zona horaria específica)
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);

  const { data, error } = await sb()
    .from(TABLE)
    .select("*")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/** Crear un registro de asistencia (opcional, si lo usas) */
export async function registrarAsistencia(payload) {
  const { data, error } = await sb()
    .from(TABLE)
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export default { asistenciaHoy, registrarAsistencia };
