// src/pages/Inicio.jsx
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext"; // ajusta si tu ruta real es distinta

export default function Inicio() {
  const navigate = useNavigate();

  const {
    authReady,
    user,
    currentOrg,
    bestRole,
    trackerDomain,
    orgs,
    roles,
  } = useAuth();

  // ✅ CRITICO: loader SOLO si authReady === false (evita “infinito” si authReady viene undefined)
  if (authReady === false) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        Resolviendo permisos...
      </div>
    );
  }

  // Si no hay user, no te quedes en blanco
  if (!user) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-slate-600 gap-4 px-4">
        <div>Sesión no disponible. Vuelve a iniciar sesión.</div>
        <button
          onClick={() => navigate("/login", { replace: true })}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          Ir a Login
        </button>
      </div>
    );
  }

  // Rol efectivo (no dependas de currentRole si no existe)
  const roleLower = useMemo(() => {
    return String(bestRole || "").toLowerCase().trim();
  }, [bestRole]);

  const roleLabel = useMemo(() => {
    if (roleLower === "owner") return "Owner";
    if (roleLower === "admin") return "Admin";
    if (roleLower === "viewer") return "Viewer";
    if (roleLower === "tracker") return "Tracker";
    return roleLower || "(sin rol)";
  }, [roleLower]);

  const rolesCount = Array.isArray(roles) ? roles.length : 0;
  const orgCount = Array.isArray(orgs) ? orgs.length : 0;

  // Si estás en panel y aún no hay org resuelta, muestra pantalla útil (no blanco)
  if (!trackerDomain && !currentOrg) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-slate-600 px-4 text-center gap-3">
        <div className="text-slate-500">Preparando organización...</div>
        <div className="text-sm">
          {orgCount === 0
            ? "Tu usuario aún no tiene una organización asignada."
            : "Seleccionando organización activa..."}
        </div>

        <div className="text-xs text-slate-500 mt-2">
          Rol: <b>{roleLabel}</b> · Roles detectados: <b>{rolesCount}</b> · Orgs visibles:{" "}
          <b>{orgCount}</b>
        </div>

        <div className="flex gap-2 flex-wrap justify-center mt-4">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-slate-200 text-slate-800 hover:bg-slate-300"
          >
            Reintentar
          </button>
          <button
            onClick={() => navigate("/login", { replace: true })}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            Ir a Login
          </button>
        </div>
      </div>
    );
  }

  const orgName =
    currentOrg?.name || currentOrg?.org_name || currentOrg?.id || "";

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">
          Bienvenido a App Geocercas
        </h1>
        <p className="text-slate-600 mt-1">
          Sesión iniciada como <b>{roleLabel}</b>
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-2">
        <div className="text-sm text-slate-700">
          <b>Email:</b> {user.email}
        </div>

        {!trackerDomain && (
          <div className="text-sm text-slate-700">
            <b>Organización:</b> {orgName}
          </div>
        )}

        <div className="text-sm text-slate-700">
          <b>Modo:</b> {trackerDomain ? "Tracker" : "Panel"}
        </div>

        <div className="text-xs text-slate-500">
          authReady: <b>{String(authReady)}</b> · roles: <b>{rolesCount}</b> · orgs:{" "}
          <b>{orgCount}</b>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex flex-wrap gap-3">
        {!trackerDomain && (
          <>
            <button
              onClick={() => navigate("/geocercas")}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Ir a Geocercas
            </button>

            <button
              onClick={() => navigate("/personal")}
              className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900"
            >
              Ir a Personal
            </button>

            <button
              onClick={() => navigate("/asignaciones")}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Ir a Asignaciones
            </button>

            <button
              onClick={() => navigate("/costos")}
              className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700"
            >
              Ir a Costos
            </button>
          </>
        )}

        {/* Tracker: lo mostramos en ambos modos si existe la ruta */}
        <button
          onClick={() => navigate("/tracker-gps")}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          Abrir Tracker
        </button>
      </div>

      <div className="text-xs text-slate-500">
        Tip: si algo queda trabado en permisos, abre consola y revisa{" "}
        <code>window.__SUPABASE_AUTH_DEBUG</code> (si lo mantuviste en AuthContext).
      </div>
    </div>
  );
}
