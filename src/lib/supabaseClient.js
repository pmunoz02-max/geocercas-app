// src/lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

// Estas variables deben estar definidas en tu .env.local / .env.production
// VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY ya las usabas en el proyecto.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[supabaseClient] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en las variables de entorno."
  );
}

// Cliente principal de Supabase para el frontend
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Exponer en window para poder depurar desde la consola del navegador
if (typeof window !== "undefined") {
  // No pisa nada si ya existe (por hot reload)
  if (!window.supabase) {
    window.supabase = supabase;
  }
}

// Export default para compatibilidad con imports existentes
export default supabase;
