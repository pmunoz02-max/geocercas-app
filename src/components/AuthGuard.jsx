// src/components/AuthGuard.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider.jsx";

function FullScreenLoader({ text = "Cargando..." }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="px-4 py-3 rounded-xl bg-white/5">{text}</div>
    </div>
  );
}

/**
 * AuthGuard estable:
 * - espera loading
 * - valida user
 * - redirige a /login con next
 */
export default function AuthGuard({ children }) {
  const { loading, user } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader text="Cargando..." />;

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return children;
}