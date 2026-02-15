// src/lib/supabaseTrackerClient.js
import { createClient } from "@supabase/supabase-js";

const trackerUrl = import.meta.env.VITE_SUPABASE_TRACKER_URL;
const trackerAnonKey = import.meta.env.VITE_SUPABASE_TRACKER_ANON_KEY;

/**
 * UNIVERSAL/PERMANENTE:
 * - No romper la app si faltan envs del tracker en Preview/Prod.
 * - Exportar null y que las páginas del tracker lo manejen.
 */
export const supabaseTracker =
  trackerUrl && trackerAnonKey
    ? createClient(trackerUrl, trackerAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "sb-tracker-auth",
        },
      })
    : null;

if (!trackerUrl || !trackerAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabaseTrackerClient] Tracker env missing. Set VITE_SUPABASE_TRACKER_URL and VITE_SUPABASE_TRACKER_ANON_KEY in Vercel."
  );
}
