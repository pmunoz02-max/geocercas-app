// src/auth/ProtectedRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useModuleAccess } from "../hooks/useModuleAccess";
import { MODULE_KEYS } from "../lib/permissions";

/**
 * ProtectedRoute
 * - Asume que el usuario YA pasó por AuthGuard (ya está autenticado).
 * - Verifica permisos por módulo usando la matriz central de permisos.
 * - Si no tiene acceso, lo redirige (por defecto a /inicio).
 */
export default function ProtectedRoute({ moduleKey, children }) {
  const location = useLocation();

  // Si no se pasa moduleKey, no aplicamos restricción adicional
  if (!moduleKey) {
    return children;
  }

  const { canView } = useModuleAccess(moduleKey);

  if (!canView) {
    return (
      <Navigate
        to="/inicio"
        replace
        state={{ from: location.pathname, deniedModule: moduleKey }}
      />
    );
  }

  return children;
}
