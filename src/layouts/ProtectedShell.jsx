// src/layout/ProtectedShell.jsx
import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedShell() {
  const { loading, user, currentRole } = useAuth();

  // ⏳ 1) Loading → no mostrar el panel aún
  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center text-slate-600">
        Cargando…
      </div>
    );
  }

  // 🔐 2) Si no está logueado → login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 🛑 3) Si es tracker → bloqueado el panel → redirigir
  if (currentRole === "tracker") {
    return <Navigate to="/tracker-gps" replace />;
  }

  // ✔ 4) Owner/Admin → puede ver el panel completo
  return <Outlet />;
}
