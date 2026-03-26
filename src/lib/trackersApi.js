// src/lib/trackersApi.js
import supabase from "./supabaseClient.js";
const TABLE = "trackers";

export async function listTrackers(orgId) {
  // Selecciona todos los trackers y calcula has_active_assignment
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { data, error } = await supabase
    .from(TABLE)
    .select(`*, tracker_assignments:tracker_assignments!inner(id, org_id, active, start_date, end_date)`)
    .eq('tracker_assignments.org_id', orgId)
    .eq('tracker_assignments.active', true)
    .lte('tracker_assignments.start_date', today)
    .gte('tracker_assignments.end_date', today);
  if (error) throw error;
  // Si hay al menos una asignación activa, marcar el flag
  return (data || []).map(tracker => ({
    ...tracker,
    has_active_assignment: Array.isArray(tracker.tracker_assignments) && tracker.tracker_assignments.length > 0
  }));
}
