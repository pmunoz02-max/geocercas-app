// src/supabaseClient.js
// SHIM ÚNICO (compatibilidad)
// ✅ Fuente de verdad: ./lib/supabaseClient.js
// ❌ No crear client aquí. No logs aquí.

export * from "./lib/supabaseClient.js";
export { supabase as default, supabase } from "./lib/supabaseClient.js";
