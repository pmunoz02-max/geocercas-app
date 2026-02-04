// src/pages/Inicio.jsx
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function cx(...arr) {
  return arr.filter(Boolean).join(" ");
}

function LangButton({ lng, current, onClick }) {
  const active = current === lng;
  return (
    <button
      type="button"
      onClick={() => onClick(lng)}
      className={cx(
        "px-3 py-1.5 rounded-full text-xs font-bold tracking-wide transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60",
        active
          ? "bg-emerald-600 text-white shadow-sm"
          : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
      )}
      aria-pressed={active}
      aria-label={`Language ${lng}`}
    >
      {lng.toUpperCase()}
    </button>
  );
}

function InlineLanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = String(i18n.language || "es").slice(0, 2);

  const setLang = (lng) => {
    const code = String(lng || "es").toLowerCase().slice(0, 2);
    if (!["es", "en", "fr"].includes(code)) return;
    i18n.changeLanguage(code); // persistencia la maneja src/i18n/index.js
  };

  return (
    <div className="flex items-center gap-1 p-1 rounded-full bg-white border border-slate-200 shadow-sm">
      <LangButton lng="es" current={current} onClick={setLang} />
      <LangButton lng="en" current={current} onClick={setLang} />
      <LangButton lng="fr" current={current} onClick={setLang} />
    </div>
  );
}

function HelpCard({ badge, title, description, cta, to }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={cx(
        "text-left w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition",
        "hover:shadow-md hover:border-slate-300",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
      )}
    >
      {badge ? (
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-600">
          {badge}
        </div>
      ) : null}

      <h3 className="mt-4 text-lg font-extrabold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600 leading-relaxed">{description}</p>

      <div className="mt-4 text-sm font-bold text-emerald-700">{cta}</div>
    </button>
  );
}

