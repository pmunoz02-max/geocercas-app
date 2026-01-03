// src/supabaseTrackerClient.js
// Cliente Supabase para el flujo Tracker.
// IMPORTANTE: este archivo asume que supabaseClient.js está en /src/supabaseClient.js

import { supabase } from "./supabaseClient.js";

// En caso de que en el futuro quieras un cliente separado para Tracker,
// aquí es donde lo harías. Por ahora, reutilizamos el cliente único (regla de oro).
export default supabase;
export { supabase };