// src/components/Layout.jsx
import { Outlet } from "react-router-dom";
import MainNav from "@/components/MainNav";
import { useAuth } from "@/context/AuthProvider";

export default function Layout() {
  const { session, profile } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* NAVBAR SUPERIOR */}
      <header className="border-b bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="font-semibold text-lg">🛰️ App Geocercas</div>
          {session && profile ? (
            <MainNav role={profile.role} />
          ) : (
            <div className="text-sm opacity-70">No autenticado</div>
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
      <footer className="border-t text-xs opacity-70 text-center py-3">
        © {new Date().getFullYear()} App Geocercas — Todos los derechos reservados.
      </footer>
    </div>
  );
}
