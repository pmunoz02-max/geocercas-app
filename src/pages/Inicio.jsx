// src/pages/Inicio.jsx
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Inicio() {
  const navigate = useNavigate();

  const { loading, user, currentOrg, currentRole, isAppRoot } = useAuth();

  // 1) Loader solo mientras hidrata AuthContext (contrato REAL)
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        Resolviendo permisos...
      </div>
    );
  }

  // 2) Si no hay user, pedir login
  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-600">
        Inicia sesión para continuar.{" "}
        <button
          className="ml-3 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          onClick={() => navigate("/login")}
        >
          Ir a Login
        </button>
      </div>
    );
  }

  // 3) Rol efectivo (robusto)
  const roleLower = useMemo(() => {
    if (isAppRoot) return "root";
    return String(currentRole || "").toLowerCase().trim();
  }, [currentRole, isAppRoot]);

  // 4) Si ya hay user pero rol aún vacío, NO colgamos: mostramos estado útil
  if (!roleLower) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">
            Sesión iniciada, pero falta rol
          </h1>

          <p className="text-sm text-slate-600">
            La sesión existe ({user.email}), pero todavía no se pudo determinar tu rol en la
            organización actual. Esto puede ocurrir si no hay fila en <code>memberships</code> /
            <code>app_user_roles</code> para tu usuario, o si el OrgSelector cambió a una org sin rol.
          </p>

          <div className="text-sm text-slate-700 space-y-1">
            <div>
              <b>Email:</b> {user.email}
            </div>
            <div>
              <b>Organización:</b>{" "}
              {currentOrg?.name || currentOrg?.org_name || currentOrg?.id || "(sin org aún)"}
            </div>
            <div>
              <b>Rol:</b> (vacío)
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
              onClick={() => window.location.reload()}
            >
              Reintentar
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => navigate("/administrador")}
            >
              Ir a Administrador
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 5) Panel normal
  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Bienvenido a App Geocercas
        </h1>
        <p className="text-slate-600 mt-2">
          Sesión iniciada como <b>{roleLower}</b>
        </p>

        <div className="mt-4 text-sm text-slate-700 space-y-1">
          <div>
            <b>Email:</b> {user.email}
          </div>
          <div>
            <b>Organización:</b>{" "}
            {currentOrg?.name || currentOrg?.org_name || currentOrg?.id || "(sin org aún)"}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => navigate("/geocercas")}
          >
            Ir a Geocercas
          </button>

          <button
            className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => navigate("/asignaciones")}
          >
            Asignaciones
          </button>

          <button
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => navigate("/reportes")}
          >
            Reportes
          </button>

          {(isAppRoot || roleLower === "owner" || roleLower === "admin") && (
            <button
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => navigate("/administrador")}
            >
              Administrador
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
