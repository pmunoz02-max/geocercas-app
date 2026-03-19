// src/components/AuthGuard.jsx
import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthSafe } from "../context/AuthContext.jsx";

export default function AuthGuard({ children }) {
  const auth = useAuthSafe();
  const location = useLocation();

  // If provider is missing, redirect to login instead of crashing
  if (!auth) {
    const p = location.pathname || "/";
    if (p.startsWith("/login") || p.startsWith("/auth/callback")) {
      return children || <Outlet />;
    }
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname || "/inicio")}&err=auth_provider_missing`}
        replace
      />
    );
  }

  const { loading, user } = auth;

  if (loading) return null;

  if (!user) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname || "/inicio")}`}
        replace
      />
    );
  }

  if (children) return children;
  return <Outlet />;
}

