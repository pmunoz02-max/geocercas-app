// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // HARD FAIL: mejor romper aquí que “colgar” login.
  throw new Error(
    "[supabaseClient] FALTAN env vars: VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY (o sus fallbacks). Revisa Vercel Env Vars."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "sb-geocercas-auth-token",
  },
});
