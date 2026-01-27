// src/pages/TrackerGpsPage.jsx
import { useEffect, useState } from "react";

export default function TrackerGpsPage() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;

    async function loadSession() {
      try {
        const res = await fetch("/api/auth/session", {
          credentials: "include",
        });

        const json = await res.json();

        if (!alive) return;

        setSession(json);

        if (!json?.authenticated) {
          setError("No autenticado");
          return;
        }

        const role = String(json?.role || "").toLowerCase();

        if (role !== "tracker") {
          setError(`Rol inválido para tracker-gps: ${role || "(vacío)"}`);
          return;
        }

        // 👉 AQUÍ más adelante arrancas GPS / watchPosition
        // Por ahora solo validamos correctamente
      } catch (e) {
        if (!alive) return;
        setError(e.message || "Error cargando sesión");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadSession();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Cargando tracker…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full bg-white border rounded-xl p-6 shadow">
          <h2 className="text-lg font-semibold text-red-600 mb-3">
            Acceso restringido
          </h2>

          <p className="text-sm text-gray-700 mb-4">{error}</p>

          <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto">
{JSON.stringify(session, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  // ✅ Tracker válido
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6">
        <h1 className="text-lg font-semibold text-emerald-700">
          Tracker activo
        </h1>
        <p className="text-sm text-emerald-700 mt-2">
          La transmisión GPS puede iniciar automáticamente.
        </p>
      </div>
    </div>
  );
}
