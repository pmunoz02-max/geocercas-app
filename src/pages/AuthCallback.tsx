import React, { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import { supabaseTracker } from "@/supabaseTrackerClient";

function isTrackerHost() {
  const h = String(window.location.hostname || "").toLowerCase().trim();
  return h === "tracker.tugeocercas.com" || h.startsWith("tracker.");
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string) {
  let t: any;
  const timeout = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error(`Timeout en ${label}`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

function cleanUrlKeepPath() {
  try {
    const clean = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, document.title, clean);
  } catch {}
}

export default function AuthCallback() {
  const [status, setStatus] = useState("Procesando Magic Link...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setError(null);
        const tracker = isTrackerHost();
        const client = tracker ? supabaseTracker : supabase;

        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (!code) {
          throw new Error(
            "Callback sin código. Reenvía el Magic Link y ábrelo en Chrome/Safari (no preview)."
          );
        }

        setStatus("Confirmando acceso...");

        // ✅ Intercambiar code por sesión (PKCE)
        await withTimeout(client.auth.exchangeCodeForSession(code), 12000, "exchangeCodeForSession");

        setStatus("Verificando sesión...");

        const sess = await withTimeout(client.auth.getSession(), 12000, "getSession");
        const session = sess?.data?.session;

        if (!session?.user?.id) {
          throw new Error("No se pudo establecer sesión. Reintenta el Magic Link.");
        }

        if (cancelled) return;

        // Limpia el ?code=
        cleanUrlKeepPath();

        setStatus("Redirigiendo...");

        // ✅ Redirección universal por dominio
        window.location.replace(tracker ? "/tracker-gps" : "/inicio");
      } catch (e: any) {
        console.error("[AuthCallback] error:", e);
        if (cancelled) return;
        setError(e?.message || "No se pudo completar el inicio de sesión.");
        setStatus("No se pudo completar el inicio de sesión.");
        cleanUrlKeepPath();
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="border rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">App Geocercas</h1>
        <p className="text-sm text-slate-600 mt-2">{status}</p>

        {error ? (
          <div className="mt-4 text-sm text-red-600">
            {error}
            <div className="mt-3 flex gap-2">
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
        ) : null}
      </div>
    </div>
  );
}
