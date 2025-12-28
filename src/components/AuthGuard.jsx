// src/components/AuthGuard.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * AuthGuard universal y permanente.
 * - No usa window.location (evita bucles).
 * - Aplica tracker-only en un único punto (fuente de verdad del routing).
 *
 * Reglas:
 * 1) loading => mostrar "Cargando permisos…"
 * 2) sin sesión => /login
 * 3) role === tracker:
 *    - solo permite /tracker-gps
 * 4) role !== tracker:
 *    - nunca permite /tracker-gps
 * 5) caso válido => render children
 */
export default function AuthGuard({ children }) {
  const { session, loading, role } = useAuth();
  const location = useLocation();
  const path = location?.pathname || "/";

  // 1) Espera explícita (evita parpadeos / decisiones sin rol)
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          Cargando permisos…
        </div>
      </div>
    );
  }

  // 2) No autenticado => login (preserva destino si lo necesitas luego)
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const roleLower = String(role || "").toLowerCase();
  const isTracker = roleLower === "tracker";
  const isTrackerPath = path === "/tracker-gps" || path.startsWith("/tracker-gps/");

  // 3) TRACKER: solo puede estar en /tracker-gps
  if (isTracker && !isTrackerPath) {
    return <Navigate to="/tracker-gps" replace />;
  }

  // 4) NO TRACKER: nunca puede estar en /tracker-gps
  if (!isTracker && isTrackerPath) {
    return <Navigate to="/inicio" replace />;
  }

  // 5) OK
  return <>{children}</>;
}
