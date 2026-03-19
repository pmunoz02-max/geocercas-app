import React, { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/auth.js";
import { supabaseTracker } from "../lib/supabaseTrackerClient";

function FullScreenLoader({ text = "Cargando tu sesiÃ³n y organizaciÃ³n actualâ€¦" }) {
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
  const isTrackerRoute =
    location.pathname === "/tracker" ||
    location.pathname.startsWith("/tracker/") ||
    location.pathname === "/tracker-gps" ||
    location.pathname.startsWith("/tracker-gps/");
  const bypassLoggedRef = useRef(false);
  const [trackerBypass, setTrackerBypass] = useState(isTrackerRoute);

  useEffect(() => {
    if (!isTrackerRoute) {
      setTrackerBypass(false);
      return;
    }

    setTrackerBypass(true);
    if (!bypassLoggedRef.current) {
      console.warn("[tracker-blocking-ui] source=RequireOrg");
      console.warn("[tracker-blocking-ui] bypassed");
      console.warn("[tracker-org-sync-gate] bypassed on tracker route");
      console.warn("[monetization-regression] source=RequireOrg");
      console.warn("[monetization-regression] tracker bypass applied");
      bypassLoggedRef.current = true;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabaseTracker.auth.getSession();
        if (cancelled) return;
        if (data?.session?.user?.id) {
          console.warn("[org-access-guard] bypass preview");
          console.warn("[org-access-guard] source=RequireOrg");
          bypassLoggedRef.current = true;
        }
      } catch {
        // ignore session probe failures in preview bypass
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isTrackerRoute]);

  // AutocuraciÃ³n: si estÃ¡ logueado y hay orgs pero falta currentOrg, selecciona la primera
  useEffect(() => {
    if (loading || !ready) return;
    if (!isLoggedIn) return;

    if (!currentOrg?.id && Array.isArray(organizations) && organizations.length > 0) {
      const first = organizations.find((o) => o?.id)?.id;
      if (first) selectOrg(first);
    }
  }, [loading, ready, isLoggedIn, currentOrg?.id, organizations, selectOrg]);

  if (isTrackerRoute && trackerBypass) {
    if (!bypassLoggedRef.current) {
      console.warn("[tracker-blocking-ui] source=RequireOrg");
      console.warn("[tracker-blocking-ui] bypassed");
      console.warn("[tracker-org-sync-gate] bypassed on tracker route");
      console.warn("[org-access-guard] bypass preview");
      console.warn("[org-access-guard] source=RequireOrg");
      console.warn("[monetization-regression] source=RequireOrg");
      console.warn("[monetization-regression] tracker bypass applied");
      bypassLoggedRef.current = true;
    }
    return children;
  }

  // 1) Mientras se hidrata el contexto
  if (loading || !ready) return <FullScreenLoader />;

  // 2) Sin sesiÃ³n -> login
  if (!isLoggedIn) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  // 3) Tiene orgs pero todavÃ­a no se asentÃ³ currentOrg (1 render)
  if (!currentOrg?.id && Array.isArray(organizations) && organizations.length > 0) {
    return <FullScreenLoader text="Resolviendo tu organizaciÃ³nâ€¦" />;
  }

  // 4) Logueado pero sin organizaciones -> onboarding
  if (!currentOrg?.id) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/onboarding/create-org?next=${next}`} replace />;
  }

  return children;
}

