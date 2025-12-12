import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * Guard UNIVERSAL:
 * - Si hay sesión pero NO hay organización activa
 * - fuerza onboarding para crear organización
 */
export default function RequireOrg({ children }) {
  const { loading, user, currentOrg } = useAuth();

  if (loading) return null;

  // No logueado → AuthGuard se encarga
  if (!user) return null;

  // Logueado pero sin organización → onboarding obligatorio
  if (!currentOrg?.id) {
    return <Navigate to="/onboarding/create-org" replace />;
  }

  return children;
}
