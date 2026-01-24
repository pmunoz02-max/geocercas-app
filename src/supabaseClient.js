// src/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

export * from "./lib/supabaseClient";
export { default } from "./lib/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function requireEnv(name, value) {
  if (!value || typeof value !== "string" || !value.trim()) {
    throw new Error(
      `[supabaseClient] Missing ${name}. Revisa Vercel Env Vars (Production/Preview) y redeploy.`
    );
  }
}

requireEnv("VITE_SUPABASE_URL", SUPABASE_URL);
requireEnv("VITE_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);

export const supabaseRecovery = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "tg_recovery_auth",
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
