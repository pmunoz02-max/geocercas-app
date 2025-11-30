// src/pages/AuthCallback.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const { error: exError } = await supabase.auth.exchangeCodeForSession(
          window.location.href
        );

        if (!alive) return;

        if (exError) {
          console.error("[AuthCallback] exchangeCodeForSession error:", exError);
          setError(
            "No se pudo completar el inicio de sesión. El enlace puede haber expirado."
          );
          return;
        }

        // Sesión creada correctamente → deja que AuthContext se actualice
        navigate("/inicio", { replace: true });
      } catch (e) {
        console.error("[AuthCallback] excepción:", e);
        if (!alive) return;
        setError("Ocurrió un error al procesar el enlace de acceso.");
      }
    };

    run();

    return () => {
      alive = false;
    };
  }, [navigate]);

  if (!error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-700">
          Procesando tu enlace de acceso…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="max-w-sm w-full px-4 py-5 rounded-xl bg-white border border-red-200 shadow-sm text-sm text-slate-800">
        <h1 className="text-lg font-semibold mb-2 text-red-700">
          Error al iniciar sesión
        </h1>
        <p className="mb-3 whitespace-pre-line">{error}</p>
        <button
          onClick={() => navigate("/login", { replace: true })}
          className="mt-1 inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Ir al inicio de sesión
        </button>
      </div>
    </div>
  );
}
