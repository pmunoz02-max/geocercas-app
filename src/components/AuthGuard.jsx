import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * AuthGuard ESTABLE (sin loops)
 *
 * Principios:
 * - ESPERA a que AuthContext termine (authReady / loading)
 * - Decide por `user` (no por `session`)
 * - NO redirige mientras se está hidratando
 * - NO hace signOut
 */
export default function AuthGuard({ mode = "panel", children }) {
  const location = useLocation();
  const {
    authReady,
    loading,
    authError,
    user,          // 🔑 USAR user, no session
    bestRole,
    trackerDomain,
  } = useAuth();

  const isReady = authReady === true || loading === false;
  const isTracker = String(bestRole || "").toLowerCase() === "tracker";

  // 1️⃣ Esperar SIEMPRE a que AuthContext termine
  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70">
          Cargando sesión…
        </div>
      </div>
    );
  }

  // 2️⃣ Error explícito de auth
  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="max-w-md w-full mx-4 rounded-xl bg-white/5 border border-white/10 p-4">
          <div className="text-sm font-semibold">Error de autenticación</div>
          <div className="mt-2 text-xs opacity-70 break-words">{authError}</div>
        </div>
      </div>
    );
  }

  // 3️⃣ NO HAY USER → login (con next)
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  // 4️⃣ Lógica por modo
  if (mode === "tracker") {
    if (isTracker || trackerDomain) return children;
    return <Navigate to="/inicio" replace />;
  }

  // mode === panel
  if (isTracker || trackerDomain) {
    return <Navigate to="/tracker-gps" replace />;
  }

  return children;
}
