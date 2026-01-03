// src/supabaseTrackerClient.js
// Cliente Supabase para el flujo Tracker.
// Regla de oro: un solo cliente Supabase reutilizado en toda la app.

import { supabase } from "./supabaseClient.js";

// Nombre esperado por TrackerGpsPage.jsx
export const supabaseTracker = supabase;

// Export estándar (por si otros módulos lo usan)
export { supabase };

// Default export (opcional, pero útil para compatibilidad)
export default supabase;
