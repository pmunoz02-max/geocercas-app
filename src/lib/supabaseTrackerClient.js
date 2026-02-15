// src/lib/supabaseTrackerClient.js
import { createClient } from "@supabase/supabase-js";

const trackerUrl = import.meta.env.VITE_SUPABASE_TRACKER_URL;
const trackerAnonKey = import.meta.env.VITE_SUPABASE_TRACKER_ANON_KEY;

if (!trackerUrl || !trackerAnonKey) {
  // eslint-disable-next-line no-console
  console.error("[supabaseTrackerClient] Missing VITE_SUPABASE_TRACKER_URL/ANON_KEY");
}

export const supabaseTracker = createClient(trackerUrl, trackerAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // CLAVE: storage separado para que NO pise la sesión del dashboard
    storageKey: "sb-tracker-auth",
  },
});
