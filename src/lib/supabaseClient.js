// src/lib/supabaseClient.js
// SHIM de compatibilidad: mantiene imports legacy apuntando al cliente real

export * from "../supabaseClient.js";
export { supabase as default, supabase } from "../supabaseClient.js";
