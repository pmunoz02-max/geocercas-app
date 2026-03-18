// src/supabaseTrackerClient.js
// Cliente Supabase para el flujo Tracker.
// Regla de oro: un solo cliente Supabase reutilizado en toda la app.

import { supabaseTracker } from "./lib/supabaseTrackerClient.js";

// Nombre esperado por TrackerGpsPage.jsx
export { supabaseTracker };

// Export estándar (por si otros módulos lo usan)
export default supabaseTracker;

// Compat: mantener un nombre "supabase" pero apuntando al cliente tracker aislado.
export const supabase = supabaseTracker;
