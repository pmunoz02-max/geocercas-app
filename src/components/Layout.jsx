// src/components/Layout.jsx
import { Outlet, Link } from "react-router-dom";
import MainNav from "@/components/MainNav";
import { useAuth } from "../context/AuthContext.jsx";

export default function Layout() {
  const { user, loading, currentOrg, currentRole, isAppRoot } = useAuth();

  const roleLabel = isAppRoot
    ? "ROOT"
    : currentRole
    ? String(currentRole).toUpperCase()
    : "SIN ROL";

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* NAVBAR SUPERIOR */}
      <header className="sticky top-0 z-50 border-b bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/inicio" className="font-semibold text-lg whitespace-nowrap">
            🛰️ App Geocercas
          </Link>

          {/* CONTEXTO + NAV */}
          {!loading && user ? (
            <div className="flex items-center gap-4">
              {/* Org + Rol */}
              <div className="hidden sm:flex flex-col text-right text-xs px-2 py-1 rounded bg-gray-100">
                <span className="font-medium text-gray-800">
                  {currentOrg?.name ?? "Sin organización"}
                </span>
                <span className="text-gray-600">{roleLabel}</span>
              </div>

              {/* Menú según rol (si tu MainNav lo usa) */}
              <MainNav role={isAppRoot ? "root" : currentRole} />
            </div>
          ) : (
            <div className="text-sm text-slate-600">No autenticado</div>
          )}
        </div>
      </header>

      {/* CONTENIDO */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>

      {/* FOOTER */}
      <footer className="border-t text-xs text-slate-600 text-center py-3 bg-white">
        © {new Date().getFullYear()} App Geocercas — Todos los derechos reservados.
      </footer>
    </div>
  );
}
