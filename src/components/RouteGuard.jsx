import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

/**
 * RouteGuard (FIX)
 * - NO redirige por falta de "role" mientras la sesión ya existe.
 * - Evita bucles donde el Magic Link llega a /auth/callback, pero el rol aún no está resuelto
 *   y el guard te manda a /inicio -> / (login) -> etc.
 */
export default function RouteGuard({ allow, children }) {
  const location = useLocation();
  const { session, role, loading } = useAuth();

  // Nunca bloqueamos el callback de auth (Magic Link / PKCE).
  if (location.pathname.startsWith("/auth/callback")) return children;

  if (loading) return null;

  // Sin sesión => login
  if (!session) return <Navigate to="/" replace />;

  // Con sesión pero sin rol todavía => esperamos (carrera de triggers/RLS/carga)
  if (!role) return null;

  // Si hay allow-list, la aplicamos
  if (allow && Array.isArray(allow) && !allow.includes(role)) {
    return <Navigate to="/inicio" replace />;
  }

  return children;
}