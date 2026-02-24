// src/components/AuthGuard.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthSafe } from "@/context/auth.js";

export default function AuthGuard({ children }) {
  const auth = useAuthSafe();
  const location = useLocation();

  // âœ… Si NO hay provider, no crasheamos
  if (!auth) {
    const p = location.pathname || "/";
    if (p.startsWith("/login") || p.startsWith("/auth/callback")) return children;

    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(p || "/inicio")}&err=${encodeURIComponent(
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

