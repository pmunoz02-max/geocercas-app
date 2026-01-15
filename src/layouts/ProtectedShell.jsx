// src/layouts/ProtectedShell.jsx
import { Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AppHeader from "../components/AppHeader.jsx";
import TopTabs from "../components/TopTabs.jsx";

/**
 * ProtectedShell — vDef
 * - NO redirige por pathname (Router manda)
 * - Tabs definidos centralmente y filtrados por rol
 * - Incluye Dashboard e Invitar tracker
 */

function buildTabs({ role, isAppRoot }) {
  const r = String(role || "").toLowerCase();

  const isTrackerOnly = r === "tracker";
  const isAdmin =
    r === "admin" || r === "owner" || r === "root" || r === "root_owner" || isAppRoot;

  if (isTrackerOnly) {
    // Tracker-only: minimal
    return [
      { path: "/tracker", labelKey: "app.tabs.tracker" },
    ];
  }

  // App normal (owner/admin/viewer/etc.)
  const tabs = [
    { path: "/inicio", labelKey: "app.tabs.home" },

    // ✅ Dashboard (si tu ruta real es otra, cámbiala aquí)
    { path: "/dashboard", labelKey: "app.tabs.dashboard" },

    { path: "/geocercas", labelKey: "app.tabs.geocercas" },
    { path: "/personal", labelKey: "app.tabs.personal" },
    { path: "/actividades", labelKey: "app.tabs.actividades" },
    { path: "/asignaciones", labelKey: "app.tabs.asignaciones" },
    { path: "/reportes", labelKey: "app.tabs.reportes" },
    { path: "/tracker", labelKey: "app.tabs.tracker" },
  ];

  // ✅ Invitar tracker: solo para admin/owner/root
  if (isAdmin) {
    tabs.push({ path: "/invitar-tracker", labelKey: "app.tabs.invitar_tracker" });
  }

  // Root-only admin panel
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
