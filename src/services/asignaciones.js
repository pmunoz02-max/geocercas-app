// src/services/asignaciones.js
import supabase from "../lib/supabaseClient";

const TABLE = "asignaciones";

function sb() {
  if (!supabase || typeof supabase.from !== "function") {
    throw new Error(
      "[asignaciones] Supabase no está inicializado. Revisa src/lib/supabaseClient.ts/js y tu .env"
    );
  }
  return supabase;
}

// Crea una asignación persona ↔ geocerca
export async function crearAsignacion(data, ownerId) {
  const payload = {
    persona_id: data?.persona_id, // uuid
    geocerca_id:
      typeof data?.geocerca_id === "string"
        ? Number(data.geocerca_id)
        : data?.geocerca_id, // bigint
    notas: data?.notas ?? null,
    ...(ownerId ? { owner_id: ownerId } : {}),
  };

  const { data: row, error } = await sb()
    .from(TABLE)
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return row;
}

// Lista todas las asignaciones
export async function listarAsignaciones(ownerId) {
  let q = sb().from(TABLE).select("*").order("created_at", { ascending: false });
  if (ownerId) q = q.eq("owner_id", ownerId);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// Obtiene una asignación por ID
export async function obtenerAsignacionPorId(id) {
  const { data, error } = await sb().from(TABLE).select("*").eq("id", id).single();
  if (error && error.code !== "PGRST116") throw error;
  return data ?? null;
}

// Actualiza una asignación
export async function actualizarAsignacion(id, patch) {
  const upd = { updated_at: new Date().toISOString() };

  if ("persona_id" in patch) upd.persona_id = patch.persona_id ?? null;
  if ("geocerca_id" in patch) {
    upd.geocerca_id =
      typeof patch.geocerca_id === "string"
        ? Number(patch.geocerca_id)
        : patch.geocerca_id;
  }
  if ("notas" in patch) upd.notas = patch.notas ?? null;

  const { data, error } = await sb()
    .from(TABLE)
    .update(upd)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

// Elimina una asignación
export async function eliminarAsignacion(id) {
  const { error } = await sb().from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

export default {
  crearAsignacion,
  listarAsignaciones,
  obtenerAsignacionPorId,
  actualizarAsignacion,
  eliminarAsignacion,
};
