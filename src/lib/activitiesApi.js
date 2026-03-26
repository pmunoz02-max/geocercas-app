// src/lib/activitiesApi.js
import { supabase } from "../lib/supabaseClient";
import { withActiveOrg } from "./withActiveOrg";

const TABLE = "activities";

export async function listActivities() {
  const { data, error } = await supabase.from(TABLE).select("*");
  if (error) throw error;
  return data || [];
}

export async function createActivity(payload = {}, orgId = null) {
  const insertRow = withActiveOrg(payload, orgId);
  const { data, error } = await supabase
    .from(TABLE)
    .insert(insertRow)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateActivity(id, payload = {}, orgId = null) {
  const updateRow = withActiveOrg(payload, orgId);
  const { data, error } = await supabase
    .from(TABLE)
    .update(updateRow)
    .eq("id", id)
    .eq("org_id", String(orgId))
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteActivity(id, orgId = null) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id).eq("org_id", String(orgId));
  if (error) throw error;
  return true;
}
