// src/lib/attendance.js
import { supabase } from "../supabaseClient.js";

/**
 * Obtiene (o crea) el registro de asistencia del usuario para una fecha dada.
 * @param {string} userId
 * @param {Date} dateObj  fecha local (no tz) del cliente
 */
export async function getOrCreateTodayAttendance(userId, dateObj = new Date()) {
  const fechaIso = dateObj.toISOString().slice(0, 10); // YYYY-MM-DD (local->ISO)
  // Intentar obtener
  let { data, error } = await supabase
    .from('asistencias')
    .select('*')
    .eq('user_id', userId)
    .eq('fecha', fechaIso)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116: no row returned

  if (!data) {
    // Crear
    const insert = {
      user_id: userId,
      fecha: fechaIso,
      notas: null,
    };
    const ins = await supabase
      .from('asistencias')
      .insert(insert)
      .select('*')
      .single();
    if (ins.error) throw ins.error;
    data = ins.data;
  }
  return data;
}

/**
 * Marca entrada: guarda hora y geolocalización
 */
export async function markCheckIn(attendanceId, coords) {
  const payload = {
    check_in: new Date().toISOString(),
    lat_in: coords?.latitude ?? null,
    lng_in: coords?.longitude ?? null,
  };
  const { data, error } = await supabase
    .from('asistencias')
    .update(payload)
    .eq('id', attendanceId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Marca salida: guarda hora y geolocalización
 */
export async function markCheckOut(attendanceId, coords) {
  const payload = {
    check_out: new Date().toISOString(),
    lat_out: coords?.latitude ?? null,
    lng_out: coords?.longitude ?? null,
  };
  const { data, error } = await supabase
    .from('asistencias')
    .update(payload)
    .eq('id', attendanceId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Lista asistencias (paginado simple)
 */
export async function listMyAttendance({ from, to, limit = 30, offset = 0 } = {}) {
  let query = supabase
    .from('asistencias')
    .select('*')
    .order('fecha', { ascending: false })
    .range(offset, offset + limit - 1);

  if (from) query = query.gte('fecha', from);
  if (to) query = query.lte('fecha', to);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Calcula horas trabajadas a partir de check_in / check_out
 */
export function calcHours(rec) {
  if (!rec?.check_in || !rec?.check_out) return 0;
  const start = new Date(rec.check_in).getTime();
  const end = new Date(rec.check_out).getTime();
  const ms = Math.max(0, end - start);
  return +(ms / 1000 / 3600).toFixed(2);
}
