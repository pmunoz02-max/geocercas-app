// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

function normUrl(u) {
  return String(u || "").trim().replace(/\/$/, "");
}

const RAW_SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const RAW_SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY_PUBLIC ||
  import.meta.env.SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export const SUPABASE_URL = normUrl(RAW_SUPABASE_URL);
export const SUPABASE_ANON_KEY = String(RAW_SUPABASE_ANON_KEY || "").trim();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "[supabaseClient] Faltan SUPABASE_URL / SUPABASE_ANON_KEY. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY."
  );
}

const storage =
  typeof window !== "undefined" && window.localStorage ? window.localStorage : undefined;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage,
  },
});

// ✅ Debug ONLY (no rompe build; corre solo en browser)
if (typeof window !== "undefined") {
  window.__supabase__ = supabase;
}
