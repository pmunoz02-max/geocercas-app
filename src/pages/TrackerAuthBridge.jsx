import { useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export default function TrackerAuthBridge() {
  useEffect(() => {
    (async () => {
      // obtenemos sesión Next
      const res = await fetch("/api/auth/session", { credentials: "include" });
      const s = await res.json();

      const email =
        s?.user?.email ||
        s?.email ||
        s?.profile?.email;

      if (!email) {
        document.body.innerText = "No email in session";
        return;
      }

      // login silencioso Supabase (OTP)
      await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/tracker-gps`,
        },
      });

      document.body.innerText =
        "Validando acceso… revisa el enlace automático.";
    })();
  }, []);

  return null;
}
