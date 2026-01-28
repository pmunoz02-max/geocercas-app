// src/pages/Inicio.jsx
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function HelpCard({ title, description, to }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div
      onClick={() => navigate(to)}
      className="cursor-pointer rounded-2xl border border-slate-200 bg-white shadow-sm p-6 hover:shadow-md transition"
    >
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <div className="mt-4 text-sm font-medium text-blue-600">
        {t("home.open", { defaultValue: "Abrir →" })}
      </div>
    </div>
  );
}

export default function Inicio() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loading, user, role, currentOrg, isAuthenticated } = useAuth();

  // 1) Esperar SOLO el boot auth
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        {t("home.loadingPermissions", { defaultValue: "Resolviendo permisos…" })}
      </div>
    );
  }

  // 2) No autenticado
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center gap-3 text-slate-600">
        {t("home.loginToContinue", { defaultValue: "Inicia sesión para continuar." })}
        <button
          className="px-3 py-2 rounded-lg bg-blue-600 text-white"
          onClick={() => navigate("/login")}
        >
          {t("home.goToLogin", { defaultValue: "Ir a Login" })}
        </button>
      </div>
    );
  }

  const roleLower = useMemo(
    () => String(role || "").toLowerCase(),
    [role]
  );

  // 3) Contexto incompleto (pero NO spinner infinito)
  if (!roleLower || !currentOrg?.id) {
    return (
      <div className="max-w-xl mx-auto px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <h1 className="text-xl font-semibold">
            Sesión iniciada, pero falta contexto
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Email: <b>{user.email}</b>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Rol: <b>{roleLower || "(vacío)"}</b>
          </p>
          <button
            className="mt-4 px-4 py-2 rounded-lg bg-slate-900 text-white"
            onClick={() => window.location.reload()}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // 4) HOME OK
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <h1 className="text-2xl font-semibold">
          {t("home.welcome", { defaultValue: "Bienvenido a App Geocercas" })}
        </h1>
        <p className="mt-2 text-slate-600">
          Sesión como <b>{roleLower}</b>
        </p>
        <div className="mt-4 text-sm text-slate-700">
          <div>Email: {user.email}</div>
          <div>Org: {currentOrg.name}</div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">
          {t("home.help.title", { defaultValue: "Centro de ayuda" })}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <HelpCard title="Guía rápida" description="Cómo usar la app." to="/help/instructions" />
          <HelpCard title="FAQ" description="Preguntas frecuentes." to="/help/faq" />
          <HelpCard title="Soporte" description="Contacta al soporte." to="/help/support" />
          <HelpCard title="Novedades" description="Cambios recientes." to="/help/changelog" />
        </div>
      </div>
    </div>
  );
}
