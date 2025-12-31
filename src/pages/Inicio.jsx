// src/pages/Inicio.jsx
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Inicio() {
  const navigate = useNavigate();

  const { authReady, user, currentOrg, currentRole, bestRole, orgs, trackerDomain } = useAuth();

  // 1) hidratación
  if (!authReady) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        Resolviendo permisos...
      </div>
    );
  }

  // 2) no logueado (blindaje)
  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        Inicia sesión para continuar.
      </div>
    );
  }

  // 3) rol aún no resuelto
  const roleLower = String(currentRole || bestRole || "").toLowerCase().trim();
  if (!roleLower) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        Resolviendo permisos...
      </div>
    );
  }

  // 4) si es panel y aún no hay org
  if (!trackerDomain && roleLower !== "tracker" && !currentOrg) {
    const orgCount = Array.isArray(orgs) ? orgs.length : 0;
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-slate-600 px-4 text-center gap-2">
        <div className="text-slate-500">Preparando organización...</div>
        <div className="text-xs text-slate-500">
          {orgCount === 0
            ? "Tu usuario aún no tiene una organización asignada o no hay visibilidad por RLS."
            : "Seleccionando organización activa..."}
        </div>

        <button
          className="mt-3 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          onClick={() => window.location.reload()}
        >
          Reintentar
        </button>
      </div>
    );
  }

  const roleLabel = useMemo(() => {
    if (roleLower === "owner") return "Owner";
    if (roleLower === "admin") return "Admin";
    if (roleLower === "viewer") return "Viewer";
    if (roleLower === "tracker") return "Tracker";
    return roleLower || "-";
  }, [roleLower]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Bienvenido a App Geocercas</h1>
        <p className="text-slate-600 mt-1">
          Sesión iniciada como <b>{roleLabel}</b>
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-2">
        <div className="text-sm text-slate-700">
          <b>Email:</b> {user.email}
        </div>

        {!trackerDomain && roleLower !== "tracker" && (
          <div className="text-sm text-slate-700">
            <b>Organización:</b>{" "}
            {currentOrg?.name || currentOrg?.org_name || currentOrg?.id || "(sin nombre)"}
          </div>
        )}

        <div className="text-sm text-slate-700">
          <b>Modo:</b> {trackerDomain || roleLower === "tracker" ? "Tracker" : "Panel"}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {roleLower !== "tracker" && (
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
          </>
        )}

        {roleLower === "tracker" && (
          <button
            onClick={() => navigate("/tracker-gps")}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            Abrir Tracker
          </button>
        )}
      </div>
    </div>
  );
}
