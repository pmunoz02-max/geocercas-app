
import { useEffect } from "react";
import { supabase } from "../lib/supabaseClient.js";

export default function Logout() {
  useEffect(() => {
    async function doLogout() {
      try {
        await supabase.auth.signOut();
      } catch {}
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}
      window.location.replace("/login?mode=magic");
    }
    doLogout();
  }, []);

  return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <h1>Cerrando sesión…</h1>
      <p>Por favor espera…</p>
    </div>
  );
}
