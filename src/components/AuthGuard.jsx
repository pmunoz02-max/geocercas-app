// src/components/AuthGuard.jsx
import React, { useRef } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthSafe } from "@/auth/AuthProvider.jsx";
import { isTrackerGpsPath } from "@/lib/trackerFlow";

// ✅ Marker infalible para saber si este archivo está en el bundle servido
window.__TG_AUTHGUARD_MARKER = "AUTHGUARD_MARKER_2026-02-26_A";
console.log("[TG AUTHGUARD MARKER]", window.__TG_AUTHGUARD_MARKER);

export default function AuthGuard({ children }) {
  const location = useLocation();

  // BYPASS: Allow tracker routes to skip all auth checks
  if (
    location.pathname.startsWith("/tracker-gps") ||
    location.pathname.startsWith("/tracker-accept")
  ) {
    console.log("[AuthGuard] HARD BYPASS for tracker route", location.pathname);
    return children || <Outlet />;
  }
  const missingProviderLoggedRef = useRef(false);

  // Permitir acceso directo a /paddle-checkout sin sesión ni redirigir
  if (location.pathname.startsWith("/paddle-checkout")) {
    console.log("[AuthGuard] Allowing direct access to /paddle-checkout");
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
    console.log("[AuthGuard] Redirecting to /login due to missing auth provider", { location: location.pathname });
    return <Navigate to={`/login?next=${next}&err=auth_provider_missing`} replace />;
  }


  const { loading, initialized, user } = auth;

  if (!initialized || loading) {
    // Show visible debug info while loading
    console.log("[AuthGuard] Still loading or not initialized", { loading, initialized, user });
    return (
      <div style={{ padding: 16, color: '#fff', background: '#222', fontSize: 14 }}>
        <b>[AuthGuard] Loading…</b>
        <div>loading: {String(loading)}</div>
        <div>initialized: {String(initialized)}</div>
        <div>user: {user ? JSON.stringify(user) : "null"}</div>
        <div>location: {location.pathname}</div>
      </div>
    );
  }

  if (!user) {
    const next = encodeURIComponent(location.pathname || "/inicio");
    console.log("[AuthGuard] Redirecting to /login due to missing user", { location: location.pathname });
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (children) return children;
  return <Outlet />;
}