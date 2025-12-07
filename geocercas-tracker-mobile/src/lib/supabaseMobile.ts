// src/lib/supabaseMobile.ts
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wpaixkvokdkudymgjoua.supabase.co";
// ⚠️ IMPORTANTE: reemplaza este placeholder por tu ANON KEY real de Supabase
const SUPABASE_ANON_KEY = "PON_AQUI_TU_SUPABASE_ANON_KEY";

export const supabaseMobile = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
