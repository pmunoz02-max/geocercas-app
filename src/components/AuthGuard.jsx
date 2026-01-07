// src/components/AuthGuard.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * AuthGuard UNIVERSAL
 *
 * Objetivo:
 * - NO colgar la UI esperando roles/orgs (porque AuthContext los hidrata en background).
 * - Decidir acceso solo por:
 *   - authReady (loading legacy)
 *   - session
 *   - bestRole (tracker vs no-tracker)
 *   - trackerDomain (si aplica)
 *
 * Uso:
 * <AuthGuard mode="panel"> ... </AuthGuard>
 * <AuthGuard mode="tracker"> ... </AuthGuard>
 */
export default function AuthGuard({ mode = "panel", children }) {
  const location = useLocation();
  const {
    authReady,
    authError,
    loading, // legacy: !authReady
    session,
    bestRole,
    trackerDomain,
  } = useAuth();

  const isTracker = String(bestRole || "").toLowerCase() === "tracker";
  const isReady = authReady === true || loading === false;

  // Loader SOLO por sesión, no por permisos/roles
  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          Cargando…
        </div>
      </div>
    );
  }

  // Error de auth: mostrar algo visible (no colgar)
  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-md w-full mx-4 rounded-xl bg-white border border-slate-200 shadow-sm p-4">
          <div className="text-sm font-semibold text-slate-800">Error de autenticación</div>
          <div className="mt-2 text-xs text-slate-600 break-words">{authError}</div>
          <div className="mt-4 text-xs text-slate-500">
            Recomendación: vuelve a iniciar sesión desde el enlace o desde la Landing.
          </div>
        </div>
      </div>
    );
  }

  // Sin sesión
  if (!session) {
    if (mode === "tracker") {
      // trackers normalmente entran por magic link → si no hay sesión, manda a login
      const next = encodeURIComponent("/tracker-gps");
      return <Navigate to={`/login?mode=magic&next=${next}`} replace />;
    }

    // panel: manda a landing (o login si prefieres)
    return <Navigate to="/" replace />;
  }

  // Con sesión: decide acceso por modo
  if (mode === "tracker") {
    // Permitir tracker si:
    // - bestRole es tracker, o
    // - estás en subdominio tracker (si lo usas)
    if (isTracker || trackerDomain) return children;

    // Usuario de panel cayó aquí: reenvíalo al panel
    return <Navigate to="/inicio" replace />;
  }

  // mode === "panel"
  // Si es tracker, no entra al panel
  if (isTracker || trackerDomain) {
    return <Navigate to="/tracker-gps" replace />;
  }

  // Usuario panel OK
  return children;
}
