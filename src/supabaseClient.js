// src/lib/supabaseClient.js
// Re-export del Supabase client único del panel.
// Objetivo: asegurar que TODO el código en /src/lib use la MISMA sesión.

export { supabase } from "../supabaseClient";
