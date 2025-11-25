// src/lib/geocercas.js (o donde lo estés usando)
import { supabase } from "../supabaseClient";

export async function getGeocercaById(geocercaId) {
  const pid = String(geocercaId ?? "");

  // Esto DEBE generar una petición a /rpc/geocerca_get (no /rest/v1/)
  const { data, error } = await supabase.rpc("geocerca_get", { pid });

  if (error) {
    console.error("geocerca_get error:", error);
    throw new Error(error.message || "Error al cargar geocerca (RPC).");
  }

  return data?.[0] ?? null;
}
