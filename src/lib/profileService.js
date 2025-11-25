// src/lib/profileService.js
import { supabase } from './supabaseClient';

export async function getMyProfile() {
  // Usa la vista my_profile creada en SQL
  const { data, error } = await supabase.from('my_profile').select('*').single();
  if (error) throw error;
  return data; // { user_id, full_name, default_org, org_name, plan }
}

// Alternativa con RPC:
// export async function getDefaultOrg() {
//   const { data, error } = await supabase.rpc('get_default_org');
//   if (error) throw error;
//   return data; // uuid
// }
