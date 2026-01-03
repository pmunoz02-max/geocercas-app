// src/components/AuthGuard.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * AuthGuard (simple y estable)
 * - Espera loading del AuthContext
 * - Si no hay sesión -> /login
 * - Si hay sesión -> render children
 *
 * NO decide tracker vs panel (eso vive en App.jsx).
 *
 * mode se acepta solo por compatibilidad con App.jsx (no se usa).
 */
export default function AuthGuard({ children, mode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          Cargando autenticación…
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return children;
}
