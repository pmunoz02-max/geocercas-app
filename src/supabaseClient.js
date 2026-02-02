// src/supabaseClient.js
// Wrapper de compatibilidad:
// - Re-exporta TODO lo que ya exporta ./lib/supabaseClient
// - Añade un default export aquí (sin exigir default en ./lib/supabaseClient)
// - Expone window.__supabase usando EL MISMO singleton que usa la app

export * from "./lib/supabaseClient";

import { supabase as supabaseApp } from "./lib/supabaseClient";

// ✅ Default export (para imports legacy que hagan: import supabase from "../supabaseClient")
export default supabaseApp;

// ✅ Addendum debug: usa el MISMO cliente (misma sesión)
if (typeof window !== "undefined") {
  window.__supabase = supabaseApp;
}
