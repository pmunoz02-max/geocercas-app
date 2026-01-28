// src/lib/supabaseClient.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ✅ Vite env vars (prefer these)
const url =
  (import.meta as any).env?.VITE_SUPABASE_URL ||
  (import.meta as any).env?.VITE_PUBLIC_SUPABASE_URL ||
  (import.meta as any).env?.SUPABASE_URL;

const anonKey =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  (import.meta as any).env?.VITE_PUBLIC_SUPABASE_ANON_KEY ||
  (import.meta as any).env?.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Throwing here makes misconfig obvious in dev/build logs
  throw new Error(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // localStorage is default in browsers; keep explicit for clarity
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
