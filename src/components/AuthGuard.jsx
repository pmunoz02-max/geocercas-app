// src/components/AuthGuard.jsx
import React, { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthSafe } from "../context/AuthContext.jsx";

export default function AuthGuard({ children }) {
  const auth = useAuthSafe();
  const location = useLocation();

  // Si NO hay provider, no crasheamos: mostramos fallback y mandamos a login
  if (!auth) {
    // Guard-rail: evita loop si ya estás en login/callback
    const p = location.pathname || "/";
    if (p.startsWith("/login") || p.startsWith("/auth/callback")) return children;

    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname || "/inicio")}&err=${encodeURIComponent(
          "auth_provider_missing"
        )}`}
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

  return children;
}
