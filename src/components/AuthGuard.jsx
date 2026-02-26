// src/components/AuthGuard.jsx
import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthSafe } from "@/auth/AuthProvider.jsx";

// ✅ Marker infalible para saber si este archivo está en el bundle servido
window.__TG_AUTHGUARD_MARKER = "AUTHGUARD_MARKER_2026-02-26_A";
console.log("[TG AUTHGUARD MARKER]", window.__TG_AUTHGUARD_MARKER);

export default function AuthGuard({ children }) {
  const location = useLocation();

  // ✅ nunca lanza
  const auth = useAuthSafe();

  if (!auth) {
    const next = encodeURIComponent(location.pathname || "/inicio");
    return <Navigate to={`/login?next=${next}&err=auth_provider_missing`} replace />;
  }

  const { loading, user } = auth;

  if (loading) return null;

  if (!user) {
    const next = encodeURIComponent(location.pathname || "/inicio");
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (children) return children;
  return <Outlet />;
}