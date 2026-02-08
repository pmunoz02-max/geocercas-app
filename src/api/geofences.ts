// src/api/geofences.ts
import { supabase } from "../supabaseClient";

/**
 * Inserta SIEMPRE en la tabla canónica: public.geofences
 * Espera que el cliente envíe: { name, geojson|polygon_geojson, org_id, active?, description? }
 */
const ALLOWED_INSERT_COLS = ["name", "geojson", "polygon_geojson", "org_id", "active", "description"] as const;
type AllowedInsertKey = (typeof ALLOWED_INSERT_COLS)[number];

function pickAllowed<T extends Record<string, any>>(src: T): Partial<Record<AllowedInsertKey, any>> {
  const out: Partial<Record<AllowedInsertKey, any>> = {};
  for (const key of ALLOWED_INSERT_COLS) {
    if (key in src) out[key] = src[key];
  }
  return out;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const payload = pickAllowed(body);

    // Defaults seguros
    if (payload.active === undefined || payload.active === null) payload.active = true;

    // Requisito del proyecto: org_id obligatorio
    if (!payload.org_id) {
      return new Response(JSON.stringify({ error: "org_id es obligatorio" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Debe tener un nombre
    if (!payload.name) {
      return new Response(JSON.stringify({ error: "name es obligatorio" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Debe tener geometría en alguna de las dos formas
    if (!payload.geojson && !payload.polygon_geojson) {
      return new Response(JSON.stringify({ error: "geojson o polygon_geojson es obligatorio" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase
      .from("geofences")
      .insert([payload])
      .select("id, org_id, name, active, created_at");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
