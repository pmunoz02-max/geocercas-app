// src/components/AuthGuard.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function FullScreenLoader({ text = "Cargando…" }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70">
        {text}
      </div>
    </div>
  );
}

/**
 * AuthGuard estable:
 * - Espera `loading`
 * - Decide por `user` (no por session)
 * - Redirige a /login con next
 * - NO hace signOut, NO re-lee getSession
 *
 * Nota: La lógica de roles (tracker/panel) ya la manejan RequirePanel/RequireTracker en App.jsx.
 */
export default function AuthGuard({ children }) {
  const { loading, user } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader text="Cargando sesión…" />;

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return children;
}
