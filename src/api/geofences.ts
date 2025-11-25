// src/api/geofences.ts
import { supabase } from "../supabaseClient";

/** Sólo estas columnas se pueden insertar/actualizar desde cliente */
const ALLOWED_INSERT_COLS = ["name", "polygon_geojson", "org_id", "active", "description"] as const;
type AllowedInsertKey = (typeof ALLOWED_INSERT_COLS)[number];

function pickAllowed<T extends Record<string, any>>(src: T): Pick<T, AllowedInsertKey> {
  const out: Partial<T> = {};
  for (const key of ALLOWED_INSERT_COLS) {
    if (key in src) out[key] = src[key];
  }
  return out as Pick<T, AllowedInsertKey>;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const payload = pickAllowed(body);

    const { data, error } = await supabase
      .from("geocercas")
      .insert([payload])
      .select();

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
    return new Response(
      JSON.stringify({ error: e?.message ?? "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
