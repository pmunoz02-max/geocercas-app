// src/supabaseClient.js
// Objetivo: mantener compatibilidad con imports antiguos
// y exponer (solo para debug) EL MISMO cliente supabase que usa la app.

export * from "./lib/supabaseClient";
export { default } from "./lib/supabaseClient";

// ✅ IMPORTANTE: usamos el singleton real de la app (NO creamos otro createClient)
import supabaseDefault, { supabase as supabaseNamed } from "./lib/supabaseClient";

// Resolución robusta: si tu lib exporta default o named, tomamos el que exista.
const supabaseApp = supabaseNamed || supabaseDefault;

// =========================================================
// 🔧 ADDENDUM DEBUG (CONTROLADO)
// =========================================================
// Ahora window.__supabase tendrá la sesión real del usuario (auth.uid() ya no será null)
if (typeof window !== "undefined") {
  window.__supabase = supabaseApp;
}
