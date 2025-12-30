import React, { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { supabaseTracker } from "@/supabaseTrackerClient";

function isTrackerHost() {
  const h = window.location.hostname.toLowerCase();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

export default function AuthCallback() {
  const [msg, setMsg] = useState("Procesando Magic Link...");

  useEffect(() => {
    const run = async () => {
      const tracker = isTrackerHost();
      const client = tracker ? supabaseTracker : supabase;

      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        // ✅ PKCE: intercambiar code por sesión
        if (code) {
          setMsg("Confirmando acceso...");
          const { error } = await client.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // Confirmar sesión
        setMsg("Verificando sesión...");
        const { data, error: sessErr } = await client.auth.getSession();
        if (sessErr) throw sessErr;

        if (!data?.session?.user?.id) {
          throw new Error(
            "No se pudo establecer sesión. Abre el link en Chrome/Safari (no preview)."
          );
        }

        // Limpia la URL (quita ?code=...)
        try {
          const clean = `${window.location.origin}${window.location.pathname}`;
          window.history.replaceState({}, document.title, clean);
        } catch {}

        // ✅ Redirección universal por dominio
        window.location.replace(tracker ? "/tracker-gps" : "/inicio");
      } catch (e: any) {
        console.error("[AuthCallback] error:", e);
        setMsg(
          e?.message ||
            "No se pudo completar el inicio de sesión. Reintenta el Magic Link."
        );
      }
    };

    run();
  }, []);

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="border rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">App Geocercas</h1>
        <p className="text-sm text-slate-600 mt-2">{msg}</p>

        <div className="mt-4 flex gap-2">
          <button
            className="border rounded px-3 py-2 text-xs"
            onClick={() => window.location.replace("/login")}
          >
            Ir a Login
          </button>
          <button
            className="border rounded px-3 py-2 text-xs"
            onClick={() => window.location.reload()}
          >
            Reintentar
          </button>
        </div>
      </div>
    </div>
  );
}
