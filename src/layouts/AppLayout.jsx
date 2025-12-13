import React from "react";
import { Outlet } from "react-router-dom";
import TopTabs from "@/components/TopTabs";
import { useAuth } from "@/context/AuthContext";

export default function AppLayout() {
  const { session, loading } = useAuth();

  // 1️⃣ Sin sesión → rutas públicas (login, landing, etc.)
  if (!session) {
    return <Outlet />;
  }

  // 2️⃣ Con sesión pero AuthContext cargando
  // 👉 NO renderizar tabs todavía (evita overlays invisibles)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          Cargando organización y permisos…
        </div>
      </div>
    );
  }

  // 3️⃣ Sesión lista + contexto cargado → UI normal
  const tabs = [
    { path: "/inicio", labelKey: "app.tabs.inicio", icon: "🏠" },
    { path: "/geocercas", labelKey: "app.tabs.geocercas", icon: "📍" },
    { path: "/personal", labelKey: "app.tabs.personal", icon: "👥" },
    { path: "/actividades", labelKey: "app.tabs.actividades", icon: "🗂️" },
    { path: "/asignaciones", labelKey: "app.tabs.asignaciones", icon: "📌" },
    { path: "/reportes", labelKey: "app.tabs.reportes", icon: "📊" },
    { path: "/costos", labelKey: "app.tabs.dashboard", icon: "💰" },
    { path: "/tracker", labelKey: "app.tabs.tracker", icon: "📡" },
    { path: "/admin", labelKey: "app.tabs.admin", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <TopTabs tabs={tabs} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
