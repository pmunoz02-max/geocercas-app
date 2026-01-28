// src/layouts/ProtectedShell.jsx
import { Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AppHeader from "../components/AppHeader.jsx";
import TopTabs from "../components/TopTabs.jsx";

/**
 * ProtectedShell — Tabs
 * - Tab "Geocerca" abre el MAPA (ruta /geocerca)
 * - La pantalla hub/listado queda en /geocercas (sin tab)
 */

function buildTabs({ role }) {
  const r = String(role || "").toLowerCase();

  const isTrackerOnly = r === "tracker";
  const isAdmin =
    r === "admin" ||
    r === "owner" ||
    r === "root" ||
    r === "root_owner";

  if (isTrackerOnly) {
    return [{ path: "/tracker", labelKey: "app.tabs.tracker" }];
  }

  const tabs = [
    { path: "/inicio", labelKey: "app.tabs.inicio" },

    // ✅ MAPA / CONSTRUCTOR
    { path: "/geocerca", labelKey: "app.tabs.geocerca" },

    { path: "/personal", labelKey: "app.tabs.personal" },
    { path: "/actividades", labelKey: "app.tabs.actividades" },
    { path: "/asignaciones", labelKey: "app.tabs.asignaciones" },
    { path: "/reportes", labelKey: "app.tabs.reportes" },
    { path: "/dashboard", labelKey: "app.tabs.dashboard" },
    { path: "/tracker", labelKey: "app.tabs.tracker" },
  ];

  if (isAdmin) {
    tabs.push({ path: "/invitar-tracker", labelKey: "app.tabs.invitarTracker" });
  }

  // Root (app-level) puede ver /admins si tu App.jsx lo permite por AdminRoute.
  if (r === "root" || r === "root_owner") {
    tabs.push({ path: "/admins", labelKey: "app.tabs.admins" });
  }

  return tabs;
}

export default function ProtectedShell() {
  const { loading, user, role } = useAuth();

  if (loading) return null;
  if (!user) return null;

  const tabs = buildTabs({ role });

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
