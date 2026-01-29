// src/pages/TrackerAuthBridge.jsx
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, ""),
  import.meta.env.VITE_SUPABASE_ANON_KEY || ""
);

export default function TrackerAuthBridge() {
  const [msg, setMsg] = useState("Inicializando...");

  useEffect(() => {
    (async () => {
      try {
        if (!import.meta.env.VITE_SUPABASE_URL) {
          setMsg("Falta VITE_SUPABASE_URL.");
          return;
        }
        if (!import.meta.env.VITE_SUPABASE_ANON_KEY) {
          setMsg("Falta VITE_SUPABASE_ANON_KEY.");
          return;
        }

        setMsg("Leyendo sesión...");

        const res = await fetch("/api/auth/session", { credentials: "include" });
        const s = await res.json().catch(() => ({}));

        const email = s?.user?.email || s?.email || s?.profile?.email || "";
        if (!email) {
          setMsg("No se encontró email en la sesión.");
          return;
        }

        const nextParam = new URLSearchParams(window.location.search).get("next");
        const next = nextParam ? decodeURIComponent(nextParam) : "/tracker-gps";

        setMsg("Solicitando login Supabase (OTP)...");

        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: `${window.location.origin}${next}`,
          },
        });

        if (error) {
          setMsg(`Error OTP: ${error.message}`);
          return;
        }

        setMsg("Listo. Revisa tu correo para el enlace de acceso.");
      } catch (e) {
        setMsg(`Error: ${String(e?.message || e)}`);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full bg-white border rounded-xl p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Autenticando tracker…</h2>
        <p className="text-sm text-gray-700">{msg}</p>
        <p className="text-xs text-gray-500 mt-3">
          Si no llega el correo, revisa SPAM/Promociones.
        </p>
      </div>
    </div>
  );
}
