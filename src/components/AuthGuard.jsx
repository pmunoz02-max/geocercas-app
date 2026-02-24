// src/components/AuthGuard.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthSafe } from "@/context/auth.js";

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
 * AuthGuard UNIVERSAL (no crashea):
 * - usa useAuthSafe (no throw)
 * - espera loading/ready
 * - redirige a /login con next
 */
export default function AuthGuard({ children, fallback = null }) {
  const auth = useAuthSafe?.() || null;
  const location = useLocation();

  // Si por cualquier razón aún no existe provider, no crashear:
  if (!auth) return fallback;

  const { loading, user, ready } = auth;

  if (loading || ready === false) return fallback || <FullScreenLoader text="Cargando sesión…" />;

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children}</>;
}