// src/components/AuthGuard.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * AuthGuard universal y permanente.
 * - Evita bucles (NO usa window.location).
 * - Enforza reglas por rol y opcionalmente por "mode".
 *
 * Reglas base:
 * 1) loading => "Cargando permisos…"
 * 2) sin sesión => /login
 * 3) role === tracker:
 *    - solo permite /tracker-gps
 * 4) role !== tracker:
 *    - nunca permite /tracker-gps
 *
 * Reglas extra por mode (si se pasa):
 * - mode="tracker": solo permite /tracker-gps (aunque haya errores aguas arriba)
 * - mode="panel":  nunca permite /tracker-gps
 */
export default function AuthGuard({ children, mode }) {
  const { session, loading, role } = useAuth();
  const location = useLocation();
  const path = location?.pathname || "/";

  // 1) Espera explícita (evita decisiones sin rol)
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          Cargando permisos…
        </div>
      </div>
    );
  }

  // 2) No autenticado => login
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const roleLower = String(role || "").toLowerCase();
  const isTracker = roleLower === "tracker";
  const isTrackerPath = path === "/tracker-gps" || path.startsWith("/tracker-gps/");

  const modeLower = String(mode || "").toLowerCase();

  // A) Reglas por mode (primero)
  if (modeLower === "tracker" && !isTrackerPath) {
    return <Navigate to="/tracker-gps" replace />;
  }
  if (modeLower === "panel" && isTrackerPath) {
    return <Navigate to="/inicio" replace />;
  }

  // B) Reglas base por rol (canon)
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
