// src/components/RequireOrg.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function FullScreenLoader({ text = "Cargando tu sesión y organización actual…" }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="px-6 py-3 rounded-xl border border-slate-200 bg-white shadow-sm text-slate-700 text-sm">
        {text}
      </div>
    </div>
  );
}

/**
 * RequireOrg (universal, anti-cuelgue)
 * - Solo depende del contrato NUEVO de AuthContext:
 *   loading, contextLoading, isAuthenticated, user, currentOrg, role, ctx, refreshContext
 * - No usa ready/authenticated/currentOrgId/currentRole/profile
 * - Nunca se queda en loader infinito: pone un timeout visual y ofrece Reintentar.
 */
export default function RequireOrg({ children }) {
  const navigate = useNavigate();
  const {
    loading,
    contextLoading,
    isAuthenticated,
    user,
    currentOrg,
    role,
    ctx,
    refreshContext,
  } = useAuth();

  // Timeout “suave” para no quedar pegados si el RPC no responde.
  const [softTimeout, setSoftTimeout] = useState(false);

  useEffect(() => {
    setSoftTimeout(false);
    const t = setTimeout(() => setSoftTimeout(true), 9000);
    return () => clearTimeout(t);
  }, [loading, contextLoading, isAuthenticated, user?.id]);

  const roleLower = useMemo(() => String(role || "").toLowerCase(), [role]);
  const hasOrg = !!currentOrg?.id;

  // 1) Boot auth
  if (loading) {
    return <FullScreenLoader text="Cargando sesión…" />;
  }

  // 2) No autenticado -> login
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center gap-3 text-slate-600">
        <span>No autenticado.</span>
        <button
          className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          onClick={() => navigate("/login")}
        >
          Ir a Login
        </button>
      </div>
    );
  }

  // 3) Si ya tenemos org, no bloquear por ctx/role
  if (hasOrg) {
    return children;
  }

  // 4) Intentando resolver contexto (org) -> loader con escape
  if (contextLoading && !softTimeout) {
    return <FullScreenLoader text="Cargando tu sesión y organización actual…" />;
  }

  // 5) Fallo/ausencia de org -> pantalla diagnóstica + reintentar
  const errMsg =
    (ctx && ctx.ok === false && ctx.error) ? String(ctx.error) : "";

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">
          Sesión iniciada, pero falta organización activa
        </h1>

        <p className="text-sm text-slate-600">
          Email: <b>{user.email}</b>
        </p>

        <div className="text-sm text-slate-700 space-y-1">
          <div>
            <b>Rol:</b> {roleLower || "sin rol"}
          </div>
          <div>
            <b>Org:</b> (no resuelta)
          </div>
          {errMsg && (
            <div className="text-xs text-red-600">
              <b>Detalle:</b> {errMsg}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => refreshContext?.()}
          >
            Reintentar (refreshContext)
          </button>

          <button
            className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 hover:bg-slate-50"
            onClick={() => window.location.reload()}
          >
            Recargar página
          </button>

          <button
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => navigate("/inicio")}
          >
            Ir a Inicio
          </button>
        </div>
      </div>
    </div>
  );
}
