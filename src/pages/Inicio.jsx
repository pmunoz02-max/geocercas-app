// src/pages/Inicio.jsx
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Inicio() {
  const navigate = useNavigate();

  const {
    authReady,
    authError,
    user,
    currentOrg,
    currentRole,
    bestRole,
    roles,
    orgs,
    trackerDomain,
  } = useAuth();

  // 1) Loader solo mientras hidrata AuthContext
  if (!authReady) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        Resolviendo permisos...
      </div>
    );
  }

  // 2) Si no hay user, redirección lógica (AuthGuard debería cubrirlo, pero blindamos)
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
    return String(currentRole || bestRole || "")
      .toLowerCase()
      .trim();
  }, [currentRole, bestRole]);

  // 4) Si authReady=true pero rol vacío => NO nos colgamos: mostramos error y debug
  if (!roleLower) {
    const rolesCount = Array.isArray(roles) ? roles.length : 0;
    const orgsCount = Array.isArray(orgs) ? orgs.length : 0;

    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">
            No se pudo resolver permisos
          </h1>

          <p className="text-sm text-slate-600">
            La sesión existe, pero no se pudo determinar tu rol (owner/admin/viewer/tracker).
            Esto suele pasar por un error de lectura en <code>app_user_roles</code> (RLS/403) o
            porque no hay filas para tu usuario.
          </p>

          {authError && (
            <div className="text-sm rounded-xl bg-red-50 border border-red-200 p-3 text-red-700">
              <b>AuthContext error:</b> {authError}
            </div>
          )}

          <div className="text-sm text-slate-700 space-y-1">
            <div>
              <b>Email:</b> {user.email}
            </div>
            <div>
              <b>Tracker domain:</b> {String(!!trackerDomain)}
            </div>
            <div>
              <b>roles rows:</b> {rolesCount}
            </div>
            <div>
              <b>orgs rows:</b> {orgsCount}
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
              onClick={() => navigate("/login")}
            >
              Volver a Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 5) Si es tracker domain, Inicio no es el destino ideal, pero mostramos info mínima
  if (trackerDomain) {
    return (
      <div className="max-w-xl mx-auto px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">Modo Tracker</h1>
          <p className="text-sm text-slate-600">
            Estás en dominio tracker. Tu rol es <b>{roleLower}</b>.
          </p>
          <button
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => navigate("/tracker-gps")}
          >
            Abrir Tracker
          </button>
        </div>
      </div>
    );
  }

  // 6) Panel: render básico
  const rolesCount = Array.isArray(roles) ? roles.length : 0;

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
          <div>
            <b>Roles detectados:</b> {rolesCount}
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
            onClick={() => navigate("/costos-dashboard")}
          >
            Costos Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
