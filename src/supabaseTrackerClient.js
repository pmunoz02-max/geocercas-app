// src/supabaseTrackerClient.js
import { createClient } from "@supabase/supabase-js";

const trackerUrl = import.meta.env.VITE_TRACKER_SUPABASE_URL;
const trackerAnon = import.meta.env.VITE_TRACKER_SUPABASE_ANON_KEY;

if (!trackerUrl || !trackerAnon) {
  throw new Error("Faltan variables tracker Supabase");
}

export const supabaseTracker = createClient(trackerUrl, trackerAnon, {
  auth: {
    flowType: "pkce",              // ✅ CLAVE
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,      // ✅
    storageKey: "sb-tugeocercas-tracker-auth",
  },
});
