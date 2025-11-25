// src/services/personalService.js
import { supabase } from '../lib/supabaseClient';

const PAGE_SIZE = 10;

export async function fetchPersonal({ orgId, page = 1, q = '' }) {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('personal')
    .select(
      'id, nombre, apellido, email, telefono, vigente, fecha_inicio, fecha_fin, org_id',
      { count: 'exact' }
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (q.trim()) {
    query = query.or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0, pageSize: PAGE_SIZE };
}

/** DELETE con fallback a "borrado suave" si hay FK (23503) */
export async function deletePersonal(id) {
  const { error } = await supabase.from('personal').delete().eq('id', id);
  if (!error) return { mode: 'hard' };

  if (error.code === '23503') {
    const today = new Date().toISOString().slice(0, 10);
    const { error: updErr } = await supabase
      .from('personal')
      .update({ vigente: false, fecha_fin: today })
      .eq('id', id);
    if (updErr) throw updErr;
    return { mode: 'soft' };
  }
  throw error; // RLS u otro problema
}

/** Cambiar “vigente” (Activo) sí/no */
export async function toggleVigente(id, nextVigente) {
  const patch = nextVigente
    ? { vigente: true, fecha_fin: null }
    : { vigente: false, fecha_fin: new Date().toISOString().slice(0, 10) };

  const { data, error } = await supabase
    .from('personal')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
