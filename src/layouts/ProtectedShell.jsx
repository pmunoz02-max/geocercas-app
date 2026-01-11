// src/layouts/ProtectedShell.jsx
import React, { useEffect, useMemo } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AppHeader from "../components/AppHeader.jsx";
import TopTabs from "../components/TopTabs.jsx";

export default function ProtectedShell() {
  const { loading, user, currentRole, isAppRoot } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const role = String(currentRole || "").toLowerCase();
  const path = location.pathname || "/";

  // ✅ Hooks SIEMPRE se ejecutan (no condicionales)
  useEffect(() => {
    if (!user) return;

    // Tracker-only flow
    if (role === "tracker" && path !== "/tracker-gps") {
      navigate("/tracker-gps", { replace: true });
      return;
    }

    // 🔒 Admin módulo global: solo App Root
    if (!isAppRoot && path.startsWith("/admins")) {
      navigate("/inicio", { replace: true });
    }
  }, [user, role, path, isAppRoot, navigate]);

  // ✅ Tabs (TopTabs hace i18n por labelKey)
  const tabs = useMemo(() => {
    const base = [
      { path: "/inicio", labelKey: "app.tabs.inicio" },
      { path: "/nueva-geocerca", labelKey: "app.tabs.nuevaGeocerca" },
      { path: "/personal", labelKey: "app.tabs.personal" },
      { path: "/actividades", labelKey: "app.tabs.actividades" },
      { path: "/asignaciones", labelKey: "app.tabs.asignaciones" },
      { path: "/costos", labelKey: "app.tabs.reportes" },
      { path: "/tracker-dashboard", labelKey: "app.tabs.tracker" },
    ];

    // Invitar tracker: owners y admins de org
    if (role === "owner" || role === "admin") {
      base.push({ path: "/invitar-tracker", labelKey: "app.tabs.invitarTracker" });
    }

    // 🔒 Administrador global: SOLO root app (fenice.ecuador@gmail.com)
    if (isAppRoot) {
      base.push({ path: "/admins", labelKey: "app.tabs.admins" });
    }

    return base;
  }, [role, isAppRoot]);

  // ✅ returns tempranos DESPUÉS de hooks
  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center text-slate-600">
        Cargando…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Tracker: UI mínima (solo tracker-gps)
  if (role === "tracker") {
    if (path !== "/tracker-gps") return null;
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <AppHeader />

      <div className="border-b border-slate-200 bg-slate-50/80 backdrop-blur">
        <TopTabs tabs={tabs} />
      </div>

      <main className="flex-1 p-4 max-w-6xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}
