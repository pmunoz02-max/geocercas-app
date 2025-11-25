// src/lib/supabaseClient.ts
// Puente para que las importaciones "../supabaseClient"
// funcionen tanto en TS como en JS, reusando el cliente real.

import {
  supabase,
  getSupabase,
  ensuresupabaseClient,
} from "../supabaseClient";

export { supabase, getSupabase, ensuresupabaseClient };
export default supabase;
