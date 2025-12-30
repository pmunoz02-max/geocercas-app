// src/pages/AuthCallback.tsx
import { useEffect } from "react";
import { supabase } from "@/supabaseClient";
import { supabaseTracker } from "@/supabaseTrackerClient";

function isTrackerHost() {
  const h = window.location.hostname.toLowerCase();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

export default function AuthCallback() {
  useEffect(() => {
    const run = async () => {
      const client = isTrackerHost() ? supabaseTracker : supabase;

      const { data, error } = await client.auth.getSession();

      if (error || !data?.session) {
        console.error("AuthCallback error:", error);
        window.location.replace("/login");
        return;
      }

      // Redirección universal
      window.location.replace(
        isTrackerHost() ? "/tracker-gps" : "/inicio"
      );
    };

    run();
  }, []);

  return (
    <div style={{ padding: 40 }}>
      <h2>App Geocercas</h2>
      <p>Estableciendo sesión…</p>
    </div>
  );
}
