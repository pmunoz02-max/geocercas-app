// src/supabaseTrackerClient.js
// Cliente Supabase para el flujo Tracker.
// Regla de oro: 1 solo entrypoint (reutiliza el cliente unificado).

import { supabase } from "./supabaseClient.js";

// Export nombrado esperado por TrackerGpsPage.jsx
export const supabaseTracker = supabase;

// Export opcional por compatibilidad con otros imports
export { supabase };

// Default export (por si alguna parte lo usa así)
export default supabase;
