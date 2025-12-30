// src/supabaseTrackerClient.js
import { createClient } from "@supabase/supabase-js";

const trackerUrl = import.meta.env.VITE_TRACKER_SUPABASE_URL;
const trackerAnon = import.meta.env.VITE_TRACKER_SUPABASE_ANON_KEY;

if (!trackerUrl || !trackerAnon) {
  throw new Error(
    "Faltan variables tracker Supabase: VITE_TRACKER_SUPABASE_URL / VITE_TRACKER_SUPABASE_ANON_KEY"
  );
}

export const supabaseTracker = createClient(trackerUrl, trackerAnon, {
  auth: {
    // ✅ PKCE estable
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,

    // ✅ Captura sesión desde callback
    detectSessionInUrl: true,

    // ✅ storageKey separado (tracker)
    storageKey: "sb-tugeocercas-auth-token-tracker-authB",
    storage: window.localStorage,
  },
});
