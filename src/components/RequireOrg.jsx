import React, { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function FullScreenLoader({ text = "Cargando tu sesión y organización actual…" }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70">
        {text}
      </div>
    </div>
  );
}

/**
 * RequireOrg (UNIVERSAL, sin loops)
 *
 * Reglas:
 * - Si loading o no ready -> loader
 * - Si no isLoggedIn -> redirect a /login con next
 * - Si hay organizations pero falta currentOrg -> autocura con selectOrg(primera)
 * - Si no hay org -> redirect onboarding
 */
export default function RequireOrg({ children }) {
  const {
    loading,
    ready,
    isLoggedIn,
    currentOrg,
    organizations,
    selectOrg,
  } = useAuth();

  const location = useLocation();

  // Autocuración: si está logueado y hay orgs pero falta currentOrg, selecciona la primera
  useEffect(() => {
    if (loading || !ready) return;
    if (!isLoggedIn) return;

    if (!currentOrg?.id && Array.isArray(organizations) && organizations.length > 0) {
      const first = organizations.find((o) => o?.id)?.id;
      if (first) selectOrg(first);
    }
  }, [loading, ready, isLoggedIn, currentOrg?.id, organizations, selectOrg]);

  // 1) Mientras se hidrata el contexto
  if (loading || !ready) return <FullScreenLoader />;

  // 2) Sin sesión -> login
  if (!isLoggedIn) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  // 3) Tiene orgs pero todavía no se asentó currentOrg (1 render)
  if (!currentOrg?.id && Array.isArray(organizations) && organizations.length > 0) {
    return <FullScreenLoader text="Resolviendo tu organización…" />;
  }

  // 4) Logueado pero sin organizaciones -> onboarding
  if (!currentOrg?.id) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/onboarding/create-org?next=${next}`} replace />;
  }

  return children;
}
