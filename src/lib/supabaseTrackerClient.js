// src/lib/supabaseTrackerClient.js
import { createClient } from "@supabase/supabase-js";

/**
 * Permanente:
 * - Si existe config TRACKER (Project B), úsala.
 * - Si NO existe, usa el proyecto APP (Project A) pero con storageKey separado.
 *   Esto evita: blank screens + JWT mismatch + pisado de sesión del dashboard.
 */
const appUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const appAnon = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

const trackerUrl = (import.meta.env.VITE_SUPABASE_TRACKER_URL || "").trim();
const trackerAnon = (import.meta.env.VITE_SUPABASE_TRACKER_ANON_KEY || "").trim();

const url = trackerUrl || appUrl;
const anon = trackerAnon || appAnon;

export const supabaseTracker =
  url && anon
    ? createClient(url, anon, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "sb-tracker-auth",
        },
      })
    : null;

if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabaseTrackerClient] Missing Supabase config. Need VITE_SUPABASE_URL/ANON_KEY (or TRACKER_*)"
  );
} else {
  // eslint-disable-next-line no-console
  console.log("[supabaseTrackerClient] tracker client ready:", url);
}
