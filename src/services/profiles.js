// /src/services/profiles.js
import { supabase } from "../supabaseClient";

const TABLE = "profiles";

export async function listProfiles() {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id,email,full_name,role_id,created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
