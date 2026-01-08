// src/components/Layout.jsx
import { Outlet } from "react-router-dom";
import MainNav from "@/components/MainNav";
import { useAuth } from "@/context/AuthProvider";

export default function Layout() {
  const { session, profile } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* NAVBAR SUPERIOR */}
      <header className="sticky top-0 z-50 border-b bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="font-semibold text-lg whitespace-nowrap">
            🛰️ App Geocercas
          </div>

          {session && profile ? (
            <MainNav role={profile.role} />
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
