import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

/**
 * RouteGuard
 * - Protege rutas privadas por rol.
 * - IMPORTANTE: NO usar para /auth/callback (debe ser pública).
 */
export default function RouteGuard({ allow, children }) {
  const { session, role, loading } = useAuth();

  // Mientras AuthProvider resuelve sesión/rol, no redirects (evita loops)
  if (loading) return null;

  // Si NO hay sesión -> login
  if (!session) return <Navigate to="/login" replace />;

  // Hay sesión pero rol todavía no llegó -> espera (muy común post-callback)
  if (!role) return null;

  // Si se especifica allow, validar rol
  if (allow && !allow.includes(role)) return <Navigate to="/inicio" replace />;

  return children;
}
