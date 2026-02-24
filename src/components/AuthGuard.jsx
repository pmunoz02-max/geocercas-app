// src/components/AuthGuard.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import * as Auth from "../context/AuthContext.jsx";

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
 * AuthGuard estable (anti-crash):
 * - usa useAuthSafe si existe (preferido)
 * - fallback a useAuth si no existe
 * - espera loading
 * - valida por user (NO session)
 * - redirige a /login con next
 */
export default function AuthGuard({ children }) {
  // Selección segura del hook (siempre se llama 1 hook, sin condicionales)
  const useAuthHook = Auth.useAuthSafe ?? Auth.useAuth;

  const { loading = false, user = null } = useAuthHook();
  const location = useLocation();

  if (loading) return <FullScreenLoader text="Cargando sesión…" />;

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return children;
}