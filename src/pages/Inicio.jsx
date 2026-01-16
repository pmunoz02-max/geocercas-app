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
        {t("home.open", { defaultValue: "Abrir →" })}
      </div>
    </div>
  );
}

export default function Inicio() {
  const navigate = useNavigate();
  const { t } = useTranslation();

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
        {t("home.loadingPermissions", { defaultValue: "Resolviendo permisos…" })}
      </div>
    );
  }

  // 2) No autenticado → login
  if (!authenticated || !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-600">
        {t("home.loginToContinue", { defaultValue: "Inicia sesión para continuar." })}
        <button
          className="ml-3 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          onClick={() => navigate("/login")}
        >
          {t("home.goToLogin", { defaultValue: "Ir a Login" })}
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
            {t("home.missingContextTitle", { defaultValue: "Sesión iniciada, pero falta contexto" })}
          </h1>

          <p className="text-sm text-slate-600">
            {t("home.missingContextBody", { defaultValue: "La sesión existe ({{email}}), pero aún no se pudo determinar tu rol u organización activa.", email: user.email })}
          </p>

          <div className="text-sm text-slate-700 space-y-1">
            <div><b>{t("home.labels.email", { defaultValue: "Email:" })}</b> {user.email}</div>
            <div><b>{t("home.labels.organization", { defaultValue: "Organización:" })}</b> {t("home.orgNotResolved", { defaultValue: "(no resuelta)" })}</div>
            <div><b>{t("home.labels.role", { defaultValue: "Rol:" })}</b> {t("home.roleEmpty", { defaultValue: "(vacío)" })}</div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              className="px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
              onClick={() => window.location.reload()}
            >
              {t("home.retry", { defaultValue: "Reintentar" })}
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
          {t("home.welcome", { defaultValue: "Bienvenido a App Geocercas" })}
        </h1>

        <p className="text-slate-600 mt-2">
          {t("home.sessionAs", { defaultValue: "Sesión iniciada como" })} <b>{roleLower}</b>
        </p>

        <div className="mt-4 text-sm text-slate-700 space-y-1">
          <div><b>{t("home.labels.email", { defaultValue: "Email:" })}</b> {user.email}</div>
          <div><b>{t("home.labels.orgId", { defaultValue: "Organización ID:" })}</b> {currentOrgId}</div>
        </div>
      </div>

      {/* {t("home.help.title", { defaultValue: "Centro de ayuda" })} */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          {t("home.help.title", { defaultValue: "Centro de ayuda" })}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <HelpCard
            title={t("home.help.quick", { defaultValue: "Guía rápida" })}
            description={t("home.help.quickDesc", { defaultValue: "Aprende cómo usar la app paso a paso." })}
            to="/help/instructions"
          />

          <HelpCard
            title={t("home.help.faq", { defaultValue: "Preguntas frecuentes" })}
            description={t("home.help.faqDesc", { defaultValue: "Respuestas a las dudas más comunes." })}
            to="/help/faq"
          />

          <HelpCard
            title={t("home.help.support", { defaultValue: "Soporte" })}
            description={t("home.help.supportDesc", { defaultValue: "¿Tienes un problema o consulta? Contáctanos." })}
            to="/help/support"
          />

          <HelpCard
            title={t("home.help.news", { defaultValue: "Novedades" })}
            description={t("home.help.newsDesc", { defaultValue: "Cambios, mejoras y actualizaciones recientes." })}
            to="/help/changelog"
          />
        </div>
      </div>
    </div>
  );
}
