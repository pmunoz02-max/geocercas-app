// src/supabase/supabaseClient.js
// Re-export TOTAL del Supabase client único.
// Evita duplicación de sesión y errores de build.

export * from "../supabaseClient.js";
export { supabase } from "../supabaseClient.js";
