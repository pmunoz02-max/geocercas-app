// src/pages/Dashboard.jsx
import { useMemo } from "react";
import { Link } from "react-router-dom";           // 👈 importa Link
import WelcomeBanner from "../components/WelcomeBanner";
import { useUserProfile } from "../hooks/useUserProfile";

export default function Dashboard() {
  const { profile, loading } = useUserProfile();
  const isAdmin = useMemo(() => profile?.rol === "admin", [profile]);
  const isTracker = useMemo(() => profile?.rol === "tracker", [profile]);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <WelcomeBanner />
      </div>

      <main className="max-w-6xl mx-auto px-4 pb-10">
        {loading ? (
          <section className="rounded-xl border p-6">
            <p>Cargando panel…</p>
          </section>
        ) : (
          <>
            <section className="rounded-xl border p-6 mb-6">
              <h2 className="text-lg font-semibold mb-2">Acceso general</h2>
              <p className="text-sm text-gray-600">
                Bienvenido al panel principal. Aquí puedes ver accesos rápidos y estado general.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link className="text-sm border rounded px-3 py-2 hover:bg-gray-50" to="/whoami">
                  Diagnóstico (WhoAmI)
                </Link>
                <Link className="text-sm border rounded px-3 py-2 hover:bg-gray-50" to="/mapa">
                  Ir al Mapa
                </Link>
              </div>
            </section>

            {isAdmin && (
              <section className="rounded-xl border p-6 mb-6">
                <h2 className="text-lg font-semibold mb-2">Herramientas de administrador</h2>
                <ul className="list-disc pl-5 text-sm leading-6">
                  <li>
                    Gestión de usuarios y roles &nbsp;
                    <Link className="underline" to="/admin/usuarios">Abrir</Link>
                  </li>
                  <li>
                    Políticas y auditoría &nbsp;
                    <Link className="underline" to="/admin/politicas">Abrir</Link>
                  </li>
                  <li>
                    Reportes y descargas &nbsp;
                    <Link className="underline" to="/admin/reportes">Abrir</Link>
                  </li>
                </ul>
              </section>
            )}

            {isTracker && (
              <section className="rounded-xl border p-6 mb-6">
                <h2 className="text-lg font-semibold mb-2">Acciones del tracker</h2>
                <div className="flex flex-wrap gap-3">
                  <Link className="text-sm border rounded px-3 py-2 hover:bg-gray-50" to="/tracker/enviar-ubicacion">
                    Enviar ubicación
                  </Link>
                  <Link className="text-sm border rounded px-3 py-2 hover:bg-gray-50" to="/tracker/historial">
                    Ver historial
                  </Link>
                </div>
              </section>
            )}

            {!isAdmin && !isTracker && (
              <section className="rounded-xl border p-6">
                <h2 className="text-lg font-semibold mb-2">Tu cuenta aún no tiene rol</h2>
                <p className="text-sm text-gray-600">
                  Contacta al administrador para que te asigne permisos. Si ya lo hizo, pulsa “Refrescar”
                  en el banner superior o cierra sesión y vuelve a entrar.
                </p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
