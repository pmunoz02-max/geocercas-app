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
 * RequireOrg (UNIVERSAL, sin loader infinito)
 * Estados:
 * - loading -> loader visible (no null)
 * - user null -> AuthGuard se encarga (retorna null)
 * - user con orgs pero currentOrg null -> intenta autocurar (selectOrg)
 * - sin orgs -> redirect onboarding
 */
export default function RequireOrg({ children }) {
  const { loading, user, currentOrg, organizations, selectOrg } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user?.id) return;

    // Autocuración: si hay orgs pero no currentOrg, selecciona la primera
    if (!currentOrg?.id && Array.isArray(organizations) && organizations.length > 0) {
      const first = organizations.find((o) => o?.id)?.id;
      if (first) selectOrg(first);
    }
  }, [loading, user?.id, currentOrg?.id, organizations, selectOrg]);

  if (loading) return <FullScreenLoader />;

  // No logueado → AuthGuard se encarga
  if (!user) return null;

  // Tiene orgs pero todavía no se asentó currentOrg (un render de diferencia)
  if (!currentOrg?.id && Array.isArray(organizations) && organizations.length > 0) {
    return <FullScreenLoader />;
  }

  // Logueado pero sin organizaciones → onboarding obligatorio
  if (!currentOrg?.id) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/onboarding/create-org?next=${next}`} replace />;
  }

  return children;
}
