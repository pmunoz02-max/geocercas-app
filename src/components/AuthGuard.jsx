// src/components/AuthGuard.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * AuthGuard (simple y estable)
 *
 * Responsabilidad ÚNICA:
 * - Esperar a que AuthContext termine (loading)
 * - Si NO hay sesión => enviar a /login
 * - Si hay sesión => permitir render
 *
 * NO decide tracker vs panel.
 * NO decide roles.
 * (Esa autoridad vive en App.jsx: rutas + SmartFallback)
 *
 * Nota:
 * - Se acepta prop `mode` SOLO por compatibilidad con App.jsx actual.
 */
export default function AuthGuard({ children, mode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  // Mientras carga auth -> loader (evita redirects prematuros)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm text-sm text-slate-600">
          Cargando autenticación…
        </div>
      </div>
    );
  }

  // Sin sesión -> login
  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  // Con sesión -> permitir acceso (NO decidir rutas por rol aquí)
  return children;
}
