// src/components/AuthGuard.jsx
import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

// ✅ ÚNICA fuente de auth: shim
import { useAuthSafe } from "@/auth/AuthProvider.jsx";

/**
 * AuthGuard (NO elimina guard, solo lo hace "no-crash")
 * - Nunca debe lanzar si falta provider
 * - Si no hay sesión/user -> redirect a /login?next=...
 * - Si está loading -> null (o spinner)
 */
export default function AuthGuard({ children }) {
  const location = useLocation();
  const auth = useAuthSafe(); // ✅ nunca lanza

  // Si por alguna razón el provider no existe, NO crashear la app:
  if (!auth) {
    const next = encodeURIComponent(location.pathname || "/inicio");
    return <Navigate to={`/login?next=${next}&err=auth_provider_missing`} replace />;
  }

  const { loading, user } = auth;

  if (loading) return null;

  if (!user) {
    const next = encodeURIComponent(location.pathname || "/inicio");
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  // Soporta ambos estilos: children wrapper o nested routes (<Outlet/>)
  if (children) return children;
  return <Outlet />;
}