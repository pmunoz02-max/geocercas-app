// src/pages/Dashboard.jsx
import { useMemo } from "react";
import { Link } from "react-router-dom";
import WelcomeBanner from "../components/WelcomeBanner";
import { useAuth } from "@/context/auth.js";

function roleRank(r) {
  const s = String(r || "").toLowerCase();
  if (s === "owner") return 4;
  if (s === "admin") return 3;
  if (s === "viewer") return 2;
  if (s === "tracker") return 1;
  if (s === "member") return 0;
  return -1;
}

export default function Dashboard() {
  const { authReady, orgsReady, currentOrg, bestRole, currentRole, trackerDomain } = useAuth();

  const effectiveRole = useMemo(() => {
    const a = String(currentRole || "").toLowerCase();
    const b = String(bestRole || "").toLowerCase();
    if (roleRank(a) >= roleRank(b)) return a || b || null;
    return b || a || null;
  }, [bestRole, currentRole]);

  const isAdmin = effectiveRole === "admin" || effectiveRole === "owner";
  const isTracker = trackerDomain || effectiveRole === "tracker";

  // âœ… Loading correcto del contexto
  if (!authReady || !orgsReady) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <section className="rounded-xl border p-6">
            <p className="text-sm text-gray-600">Cargando tu sesiÃ³n y organizaciÃ³n actualâ€¦</p>
          </section>
        </div>
      </div>
    );
  }

  // Tracker-only domain: no exige org
  if (isTracker && !currentOrg) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <WelcomeBanner />
          <main className="mt-6">
            <section className="rounded-xl border p-6 mb-6">
              <h2 className="text-lg font-semibold mb-2">Acciones del tracker</h2>
              <div className="flex flex-wrap gap-3">
                <Link className="text-sm border rounded px-3 py-2 hover:bg-gray-50" to="/tracker/enviar-ubicacion">
                  Enviar ubicaciÃ³n
                </Link>
                <Link className="text-sm border rounded px-3 py-2 hover:bg-gray-50" to="/tracker/historial">
                  Ver historial
                </Link>
              </div>
            </section>
          </main>
        </div>
      </div>
    );
  }

  // Panel normal: aquÃ­ sÃ­ exigimos org (caso real)
  if (!currentOrg) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <WelcomeBanner />
          <main className="mt-6">
            <section className="rounded-xl border border-red-200 bg-red-50 p-6">
              <h2 className="text-lg font-semibold mb-2 text-red-700">No hay organizaciÃ³n activa</h2>
              <p className="text-sm text-red-700">
                Tu usuario no tiene una organizaciÃ³n asignada. Contacta al administrador o vuelve a iniciar sesiÃ³n.
              </p>
            </section>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <WelcomeBanner />

        <div className="mt-2 text-xs text-gray-500">
          OrganizaciÃ³n actual: <span className="font-medium">{currentOrg?.name || currentOrg?.id}</span>
          {effectiveRole ? (
            <>
              {" "}Â· Rol: <span className="font-medium">{effectiveRole.toUpperCase()}</span>
            </>
          ) : null}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 pb-10">
        <section className="rounded-xl border p-6 mb-6">
          <h2 className="text-lg font-semibold mb-2">Acceso general</h2>
          <p className="text-sm text-gray-600">
            Bienvenido al panel principal. AquÃ­ tienes accesos rÃ¡pidos y diagnÃ³stico.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link className="text-sm border rounded px-3 py-2 hover:bg-gray-50" to="/whoami">
              DiagnÃ³stico (WhoAmI)
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
                GestiÃ³n de usuarios y roles &nbsp;
                <Link className="underline" to="/admin/usuarios">Abrir</Link>
              </li>
              <li>
                PolÃ­ticas y auditorÃ­a &nbsp;
                <Link className="underline" to="/admin/politicas">Abrir</Link>
              </li>
              <li>
                Reportes y descargas &nbsp;
                <Link className="underline" to="/admin/reportes">Abrir</Link>
              </li>
            </ul>
          </section>
        )}

        {!isAdmin && (
          <section className="rounded-xl border p-6">
            <h2 className="text-lg font-semibold mb-2">Tu acceso</h2>
            <p className="text-sm text-gray-600">
              Tu rol actual es <span className="font-medium">{effectiveRole ? effectiveRole.toUpperCase() : "SIN ROL"}</span>.
              Si necesitas acceso a mÃ³dulos adicionales, contacta al administrador de tu organizaciÃ³n.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

