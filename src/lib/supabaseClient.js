// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

// ✅ Canónico Vite: sin optional chaining
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function assertEnv(name, value) {
  if (!value || typeof value !== "string" || !value.trim()) {
    throw new Error(
      `[supabaseClient] Missing ${name}. Check Vercel env vars (VITE_*) and redeploy.`
    );
  }
}

assertEnv("VITE_SUPABASE_URL", supabaseUrl);
assertEnv("VITE_SUPABASE_ANON_KEY", supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});

export default supabase;
