// src/lib/geocercas.js
import { supabase } from "../supabaseClient";

// detecta UUID v4 o texto "id_text" (si lo usas)
const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Devuelve 1 geocerca por id (uuid) o por id_text (string).
 * Estructura esperada de tu tabla: geocercas(id, nombre, descripcion, coordenadas, usuario_id?)
 * - coordenadas: array de polígonos [[ [lat,lng], ... ], ...]
 */
export async function getGeocercaById(idOrText) {
  let q = supabase
    .from("geocercas")
    .select("id, nombre, descripcion, coordenadas")
    .limit(1);

  if (uuidRe.test(String(idOrText))) {
    q = q.eq("id", idOrText);
  } else {
    // si NO usas id_text, puedes eliminar esta línea
    q = q.eq("id_text", String(idOrText));
  }

  const { data, error } = await q.single();
  if (error) throw error;
  return data; // { id, nombre, descripcion, coordenadas }
}

/** Lista corta para combos */
export async function listGeocercas({ limit = 300 } = {}) {
  const { data, error } = await supabase
    .from("geocercas")
    .select("id, nombre")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
