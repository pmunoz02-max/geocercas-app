// src/lib/activitiesApi.js
import supabase from "./supabaseClient.js";
const TABLE = "activities";

export async function listActivities() {
  const { data, error } = await supabase.from(TABLE).select("*");
  if (error) throw error;
  return data || [];
}
export async function createActivity(payload) {
  const { data, error } = await supabase.from(TABLE).insert(payload).select("*").single();
  if (error) throw error;
  return data;
}
export async function updateActivity(id, payload) {
  const { data, error } = await supabase.from(TABLE).update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}
export async function deleteActivity(id) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
  return true;
}
