// src/components/AuthGuard.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * AuthGuard universal (alineado a AuthContext actual)
 *
 * REGLAS CRÍTICAS:
 * 1) /auth/callback NUNCA se bloquea
 * 2) No se decide nada hasta authReady === true
 * 3) Sin sesión => /login
 * 4) trackerDomain => solo permite /tracker-gps (y rutas públicas)
 * 5) panelDomain:
 *    - tracker solo permite /tracker-gps
 *    - panel roles (owner/admin/viewer) NO permiten /tracker-gps
 *
 * mode:
 * - mode="tracker": fuerza /tracker-gps
 * - mode="panel":   fuerza /inicio (y bloquea /tracker-gps)
 */
export default function AuthGuard({ children, mode }) {
  const { authReady, session, currentRole, trackerDomain } = useAuth();
  const location = useLocation();
  const path = location?.pathname || "/";

  // 🔓 NUNCA bloquear callback
  if (path === "/auth/callback") return <>{children}</>;

  // 1) Espera explícita y única (evita decisiones prematuras)
  if (!authReady) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          Validando sesión…
        </div>
      </div>
    );
  }

  // 2) No autenticado => login
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const roleLower = String(currentRole || "").toLowerCase().trim();
  const isTrackerRole = roleLower === "tracker";

  const isTrackerPath =
    path === "/tracker-gps" || path.startsWith("/tracker-gps/");

  const modeLower = String(mode || "").toLowerCase().trim();

  // A) Reglas por mode (primero)
  if (modeLower === "tracker" && !isTrackerPath) {
    return <Navigate to="/tracker-gps" replace />;
  }
  if (modeLower === "panel" && isTrackerPath) {
    return <Navigate to="/inicio" replace />;
  }

  // B) Reglas por dominio
  // En trackerDomain: forzar tracker-gps
  if (trackerDomain && !isTrackerPath) {
    return <Navigate to="/tracker-gps" replace />;
  }

  // C) Reglas por rol
  // Tracker role solo puede estar en /tracker-gps
  if (isTrackerRole && !isTrackerPath) {
    return <Navigate to="/tracker-gps" replace />;
  }

  // No-tracker role nunca puede estar en /tracker-gps
  if (!isTrackerRole && isTrackerPath) {
    return <Navigate to="/inicio" replace />;
  }

  return <>{children}</>;
}
