import React, { useEffect, useRef } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth.js";

function FullScreenLoader({ text }) {
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
  const { t } = useTranslation();
  const {
    loading,
    ready,
    initialized,
    isLoggedIn,
    currentOrg,
    organizations,
    selectOrg,
  } = useAuth();

  const location = useLocation();
  const initLoggedRef = useRef(false);
  const orgHydrationLoggedRef = useRef(false);

  // AutocuraciÃ³n: si estÃ¡ logueado y hay orgs pero falta currentOrg, selecciona la primera
  useEffect(() => {
    if (loading || !ready) return;
    if (!isLoggedIn) return;

    if (!currentOrg?.id && Array.isArray(organizations) && organizations.length > 0) {
      const first = organizations.find((o) => o?.id)?.id;
      if (first) selectOrg(first);
    }
  }, [loading, ready, isLoggedIn, currentOrg?.id, organizations, selectOrg]);

  // 1) Mientras se hidrata el contexto
  if (!initialized || loading || !ready) {
    if (!initLoggedRef.current) {
      console.log("[RequireOrg] waiting for auth initialization", {
        path: location.pathname,
      });
      initLoggedRef.current = true;
    }
    return <FullScreenLoader text={t("auth.requireOrg.loading")} />;
  }

  // 2) Sin sesiÃ³n -> login
  if (!isLoggedIn) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  // 3) Tiene orgs pero todavÃ­a no se asentÃ³ currentOrg (1 render)
  if (!currentOrg?.id && Array.isArray(organizations) && organizations.length > 0) {
    if (!orgHydrationLoggedRef.current) {
      console.log("[RequireOrg] waiting for currentOrg resolution", {
        path: location.pathname,
        organizations: organizations.length,
      });
      orgHydrationLoggedRef.current = true;
    }
    return <FullScreenLoader text={t("auth.requireOrg.resolvingOrganization")} />;
  }

  // 4) Logueado pero sin organizaciones -> redirige a /inicio
  if (!currentOrg?.id) {
    return <Navigate to="/inicio" replace />;
  }

  return children;
}

