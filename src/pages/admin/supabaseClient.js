// src/pages/admin/supabaseClient.js
// Shim DEPRECATED (admin). Mantener por compatibilidad.
// ❌ No crear client aquí. No logs aquí.
// ✅ Fuente única: src/lib/supabaseClient.js

export * from "../../lib/supabaseClient.js";
export { supabase as default, supabase } from "../../lib/supabaseClient.js";
