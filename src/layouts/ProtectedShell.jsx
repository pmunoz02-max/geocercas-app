// src/layouts/ProtectedShell.jsx
import { Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AppHeader from "../components/AppHeader.jsx";
import TopTabs from "../components/TopTabs.jsx";

/**
 * ProtectedShell — vFinal (i18n normalizado)
 * - Router decide navegación
 * - Shell solo muestra UI
 * - Orden lógico de módulos
 *
 * Nota i18n:
 * - Usar keys canónicas existentes en JSON: app.tabs.inicio, app.tabs.invitarTracker
 * - Mantenemos compatibilidad en JSON con alias: app.tabs.home, app.tabs.invitar_tracker
 */

function buildTabs({ role, isAppRoot }) {
  const r = String(role || "").toLowerCase();

  const isTrackerOnly = r === "tracker";
  const isAdmin =
    r === "admin" ||
    r === "owner" ||
    r === "root" ||
    r === "root_owner" ||
    isAppRoot;

  // Tracker-only
  if (isTrackerOnly) {
    return [{ path: "/tracker", labelKey: "app.tabs.tracker" }];
  }

  const tabs = [
    // ✅ key canónica (en tus JSON existe "inicio")
    { path: "/inicio", labelKey: "app.tabs.inicio" },

    { path: "/geocercas", labelKey: "app.tabs.geocercas" },
    { path: "/personal", labelKey: "app.tabs.personal" },
    { path: "/actividades", labelKey: "app.tabs.actividades" },
    { path: "/asignaciones", labelKey: "app.tabs.asignaciones" },

    // 🔹 Reportes y su Dashboard juntos
    { path: "/reportes", labelKey: "app.tabs.reportes" },
    { path: "/dashboard", labelKey: "app.tabs.dashboard" },

    { path: "/tracker", labelKey: "app.tabs.tracker" },
  ];

  if (isAdmin) {
    // ✅ key canónica (en tus JSON existe "invitarTracker")
    tabs.push({ path: "/invitar-tracker", labelKey: "app.tabs.invitarTracker" });
  }

  if (isAppRoot) {
    tabs.push({ path: "/admins", labelKey: "app.tabs.admins" });
  }

  return tabs;
}

export default function ProtectedShell() {
  const { loading, user, currentRole, isAppRoot } = useAuth();

  if (loading) return null;
  if (!user) return null;

  const tabs = buildTabs({ role: currentRole, isAppRoot });

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
