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
        "px-3 py-1.5 rounded-full text-xs font-bold transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70",
        active
          ? "bg-emerald-500 text-slate-950"
          : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10"
      )}
      aria-pressed={active}
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
    i18n.changeLanguage(code); // persistencia la hace src/i18n/index.js
  };

  return (
    <div className="flex items-center gap-1 p-1 rounded-full bg-white/5 border border-white/10">
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
      className="
        text-left w-full
        rounded-3xl border border-white/10 bg-white/5
        p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]
        hover:bg-white/10 transition
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70
      "
    >
      {badge ? (
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs text-white/70">
          {badge}
        </div>
      ) : null}

      <h3 className="mt-4 text-lg font-extrabold text-white">{title}</h3>
      <p className="mt-2 text-sm text-white/70 leading-relaxed">{description}</p>

      <div className="mt-4 text-sm font-bold text-emerald-300">{cta}</div>
    </button>
  );
}

export default function Inicio() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loading, user, role, currentOrg, isAuthenticated } = useAuth();

  const roleLower = useMemo(() => String(role || "").toLowerCase(), [role]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-white/70">
        {t("inicio.loadingPermissions", { defaultValue: "Resolving permissions…" })}
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center gap-3 text-white/70">
        {t("inicio.loginToContinue", { defaultValue: "Please login to continue." })}
        <button
          className="px-4 py-2 rounded-2xl font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition"
          onClick={() => navigate("/login")}
        >
          {t("inicio.goToLogin", { defaultValue: "Go to Login" })}
        </button>
      </div>
    );
  }

  if (!roleLower || !currentOrg?.id) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-extrabold text-white">
              {t("inicio.missingContextTitle", { defaultValue: "Logged in, but context is missing" })}
            </h1>
            <InlineLanguageSwitcher />
          </div>

          <div className="mt-4 text-sm text-white/70 space-y-1">
            <div>
              {t("inicio.userInfo.userLabel", { defaultValue: "User:" })}{" "}
              <b className="text-white">{user.email}</b>
            </div>
            <div>
              {t("inicio.userInfo.withRole", { defaultValue: "Role:" })}{" "}
              <b className="text-white">{roleLower || t("inicio.roleEmpty", { defaultValue: "(empty)" })}</b>
            </div>
            <div>
              {t("inicio.userInfo.inOrg", { defaultValue: "Organization:" })}{" "}
              <b className="text-white">
                {currentOrg?.name || t("inicio.orgNotResolved", { defaultValue: "(not resolved)" })}
              </b>
            </div>
          </div>

          <button
            className="mt-6 px-4 py-2 rounded-2xl font-bold bg-white text-slate-950 hover:bg-white/90 transition"
            onClick={() => window.location.reload()}
          >
            {t("inicio.retry", { defaultValue: "Retry" })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/70">
            {t("inicio.header.badge", { defaultValue: "Help Center & Resources" })}
          </div>

          <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold text-white">
            {t("inicio.header.title", { defaultValue: "Welcome to your dashboard" })}
          </h1>

          <p className="mt-2 text-white/70">
            {t("inicio.header.subtitle", {
              defaultValue: "From here you can access instructions, FAQ, support and updates for App Geocercas.",
            })}
          </p>
        </div>

        <div className="shrink-0">
          <InlineLanguageSwitcher />
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="text-sm text-white/70 space-y-1">
          <div>
            {t("inicio.userInfo.connectedAs", { defaultValue: "Connected as" })}:{" "}
            <b className="text-white">{user.email}</b>
          </div>
          <div>
            {t("inicio.userInfo.withRole", { defaultValue: "with role" })}:{" "}
            <b className="text-white">{roleLower}</b>
          </div>
          <div>
            {t("inicio.userInfo.inOrg", { defaultValue: "in organization" })}:{" "}
            <b className="text-white">{currentOrg?.name}</b>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-extrabold text-white mb-4">
          {t("inicio.cardsTitle", { defaultValue: "Quick links" })}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <HelpCard
            badge={t("inicio.cards.instrucciones.badge", { defaultValue: "Quick Guide" })}
            title={t("inicio.cards.instrucciones.title", { defaultValue: "Instructions" })}
            description={t("inicio.cards.instrucciones.body", { defaultValue: "Step-by-step setup." })}
            cta={t("inicio.cards.instrucciones.cta", { defaultValue: "View instructions →" })}
            to="/help/instructions"
          />
          <HelpCard
            badge={t("inicio.cards.faq.badge", { defaultValue: "Help" })}
            title={t("inicio.cards.faq.title", { defaultValue: "FAQ" })}
            description={t("inicio.cards.faq.body", { defaultValue: "Quick answers." })}
            cta={t("inicio.cards.faq.cta", { defaultValue: "View FAQ →" })}
            to="/help/faq"
          />
          <HelpCard
            badge={t("inicio.cards.soporte.badge", { defaultValue: "Support" })}
            title={t("inicio.cards.soporte.title", { defaultValue: "Support" })}
            description={t("inicio.cards.soporte.body", { defaultValue: "Contact support." })}
            cta={t("inicio.cards.soporte.cta", { defaultValue: "Open support →" })}
            to="/help/support"
          />
          <HelpCard
            badge={t("inicio.cards.novedades.badge", { defaultValue: "Updates" })}
            title={t("inicio.cards.novedades.title", { defaultValue: "Changelog" })}
            description={t("inicio.cards.novedades.body", { defaultValue: "What’s new." })}
            cta={t("inicio.cards.novedades.cta", { defaultValue: "View changelog →" })}
            to="/help/changelog"
          />
        </div>

        <div className="mt-8 flex items-center gap-3">
          <button
            className="px-4 py-2 rounded-2xl font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition"
            onClick={() => navigate("/geocerca")}
          >
            {t("app.tabs.geocercas", { defaultValue: "Geofences" })}
          </button>
          <button
            className="px-4 py-2 rounded-2xl font-bold bg-white/5 text-white border border-white/10 hover:bg-white/10 transition"
            onClick={() => navigate("/personal")}
          >
            {t("app.tabs.personal", { defaultValue: "Staff" })}
          </button>
        </div>
      </div>
    </div>
  );
}
