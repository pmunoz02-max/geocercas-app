// /src/services/personal.js
import { supabase } from "@/lib/supabaseClient";

const TABLE = "personal";

/**
 * Lista paginada de personal
 */
export async function listPersonal({ page = 1, pageSize = 20, search = "" } = {}) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from(TABLE)
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search && search.trim()) {
    query = query.ilike("full_name", `%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: data ?? [], total: count ?? 0, page, pageSize };
}

/**
 * Obtiene una persona por id
 */
export async function getPersona(id) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Crea registro de personal
 * payload esperado: { full_name, email, phone, active, start_date, end_date }
 */
export async function createPersona(payload) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Actualiza registro
 */
export async function updatePersona(id, patch) {
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Elimina registro
 */
export async function deletePersona(id) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
  return true;
}
