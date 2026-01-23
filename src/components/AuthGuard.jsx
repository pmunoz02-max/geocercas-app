// src/components/AuthGuard.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

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
export default function AuthGuard({ children }) {
  const { loading, user } = useAuth();
  const location = useLocation();

  // ⛔ NO overlay, NO div fullscreen
  if (loading) return null;

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return children;
}
