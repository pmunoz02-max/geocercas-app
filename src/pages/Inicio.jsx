// src/pages/Inicio.jsx
import React, { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Inicio() {
  const navigate = useNavigate();

  const {
    authReady,
    user,
    currentOrg,
    currentRole, // viene NORMALIZADO desde AuthContext
    bestRole,    // fallback de seguridad
    orgs,
    trackerDomain,
  } = useAuth();

  // ===============================
  // 1) Estado de hidratación
  // ===============================
  if (!authReady) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        Resolviendo permisos...
      </div>
    );
  }

  // ===============================
  // 2) Usuario no logueado (blindaje)
  // ===============================
  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        Inicia sesión para continuar.
      </div>
    );
  }

  // ===============================
  // 3) Rol efectivo (robusto)
  // ===============================
  const roleLower = String(currentRole || bestRole || "")
    .toLowerCase()
    .trim();

  // Si aún no hay rol resuelto → loader
  if (!roleLower) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        Resolviendo permisos...
      </div>
    );
  }

  // ===============================
  // 4) Organización aún no resuelta
  // ===============================
  if (!trackerDomain && !currentOrg) {
    const orgCount = Array.isArray(orgs) ? orgs.length : 0;

    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-slate-600 px-4 text-center gap-2">
        <div className="text-slate-500">Preparando organización…</div>
        <div className="text-sm text-slate-500">
          {orgCount === 0
            ? "Tu usuario aún no tiene una organización asignada."
            : "Seleccionando organización activa…"}
        </div>
      </div>
    );
  }

  // ===============================
  // 5) Etiqueta de rol (UI)
  // ===============================
  const roleLabel = useMemo(() => {
    if (roleLower === "owner") return "Owner";
    if (roleLower === "admin") return "Admin";
    if (roleLower === "viewer") return "Viewer";
    if (roleLower === "tracker") return "Tracker";
    return roleLower;
  }, [roleLower]);

  // ===============================
  // 6) Render principal
  // ===============================
  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold text-slate-800 mb-2">
        Bienvenido a App Geocercas
      </h1>

      <p className="text-slate-600 mb-6">
        Sesión iniciada como <b>{roleLabel}</b>
      </p>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
        <div className="text-sm text-slate-600">
          <b>Email:</b> {user.email}
        </div>

        {!trackerDomain && currentOrg && (
          <div className="text-sm text-slate-600">
            <b>Organización:</b>{" "}
            {currentOrg.name || currentOrg.org_name || currentOrg.id}
          </div>
        )}

        <div className="text-sm text-slate-600">
          <b>Modo:</b> {trackerDomain ? "Tracker" : "Panel"}
        </div>
      </div>

      {/* Acciones base */}
      <div className="mt-6 flex flex-wrap gap-3">
        {!trackerDomain && (
          <button
            onClick={() => navigate("/geocercas")}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Ir a Geocercas
          </button>
        )}

        {trackerDomain && (
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
