// src/components/AuthGuard.jsx
import React, { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthSafe } from "../context/AuthContext.jsx";

<<<<<<< HEAD
/**
 * AuthGuard SIN overlay visual.
 *
 * Motivo:
 * - Los overlays fullscreen durante auth bootstrap
 *   rompen el native <select> en Chrome / WebView (bug conocido).
 *
 * Estrategia:
 * - Mientras loading: NO renderizar nada (null)
 * - Si no hay user: redirect
 * - Si hay user: render children
 */
=======
>>>>>>> preview
export default function AuthGuard({ children }) {
  const auth = useAuthSafe();
  const location = useLocation();

<<<<<<< HEAD
  // ⛔ NO overlay, NO div fullscreen
=======
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

>>>>>>> preview
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
