// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

// ⚠️ IMPORTANTE:
// Reemplaza estas constantes con los mismos valores que usas en tu app web
// (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY)
const SUPABASE_URL = "https://tugeocercas.com/login";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwYWl4a3Zva2RrdWR5bWdqb3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwODMyMzYsImV4cCI6MjA3NTY1OTIzNn0.kx3OyK2T1aXhaUFD798ekw_Il-QvdFgC1OqUBE5FGIY";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "[supabase] Faltan SUPABASE_URL o SUPABASE_ANON_KEY. Revisa src/lib/supabase.ts"
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
