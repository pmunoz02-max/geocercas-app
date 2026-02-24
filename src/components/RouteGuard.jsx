import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/auth.js";

/**
 * RouteGuard
 * - Protege rutas privadas por rol.
 * - IMPORTANTE: NO usar para /auth/callback (debe ser pÃºblica).
 */
export default function RouteGuard({ allow, children }) {
  const { session, role, loading } = useAuth();
  const location = useLocation();

  // Mientras AuthProvider resuelve sesiÃ³n/rol, NO redirigir (evita loops)
  if (loading) return null;

  // Si NO hay sesiÃ³n -> login (guardando returnTo)
  if (!session) {
    const returnTo = location.pathname + location.search + location.hash;
    return (
      <Navigate
        to={`/login?returnTo=${encodeURIComponent(returnTo)}`}
        replace
      />
    );
  }

  // Hay sesiÃ³n pero rol todavÃ­a no llegÃ³ -> espera (muy comÃºn post-callback)
  if (!role) return null;

  // Si se especifica allow, validar rol
  if (Array.isArray(allow) && allow.length > 0 && !allow.includes(role)) {
    return <Navigate to="/inicio" replace />;
  }

  return children;
}

