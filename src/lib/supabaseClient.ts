// src/lib/supabaseClient.ts
// Puente para que las importaciones "@/lib/supabaseClient"
// funcionen tanto en TS como en JS, reusando el cliente real.

import {
  supabase,
  getSupabase,
  ensureSupabaseClient,
} from "../supabaseClient";

export { supabase, getSupabase, ensureSupabaseClient };
export default supabase;