export default function Inicio() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loading, user, role, currentOrg, isAuthenticated } = useAuth();

  const roleLower = useMemo(() => String(role || "").toLowerCase(), [role]);

  // 1) Esperar SOLO el boot auth
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-600">
        {t("inicio.loadingPermissions", { defaultValue: "Resolviendo permisos…" })}
      </div>
    );
  }

  // 2) No autenticado
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center gap-3 text-slate-700">
        {t("inicio.loginToContinue", { defaultValue: "Inicia sesión para continuar." })}
        <button
          className="px-4 py-2 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition"
          onClick={() => navigate("/login")}
        >
          {t("inicio.goToLogin", { defaultValue: "Ir a Login" })}
        </button>
      </div>
    );
  }

  // 3) Contexto incompleto
  if (!roleLower || !currentOrg?.id) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-extrabold text-slate-900">
              {t("inicio.missingContextTitle", { defaultValue: "Sesión iniciada, pero falta contexto" })}
            </h1>
            <InlineLanguageSwitcher />
          </div>

          <div className="mt-4 text-sm text-slate-700 space-y-1">
            <div>
              {t("inicio.userInfo.userLabel", { defaultValue: "Usuario:" })}{" "}
              <b className="text-slate-900">{user.email}</b>
            </div>
            <div>
              {t("inicio.userInfo.withRole", { defaultValue: "Rol:" })}{" "}
              <b className="text-slate-900">{roleLower || t("inicio.roleEmpty", { defaultValue: "(vacío)" })}</b>
            </div>
            <div>
              {t("inicio.userInfo.inOrg", { defaultValue: "Organización:" })}{" "}
              <b className="text-slate-900">
                {currentOrg?.name || t("inicio.orgNotResolved", { defaultValue: "(no resuelta)" })}
              </b>
            </div>
          </div>

          <button
            className="mt-6 px-4 py-2 rounded-xl font-bold bg-slate-900 text-white hover:bg-slate-800 transition"
            onClick={() => window.location.reload()}
          >
            {t("inicio.retry", { defaultValue: "Reintentar" })}
          </button>
        </div>
      </div>
    );
  }

  // 4) HOME OK (Centro de ayuda)
  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-0 py-6 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-slate-200 text-xs text-slate-600 shadow-sm">
            {t("inicio.header.badge", { defaultValue: "Centro de ayuda y recursos" })}
          </div>

          <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold text-slate-900">
            {t("inicio.header.title", { defaultValue: "Bienvenido a tu panel" })}
          </h1>

          <p className="mt-2 text-slate-600 max-w-3xl">
            {t("inicio.header.subtitle", {
              defaultValue:
                "Desde aquí puedes acceder a instrucciones, FAQ, soporte y novedades de App Geocercas.",
            })}
          </p>
        </div>

        <div className="shrink-0">
          <InlineLanguageSwitcher />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-slate-700 space-y-1">
          <div>
            {t("inicio.userInfo.connectedAs", { defaultValue: "Sesión como" })}:{" "}
            <b className="text-slate-900">{roleLower}</b>
          </div>
          <div>
            {t("inicio.userInfo.userLabel", { defaultValue: "Email:" })}{" "}
            <b className="text-slate-900">{user.email}</b>
          </div>
          <div>
            {t("inicio.userInfo.inOrg", { defaultValue: "Org:" })}{" "}
            <b className="text-slate-900">{currentOrg?.name}</b>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 mb-4">
          {t("inicio.cardsTitle", { defaultValue: "Accesos rápidos" })}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <HelpCard
            badge={t("inicio.cards.instrucciones.badge", { defaultValue: "Guía rápida" })}
            title={t("inicio.cards.instrucciones.title", { defaultValue: "Instrucciones" })}
            description={t("inicio.cards.instrucciones.body", {
              defaultValue: "Configura organizaciones, geocercas, personal, actividades y trackers.",
            })}
            cta={t("inicio.cards.instrucciones.cta", { defaultValue: "Ver instrucciones →" })}
            to="/help/instructions"
          />

          <HelpCard
            badge={t("inicio.cards.faq.badge", { defaultValue: "Ayuda" })}
            title={t("inicio.cards.faq.title", { defaultValue: "Preguntas frecuentes" })}
            description={t("inicio.cards.faq.body", {
              defaultValue: "Respuestas rápidas sobre roles, invitaciones y uso del tracker.",
            })}
            cta={t("inicio.cards.faq.cta", { defaultValue: "Ver FAQ →" })}
            to="/help/faq"
          />

          <HelpCard
            badge={t("inicio.cards.soporte.badge", { defaultValue: "Soporte" })}
            title={t("inicio.cards.soporte.title", { defaultValue: "Contacto / Soporte" })}
            description={t("inicio.cards.soporte.body", {
              defaultValue: "¿Necesitas ayuda? Escríbenos para soporte técnico o dudas de tu cuenta.",
            })}
            cta={t("inicio.cards.soporte.cta", { defaultValue: "Abrir soporte →" })}
            to="/help/support"
          />

          <HelpCard
            badge={t("inicio.cards.novedades.badge", { defaultValue: "Novedades" })}
            title={t("inicio.cards.novedades.title", { defaultValue: "Novedades / Changelog" })}
            description={t("inicio.cards.novedades.body", {
              defaultValue: "Mejoras, correcciones y nuevas funcionalidades.",
            })}
            cta={t("inicio.cards.novedades.cta", { defaultValue: "Ver changelog →" })}
            to="/help/changelog"
          />

          {/* Opcionales si existen en JSON */}
          <HelpCard
            badge={t("inicio.cards.videoDemo.badge", { defaultValue: "Video" })}
            title={t("inicio.cards.videoDemo.title", { defaultValue: "Video demo" })}
            description={t("inicio.cards.videoDemo.body", {
              defaultValue: "Mira una demostración breve en uso real.",
            })}
            cta={t("inicio.cards.videoDemo.cta", { defaultValue: "Ver video →" })}
            to="/help/changelog"
          />

          <HelpCard
            badge={t("inicio.cards.queEs.badge", { defaultValue: "Info" })}
            title={t("inicio.cards.queEs.title", { defaultValue: "¿Qué es App Geocercas?" })}
            description={t("inicio.cards.queEs.body", {
              defaultValue: "Visión, casos de uso y beneficios para tu organización.",
            })}
            cta={t("inicio.cards.queEs.cta", { defaultValue: "Saber más →" })}
            to="/help/faq"
          />
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            className="px-4 py-2 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition"
            onClick={() => navigate("/geocerca")}
          >
            {t("app.tabs.geocercas", { defaultValue: "Geocercas" })}
          </button>
          <button
            className="px-4 py-2 rounded-xl font-bold bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 transition"
            onClick={() => navigate("/personal")}
          >
            {t("app.tabs.personal", { defaultValue: "Personal" })}
          </button>
        </div>
      </div>
    </div>
  );
}
