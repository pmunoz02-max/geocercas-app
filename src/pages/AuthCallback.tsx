import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);

  useEffect(() => {
    async function run() {
      try {
        // 1) Intercambiar el code/token por sesión
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error) throw error;

        // 2) Leer parámetros
        const params = new URLSearchParams(location.search);
        const next = params.get("next") || "/";
        const orgId = params.get("org_id");

        // 3) Redirigir
        if (orgId) {
          navigate(`${next}?org_id=${encodeURIComponent(orgId)}`, { replace: true });
        } else {
          navigate(next, { replace: true });
        }
      } catch (e) {
        console.error("AuthCallback error:", e);
        setError("Error autenticando el link. Ábrelo nuevamente.");
      }
    }

    run();
  }, [navigate, location.search]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="p-6 bg-white rounded-xl shadow max-w-md w-full text-center">
        <h2 className="text-lg font-semibold mb-2">Autenticando…</h2>
        {error ? (
          <div className="text-red-600 text-sm">{error}</div>
        ) : (
          <div className="text-sm text-gray-600">
            Validando acceso, por favor espera…
          </div>
        )}
      </div>
    </div>
  );
}
