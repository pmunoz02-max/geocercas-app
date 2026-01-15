// src/layouts/ProtectedShell.jsx
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AppHeader from "../components/AppHeader.jsx";
import TopTabs from "../components/TopTabs.jsx";

/**
 * ProtectedShell — DEFINITIVO
 *
 * Reglas:
 * - NO redirige por pathname
 * - NO usa navigate()
 * - El Router decide las rutas
 * - El Shell solo muestra UI según rol
 */

export default function ProtectedShell() {
  const { loading, user, currentRole, isAppRoot } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) return null;

  // Tabs visibles según rol (UI only)
  const tabs = (() => {
    if (currentRole === "tracker") {
      return [
        { path: "/tracker", labelKey: "app.tabs.tracker" },
      ];
    }

    return [
      { path: "/inicio", labelKey: "app.tabs.home" },
      { path: "/geocercas", labelKey: "app.tabs.geocercas" },
      { path: "/personal", labelKey: "app.tabs.personal" },
      { path: "/actividades", labelKey: "app.tabs.actividades" },
      { path: "/asignaciones", labelKey: "app.tabs.asignaciones" },
      { path: "/reportes", labelKey: "app.tabs.reportes" },
      { path: "/tracker", labelKey: "app.tabs.tracker" },
      ...(isAppRoot ? [{ path: "/admins", labelKey: "app.tabs.admins" }] : []),
    ];
  })();

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <TopTabs tabs={tabs} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
