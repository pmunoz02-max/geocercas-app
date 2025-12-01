// src/layout/ProtectedShell.jsx
import React, { useEffect, useMemo } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AppHeader from "../components/AppHeader.jsx";
import TopTabs from "../components/TopTabs.jsx";

export default function ProtectedShell() {
  const { loading, user, currentRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const role = (currentRole || "").toLowerCase();

  // ⏳ Mientras cargan los datos de auth
  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center text-slate-600">
        Cargando…
      </div>
    );
  }

  // 🔐 Si no hay sesión → login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 🛑 Si es TRACKER y está intentando ver el panel → mandarlo a /tracker-gps
  useEffect(() => {
    if (role === "tracker" && location.pathname !== "/tracker-gps") {
      navigate("/tracker-gps", { replace: true });
    }
  }, [role, location.pathname, navigate]);

  // Mientras redirigimos, no mostramos el panel
  if (role === "tracker" && location.pathname !== "/tracker-gps") {
    return null;
  }

  // 🧭 Tabs superiores según rol
  const tabs = useMemo(() => {
    const base = [
      { path: "/inicio", label: "Inicio" },
      { path: "/nueva-geocerca", label: "Nueva geocerca" },
      { path: "/personal", label: "Personal" },
      { path: "/actividades", label: "Actividades" },
      { path: "/asignaciones", label: "Asignaciones" },
      { path: "/costos", label: "Reportes" },
      { path: "/tracker-dashboard", label: "Tracker" },
    ];

    if (role === "owner" || role === "admin") {
      base.push({ path: "/invitar-tracker", label: "Invitar tracker" });
    }

    if (role === "owner") {
      base.push({ path: "/admins", label: "Admins" });
    }

    return base;
  }, [role]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <AppHeader />

      {/* Tabs superiores */}
      <div className="border-b border-slate-200 bg-slate-50/80 backdrop-blur">
        <TopTabs tabs={tabs} />
      </div>

      {/* Contenido principal */}
      <main className="flex-1 p-4 max-w-6xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}
