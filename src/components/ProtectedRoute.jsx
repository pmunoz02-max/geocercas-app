// src/components/ProtectedRoute.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

/**
 * ProtectedRoute v2 (Cookie-First)
 * Fuente de verdad: /api/auth/session (lee tg_at HttpOnly)
 * - NO depende de AuthContext (evita parpadeo por hidratos tardíos)
 * - Universal para Preview/Prod porque el dominio/entorno lo define Vercel + cookies
 */

async function fetchSession() {
  const res = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "include",
    headers: { "Accept": "application/json" },
  });

  // Si el endpoint falla, tratamos como no-auth para evitar loops
  if (!res.ok) return { authenticated: false };

  const data = await res.json().catch(() => ({}));
  return data || { authenticated: false };
}

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [ok, setOk] = useState(false);

  const next = useMemo(
    () => location.pathname + location.search,
    [location.pathname, location.search]
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setChecking(true);
        const s = await fetchSession();
        if (!alive) return;
        setOk(!!s?.authenticated);
      } catch {
        if (!alive) return;
        setOk(false);
      } finally {
        if (!alive) return;
        setChecking(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [location.key]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200 p-4">
        <div className="text-sm opacity-80">Cargando sesión…</div>
      </div>
    );
  }

  if (!ok) {
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return children;
}
