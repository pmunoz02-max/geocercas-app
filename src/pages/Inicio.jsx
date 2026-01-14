// src/pages/Inicio.jsx
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Inicio() {
  const navigate = useNavigate();

  const {
    loading,
    ready,
    user,
    role,
    currentOrgId,
    authenticated,
  } = useAuth();

  // 1) Loader mientras AuthContext hidrata
  if (loading || !ready) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        Resolviendo permisos...
      </div>
    );
  }

  // 2) No autenticado → login
  if (!authenticated || !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-600">
        Inicia sesión para continuar.
        <button
          className="ml-3 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          onClick={() => navigate("/login")}
        >
          Ir a Login
        </button>
      </div>
    );
  }

  // 3) Rol efectivo
  const roleLower = useMemo(
    () => String(role || "").toLowerCase().trim(),
    [role]
  );

  // 4) Si por alguna razón extrema no hay rol u org → estado controlado
  if (!roleLower || !currentOrgId) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">
            Sesión iniciada, pero falta rol
          </h1>

          <p className="text-sm text-slate-600">
            La sesión existe ({user.email}), pero todavía no se pudo determinar tu rol u
            organización activa. Este estado debería ser transitorio.
          </p>

          <div className="text-sm text-slate-700 space-y-1">
            <div>
              <b>Email:</b> {user.email}
            </div>
            <div>
              <b>Organización:</b> (no resuelta)
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
            <b>Organización ID:</b> {currentOrgId}
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

          {(roleLower === "owner" || roleLower === "admin") && (
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
