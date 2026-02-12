// src/pages/supabaseClient.js
// DEPRECATED shim (pages). Mantener por compatibilidad.
// ❌ No crear client aquí. No logs aquí.
// ✅ Fuente única: src/lib/supabaseClient.js

export * from "../lib/supabaseClient.js";
export { supabase as default, supabase } from "../lib/supabaseClient.js";
