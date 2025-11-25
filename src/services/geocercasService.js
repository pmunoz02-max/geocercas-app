// src/services/geocercasService.js
import { supabase } from "../lib/supabaseClient";

/** Crea geocerca vía RPC con validación de nombre único (en BD). */
export async function crearGeocerca({ nombre, geom, activa = true }) {
  const n = (nombre ?? "").trim();
  if (!n) return { data: null, error: new Error("El nombre es obligatorio") };
  if (!geom) return { data: null, error: new Error("La geometría (geom) es obligatoria") };

  const { data, error } = await supabase.rpc("rpc_crear_geocerca", {
    p_nombre: n,
    p_geom: geom,
    p_activa: activa,
  });

  if (error) {
    const msg = (error.message || "").toUpperCase();
    if (error.code === "23505" || msg.includes("YA EXISTE") || msg.includes("DUPLICATE")) {
      return { data: null, error: new Error("YA EXISTE UNA GEOCERCA CON ESTE NOMBRE") };
    }
    return { data: null, error };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { data: row ?? null, error: null };
}

/** Lista geocercas activas (para pintar en verde). */
export async function listarGeocercasActivas({ limit = 1000, offset = 0 } = {}) {
  const { data, error, count } = await supabase
    .from("geocercas")
    .select("id,nombre,geom,activa,created_at", { count: "exact" })
    .eq("activa", true)
    .order("nombre", { ascending: true })
    .range(offset, offset + limit - 1);

  return { data, error, count };
}
