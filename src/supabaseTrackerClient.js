// src/supabaseTrackerClient.js
// ⚠️ Este archivo existe SOLO por compatibilidad.
// El tracker usa el MISMO cliente Supabase que el resto de la app.
// NO hay segundo proyecto Supabase.
// NO hay VITE_TRACKER_*
// NO hay throw (nunca más pantalla blanca)

import { supabase } from "../supabaseClient.js";
/**
 * Alias de compatibilidad histórica.
 * Cualquier código que importe `supabaseTracker`
 * recibirá el cliente Supabase único del proyecto.
 */
export const supabaseTracker = supabase;

export default supabaseTracker;
