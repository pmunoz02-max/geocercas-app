// src/lib/supabaseClient.js
// Re-export del Supabase client único del panel.
// Objetivo: que TODO /src/lib use la MISMA sesión del panel.

export { supabase } from "../supabaseClient";
