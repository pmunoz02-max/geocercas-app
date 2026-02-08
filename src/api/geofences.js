// src/api/geofences.js
import { supabase } from "../supabaseClient";

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, geojson, polygon_geojson, org_id, active, description } = body || {};

    if (!org_id) {
      return new Response(JSON.stringify({ error: "org_id es obligatorio" }), { status: 400 });
    }
    if (!name) {
      return new Response(JSON.stringify({ error: "name es obligatorio" }), { status: 400 });
    }
    if (!geojson && !polygon_geojson) {
      return new Response(JSON.stringify({ error: "geojson o polygon_geojson es obligatorio" }), { status: 400 });
    }

    const payload = {
      org_id,
      name,
      active: active ?? true,
      description: description ?? null,
      geojson: geojson ?? null,
      polygon_geojson: polygon_geojson ?? null,
    };

    const { data, error } = await supabase
      .from("geofences")
      .insert([payload])
      .select("id, org_id, name, active, created_at");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    }

    return new Response(JSON.stringify({ success: true, data }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
