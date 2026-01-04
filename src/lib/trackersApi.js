// src/lib/trackersApi.js
import supabase from "./supabaseClient.js";
const TABLE = "trackers";

export async function listTrackers() {
  const { data, error } = await supabase.from(TABLE).select("*");
  if (error) throw error;
  return data || [];
}
