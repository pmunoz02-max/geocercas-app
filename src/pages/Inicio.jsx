// src/pages/Inicio.jsx
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function HelpCard({ title, description, to }) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(to)}
      className="
        cursor-pointer
        rounded-2xl
        border border-slate-200
        bg-white
        shadow-sm
        p-6
        hover:shadow-md
        hover:border-slate-300
        transition
      "
    >
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <div className="mt-4 text-sm font-medium text-blue-600">
        Abrir →
      </div>
    </div>
  );
}

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
        Resolviendo permisos…
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

  // 4) Estado anómalo (sesión sin rol u org)
  if (!roleLower || !currentOrgId) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">
            Sesión iniciada, pero falta contexto
          </h1>

          <p className="text-sm text-slate-600">
            La sesión existe ({user.email}), pero aún no se pudo determinar
            tu rol u organización activa.
          </p>

          <div className="text-sm text-slate-700 space-y-1">
            <div><b>Email:</b> {user.email}</div>
            <div><b>Organización:</b> (no resuelta)</div>
            <div><b>Rol:</b> (vacío)</div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
              onClick={() => window.location.reload()}
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 5) HOME normal (SIN botones de navegación)
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      {/* Bienvenida */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Bienvenido a App Geocercas
        </h1>

        <p className="text-slate-600 mt-2">
          Sesión iniciada como <b>{roleLower}</b>
        </p>

        <div className="mt-4 text-sm text-slate-700 space-y-1">
          <div><b>Email:</b> {user.email}</div>
          <div><b>Organización ID:</b> {currentOrgId}</div>
        </div>
      </div>

      {/* Centro de ayuda */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Centro de ayuda
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <HelpCard
            title="Guía rápida"
            description="Aprende cómo usar la app paso a paso."
            to="/help/instructions"
          />

          <HelpCard
            title="Preguntas frecuentes"
            description="Respuestas a las dudas más comunes."
            to="/help/faq"
          />

          <HelpCard
            title="Soporte"
            description="¿Tienes un problema o consulta? Contáctanos."
            to="/help/support"
          />

          <HelpCard
            title="Novedades"
            description="Cambios, mejoras y actualizaciones recientes."
            to="/help/changelog"
          />
        </div>
      </div>
    </div>
  );
}
