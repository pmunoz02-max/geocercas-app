import React from "react";
import { Outlet } from "react-router-dom";
import TopTabs from "@/components/TopTabs";
import { useAuth } from "@/context/AuthContext";

export default function AppLayout() {
  const { session } = useAuth();

  // ⚠️ IMPORTANTE:
  // Tabs solo cuando hay sesión
  if (!session) {
    return <Outlet />;
  }

  const tabs = [
    { path: "/inicio", labelKey: "app.tabs.inicio", icon: "🏠" },
    { path: "/geocercas", labelKey: "app.tabs.geocercas", icon: "📍" },
    { path: "/personal", labelKey: "app.tabs.personal", icon: "👥" },
    { path: "/actividades", labelKey: "app.tabs.actividades", icon: "🗂️" },
    { path: "/asignaciones", labelKey: "app.tabs.asignaciones", icon: "📌" },
    { path: "/reportes", labelKey: "app.tabs.reportes", icon: "📊" },
    { path: "/costos", labelKey: "app.tabs.dashboard", icon: "💰" },
    { path: "/tracker", labelKey: "app.tabs.tracker", icon: "📡" },
    { path: "/admin", labelKey: "app.tabs.admin", icon: "⚙️" }
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
