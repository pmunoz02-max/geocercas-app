// src/api/geofences.js
import { supabase } from "../supabaseClient";

export async function POST(request) {
  try {
    const { name, geojson } = await request.json();

    const { data, error } = await supabase
      .from("geofences")
      .insert([{ name, geojson }]);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
      });
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
    });
  }
}
