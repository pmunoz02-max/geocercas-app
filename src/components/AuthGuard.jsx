// src/components/AuthGuard.jsx
import React, { useRef } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthSafe } from "@/auth/AuthProvider.jsx";
import { isTrackerGpsPath } from "@/lib/trackerFlow";

// ✅ Marker infalible para saber si este archivo está en el bundle servido
const DEBUG_AUTH_GUARD = import.meta.env.DEV;
function authGuardDebug(...args) {
  if (DEBUG_AUTH_GUARD) console.log(...args);
}
// ✅ Marker infalible para saber si este archivo está en el bundle servido
window.__TG_AUTHGUARD_MARKER = "AUTHGUARD_MARKER_2026-02-26_A";
authGuardDebug("[TG AUTHGUARD MARKER]", window.__TG_AUTHGUARD_MARKER);

export default function AuthGuard({ children }) {
  const location = useLocation();
  const { t } = useTranslation();

  // BYPASS: Allow /tracker-accept and /tracker-gps to skip all auth checks and preserve query params
  if (
    location.pathname.startsWith("/tracker-accept") ||
    location.pathname.startsWith("/tracker-gps")
  ) {
    authGuardDebug("[AuthGuard] BYPASS for tracker route", location.pathname);
    return children || <Outlet />;
  }
  const missingProviderLoggedRef = useRef(false);

  // Permitir acceso directo a /paddle-checkout sin sesión ni redirigir
  if (location.pathname.startsWith("/paddle-checkout")) {
    authGuardDebug("[AuthGuard] Allowing direct access to /paddle-checkout");
    return children || <Outlet />;
  }

  // ✅ nunca lanza
  const auth = useAuthSafe();


  if (!auth) {
    if (!missingProviderLoggedRef.current) {
      console.error("[AuthGuard] auth provider missing");
      missingProviderLoggedRef.current = true;
    }
    const next = encodeURIComponent(location.pathname || "/inicio");
    authGuardDebug("[AuthGuard] Redirecting to /login due to missing auth provider", { location: location.pathname });
    return <Navigate to={`/login?next=${next}&err=auth_provider_missing`} replace />;
  }


  const { loading, initialized, user } = auth;

  if (!initialized || loading) {
    authGuardDebug("[AuthGuard] Still loading or not initialized", { loading, initialized, user });
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-slate-500">{t("common.actions.loading")}</div>
      </div>
    );
  }

  if (!user) {
    const next = encodeURIComponent(location.pathname || "/inicio");
    authGuardDebug("[AuthGuard] Redirecting to /login due to missing user", { location: location.pathname });
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (children) return children;
  return <Outlet />;
}